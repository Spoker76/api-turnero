const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

const dbConfig = {
    host: 'bvh0w4w4ogz2mcqxgnae-mysql.services.clever-cloud.com',
    user: 'u8fvjqfnoqh44je4',
    password: '2o0LQ9IYnJL0PS2DkLck',
    database: 'bvh0w4w4ogz2mcqxgnae'
};

app.post('/api/tickets', async (req, res) => {
    const { nombre, documento, codigo, id_tipoTramite, id_prioridad, id_estado } = req.body;

    try {
        const connection = await mysql.createConnection(dbConfig);

        const query = `
            INSERT INTO ticket (codigo, nombre, documento, id_tipoTramite, id_prioridad, id_estado)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const [result] = await connection.execute(query, [codigo, nombre, documento, id_tipoTramite, id_prioridad, id_estado]);

        await connection.end();

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
            SELECT codigo FROM ticket WHERE id_estado = 1 AND DATE(createdAt) = CURDATE() ORDER BY createdAt DESC LIMIT 1;
        `;

        const [result] = await connection.execute(query);

        await connection.end();

        res.status(201).send({ message: 'INFO:: Ultimo ticket obtenido con éxito', result });
    } catch (error) {
        console.error('ERROR:: Error al obtener el ultimo ticket:', error);
        res.status(500).send('Error al obtener el codigo del último ticket!');
    }
});

app.post('/api/tickets-per-process', async (req, res) => {
    const { tramite } = req.body;

    try {
        const connection = await mysql.createConnection(dbConfig);

        const query = `
            SELECT id_ticket, codigo, nombre, documento, id_prioridad, id_tipoTramite, createdAt
            FROM ticket 
            WHERE id_tipoTramite = ?
            ORDER BY createdAt ASC;
        `;

        const [result] = await connection.execute(query, [tramite]);

        await connection.end();

        const priority1Tickets = result.filter(ticket => ticket.id_prioridad === 1);
        const otherPriorityTickets = result.filter(ticket => ticket.id_prioridad !== 1);

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

        res.status(201).send({ message: 'INFO:: Tickets obtenidos', result: orderedTickets });
    } catch (error) {
        console.error('ERROR:: Error al obtener los tickets:', error);
        res.status(500).send('Error al obtener los tickets!');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`INFO:: Servidor corriendo en el puerto --- ${PORT}`);
});