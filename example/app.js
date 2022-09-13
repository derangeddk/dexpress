import express from '../index.js';
import z from 'zod';

const app = await express({ prometheusMetrics: { port: 5213 } });

app.get('/', (req, res) => {
    req.log.info({ hello: 123 }, "Universal request received");
    res.send(`hey my quest ID is ${req.id}`);
});

app.get('/error', (req, res, next) => {
    const er = new Error("hello", { cause: new Error("world") });
    er.additional = "information";
    console.log("er", er.constructor.name, er.name);
    next(er);
});

const validationRequest = z.object({
    message: z.string(),
    numerically: z.number().positive().gt(5).int().optional(),
});
app.post('/validation', express.json(), (req, res) => {
    const body = validationRequest.parse(req.body);
    res.send(body);
});

app.get('/async', async (req, res) => {
    await thisMethodErrors();
    res.send("somehow returned without failing?? bad");
});

async function thisMethodErrors() {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    throw new Error("Task failed succesfully!");
}

const server = app.listen(5212, () => console.log("Server listening on localhost:5212"));

const close = () => server.close(() => console.log("Server closed -- exiting now"));

process.on('SIGINT', close);
process.on('SIGTERM', close);
