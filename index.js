import express from 'express';
import setUpApplicationDefaults from './setUpApplicationDefaults.js';

async function proxy(config = { }) {
    const app = express.apply(express);

    //TODO: setUpAppDefaults is async, should we await here? Probably, order is significant.
    // hmmmmmmm maybe improve?
    await setUpApplicationDefaults(app, config);
    return app;
}

Object.entries(express).forEach(([ key, value ]) => proxy[key] = value);

proxy.deprecated = (req, res, next) => {
    req.log.warn('Deprecated endpoint hit');
    next();
}

export default proxy;
