const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const moment = require('moment-timezone');
const app = express();

app.use(express.json());

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Access-Control-Allow-Private-Network'],
    preflightContinue: true
}));

app.options('*', (req, res) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(204);
});

function formatDateToMySQL(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const dbConfig = {
    host: 'db4free.net',
    port: '3306',
    user: 'adminturnerodb',
    password: 'adminturnerodb',
    database: 'dbturnerotbox'
};

let ticketQueue = [];

const cleanUpOldTickets = () => {
    const today = moment().tz('America/Tegucigalpa').format('YYYY-MM-DD');
    ticketQueue = ticketQueue.filter(ticket => moment(ticket.createdAt).format('YYYY-MM-DD') === today);
};

const insertTicketInOrder = (newTicket) => {
    let inserted = false;
    for (let i = 0; i < ticketQueue.length; i++) {
        if (new Date(newTicket.createdAt) < new Date(ticketQueue[i].createdAt)) {
            ticketQueue.splice(i, 0, newTicket);
            inserted = true;
            break;
        }
    }
    if (!inserted) {
        ticketQueue.push(newTicket);
    }
};

const reorderTicketQueue = () => {
    const priority1Tickets = ticketQueue.filter(t => t.id_prioridad === 1);
    const otherPriorityTickets = ticketQueue.filter(t => t.id_prioridad !== 1);
    let orderedTickets = [];
    let otherPriorityIndex = 0;
    for (let i = 0; i < priority1Tickets.length; i++) {
        orderedTickets.push(priority1Tickets[i]);
        if ((i + 1) % 3 === 0 && otherPriorityIndex < otherPriorityTickets.length) {
            orderedTickets.push(otherPriorityTickets[otherPriorityIndex]);
            otherPriorityIndex++;
        }
    }
    if (otherPriorityIndex < otherPriorityTickets.length) {
        orderedTickets = [...orderedTickets, ...otherPriorityTickets.slice(otherPriorityIndex)];
    }
    ticketQueue = orderedTickets;
};

app.post('/api/tickets', async (req, res) => {
    let { nombre, documento, codigo, id_tipoTramite, id_prioridad, id_estado, createdAt } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        createdAt = formatDateToMySQL(createdAt);
        const query = `
            INSERT INTO ticket (codigo, nombre, documento, createdAt, id_tipoTramite, id_prioridad, id_estado)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await connection.execute(query, [codigo, nombre, documento, createdAt, id_tipoTramite, id_prioridad, id_estado]);
        await connection.end();
        const newTicket = {
            id_ticket: result.insertId,
            codigo,
            nombre,
            documento,
            createdAt,
            id_tipoTramite,
            id_prioridad,
            id_estado
        };
        cleanUpOldTickets();
        insertTicketInOrder(newTicket);
        reorderTicketQueue();
        res.status(201).send({ message: 'INFO:: Ticket creado', id_ticket: result.insertId });
    } catch (error) {
        console.error('ERROR:: Error al insertar el ticket:', error);
        res.status(500).send('Error al insertar el ticket!');
    }
});

app.get('/api/last-ticket', async (req, res) => {
    try {
        const { fecha } = req.query;
        if (!fecha) {
            return res.status(400).send('ERROR:: Se requiere una fecha válida');
        }
        const regexFecha = /^\d{4}-\d{2}-\d{2}$/;
        if (!regexFecha.test(fecha)) {
            return res.status(400).send('ERROR:: Formato de fecha no válido. Utiliza YYYY-MM-DD.');
        }
        const connection = await mysql.createConnection(dbConfig);
        const query = `
            SELECT codigo FROM ticket WHERE DATE(createdAt) = ? ORDER BY createdAt DESC LIMIT 1;
        `;
        const [result] = await connection.execute(query, [fecha]);
        await connection.end();
        res.status(201).send({ message: 'INFO:: Último ticket obtenido con éxito', result });
    } catch (error) {
        console.error('ERROR:: Error al obtener el último ticket:', error);
        res.status(500).send('Error al obtener el código del último ticket!');
    }
});

app.post('/api/tickets-per-process', async (req, res) => {
    const { tramite } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = `
            SELECT 
                t.id_ticket, 
                t.codigo, 
                t.nombre, 
                t.documento, 
                t.createdAt, 
                p.prioridad, 
                e.estado, 
                tt.tipoTramite 
            FROM 
                ticket t
            INNER JOIN 
                ctg_prioridades p ON t.id_prioridad = p.id_prioridad
            INNER JOIN 
                ctg_estado e ON t.id_estado = e.id_estado
            INNER JOIN 
                ctg_tramites tt ON t.id_tipoTramite = tt.id_tipoTramite
            WHERE 
                t.id_tipoTramite = ?
            AND 
                t.id_estado = 1
            ORDER BY 
                t.createdAt ASC
        `;
        const [rows] = await connection.execute(query, [tramite]);
        await connection.end();
        res.status(201).send({ message: 'INFO:: Tickets enviados', result: rows });
    } catch (error) {
        console.error('ERROR:: Error al enviar los tickets:', error);
        res.status(500).send('Error al enviar los tickets!');
    }
});

app.put('/api/tickets', async (req, res) => {
    const { id, state, asignado } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const query = `
            UPDATE ticket 
            SET id_estado = ?, asignado = ?
            WHERE id_ticket = ?
        `;
        const [result] = await connection.execute(query, [state, asignado, id]);
        await connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).send({ message: 'No se encontró ningún ticket con el id proporcionado' });
        }
        ticketQueue = ticketQueue.map(ticket => {
            if (ticket.id_ticket === id) {
                return { ...ticket, id_estado: state, asignado };
            }
            return ticket;
        });
        res.status(200).send({ message: 'INFO:: Ticket actualizado con éxito' });
    } catch (error) {
        console.error('ERROR:: Error al actualizar el ticket:', error);
        res.status(500).send('Error al actualizar el ticket!');
    }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`INFO:: Servidor corriendo en http://${HOST}:${PORT}`);
});
