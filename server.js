const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const moment = require('moment-timezone');
const app = express();

app.use(express.json());
app.use(cors());

const dbConfig = {
    host: 'bvh0w4w4ogz2mcqxgnae-mysql.services.clever-cloud.com',
    user: 'u8fvjqfnoqh44je4',
    password: '2o0LQ9IYnJL0PS2DkLck',
    database: 'bvh0w4w4ogz2mcqxgnae'
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
    const { nombre, documento, codigo, id_tipoTramite, id_prioridad, id_estado } = req.body;

    try {
        const connection = await mysql.createConnection(dbConfig);

        const createdAt = moment().tz('America/Tegucigalpa').format('YYYY-MM-DD HH:mm:ss');

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
        const connection = await mysql.createConnection(dbConfig);

        const query = `
            SELECT codigo FROM ticket WHERE DATE(createdAt) = CURDATE() ORDER BY createdAt DESC LIMIT 1;
        `;

        const [result] = await connection.execute(query);

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
app.listen(PORT, () => {
    console.log(`INFO:: Servidor corriendo en el puerto --- ${PORT}`);
});