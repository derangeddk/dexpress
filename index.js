import express from 'express';
import setUpApplicationDefaults from './setUpApplicationDefaults.js';

async function proxy() {
    const app = express.apply(express, arguments);

    //TODO: setUpAppDefaults is async, should we await here? Probably, order is significant.
    // hmmmmmmm maybe improve?
    await setUpApplicationDefaults(app);
    return app;
}

Object.entries(express).forEach(([ key, value ]) => proxy[key] = value);

proxy.deprecated = (req, res, next) => {
    req.log.warn('Deprecated endpoint hit');
    next();
}

export default proxy;
