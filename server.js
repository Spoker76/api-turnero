const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const moment = require('moment-timezone');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(cors());

const dbConfig = {
    host: 'bvh0w4w4ogz2mcqxgnae-mysql.services.clever-cloud.com',
    user: 'u8fvjqfnoqh44je4',
    password: '2o0LQ9IYnJL0PS2DkLck',
    database: 'bvh0w4w4ogz2mcqxgnae'
};

const sendUpdatedTickets = async () => {
    const connection = await mysql.createConnection(dbConfig);
    const query = `
        SELECT 
            id_ticket, 
            codigo, 
            nombre, 
            documento,
            ticket.id_prioridad,
            ctg_prioridades.prioridad, 
            ctg_tramites.tipoTramite, 
            createdAt
        FROM 
            ticket
        INNER JOIN 
            ctg_prioridades ON ticket.id_prioridad = ctg_prioridades.id_prioridad
        INNER JOIN 
            ctg_tramites ON ticket.id_tipoTramite = ctg_tramites.id_tipoTramite
        WHERE 
            ticket.id_estado = 1
        ORDER BY 
            ticket.createdAt ASC;
    `;
    const [result] = await connection.execute(query);

    const priority1Tickets = result.filter(ticket => ticket.id_prioridad === 1);
    const otherPriorityTickets = result.filter(ticket => ticket.id_prioridad !== 1);
    otherPriorityTickets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

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

    io.emit('updateTickets', orderedTickets);

    await connection.end();
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

        await sendUpdatedTickets();

        res.status(201).send({ message: 'INFO:: Ticket creado', id_ticket: result.insertId });
    } catch (error) {
        console.error('ERROR:: Error al insertar el ticket:', error);
        res.status(500).send('Error al insertar el ticket!');
    }
});

app.post('/api/tickets-per-process', async (req, res) => {
    const { tramite } = req.body;

    try {
        const connection = await mysql.createConnection(dbConfig);

        const query = `
            SELECT 
            id_ticket, 
            codigo, 
            nombre, 
            documento,
            ticket.id_prioridad,
            ctg_prioridades.prioridad, 
            ctg_tramites.tipoTramite, 
            createdAt
        FROM 
            ticket
        INNER JOIN 
            ctg_prioridades ON ticket.id_prioridad = ctg_prioridades.id_prioridad
        INNER JOIN 
            ctg_tramites ON ticket.id_tipoTramite = ctg_tramites.id_tipoTramite
        WHERE 
            ticket.id_tipoTramite = ?
        AND
            ticket.id_estado = 1
        ORDER BY 
            ticket.createdAt ASC;
        `;

        const [result] = await connection.execute(query, [tramite]);

        const priority1Tickets = result.filter(ticket => ticket.id_prioridad === 1);
        const otherPriorityTickets = result.filter(ticket => ticket.id_prioridad !== 1);

        otherPriorityTickets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

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

        res.status(201).send({ message: 'INFO:: Ticket enviado', result: orderedTickets });
    } catch (error) {
        console.error('ERROR:: Error al enviar el ticket:', error);
        res.status(500).send('Error al enviar el ticket!');
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

        await sendUpdatedTickets();

        res.status(200).send({ message: 'INFO:: Ticket actualizado con éxito' });
    } catch (error) {
        console.error('ERROR:: Error al actualizar el ticket:', error);
        res.status(500).send('Error al actualizar el ticket!');
    }
});

io.on('connection', (socket) => {
    console.log('Cliente conectado');

    sendUpdatedTickets();

    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`INFO:: Servidor corriendo en el puerto --- ${PORT}`);
});