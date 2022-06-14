import express from '../index.js';

const app = await express();

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

app.listen(5212);
