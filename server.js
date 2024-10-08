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

// Cola de tickets en tiempo real
let ticketQueue = [];

// Función para limpiar los tickets que no son del día actual
const cleanUpOldTickets = () => {
    const today = moment().tz('America/Tegucigalpa').format('YYYY-MM-DD');
    ticketQueue = ticketQueue.filter(ticket => moment(ticket.createdAt).format('YYYY-MM-DD') === today);
};

// Función para agregar un ticket a la cola y ordenar según las prioridades
const addTicketToQueue = (ticket) => {
    ticketQueue.push(ticket);
    ticketQueue.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Aplicar la regla de priorización: 3 de prioridad normal y 1 de otra prioridad
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

// Endpoint para crear tickets y actualizar la cola
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

        // Limpiar y actualizar la cola de tickets
        cleanUpOldTickets();
        addTicketToQueue(newTicket);

        res.status(201).send({ message: 'INFO:: Ticket creado', id_ticket: result.insertId });
    } catch (error) {
        console.error('ERROR:: Error al insertar el ticket:', error);
        res.status(500).send('Error al insertar el ticket!');
    }
});

// Endpoint para obtener el último ticket
app.get('/api/last-ticket', async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);

        const query = `
            SELECT codigo FROM ticket WHERE id_estado = 1 AND DATE(createdAt) = CURDATE() ORDER BY createdAt DESC LIMIT 1;
        `;

        const [result] = await connection.execute(query);

        await connection.end();

        res.status(201).send({ message: 'INFO:: Último ticket obtenido con éxito', result });
    } catch (error) {
        console.error('ERROR:: Error al obtener el último ticket:', error);
        res.status(500).send('Error al obtener el código del último ticket!');
    }
});

// Endpoint para obtener tickets por proceso (utiliza la cola en tiempo real)
app.post('/api/tickets-per-process', (req, res) => {
    const { tramite } = req.body;

    try {
        const filteredTickets = ticketQueue.filter(ticket => ticket.id_tipoTramite === tramite && ticket.id_estado === 1);
        res.status(201).send({ message: 'INFO:: Tickets enviados', result: filteredTickets });
    } catch (error) {
        console.error('ERROR:: Error al enviar los tickets:', error);
        res.status(500).send('Error al enviar los tickets!');
    }
});

// Endpoint para actualizar el estado del ticket
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

        // Actualizar el ticket en la cola en tiempo real
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