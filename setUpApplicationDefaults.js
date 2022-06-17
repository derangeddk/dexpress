import pino, { stdSerializers } from 'pino-http';
import { v4 as uuidV4 } from 'uuid';
import createErrorSerializer from 'serialize-every-error';
import finalhandler from 'dexpress-finalhandler';
import helmet from 'helmet';
import cors from 'cors';
import prometheus from 'express-prometheus-middleware';
import createHttpError from 'http-errors';
import methods from 'methods';
import asyncHandler from 'express-async-handler';
import express from 'express';

//TODO: better way to handle asynchrony here?

export default async (app, config) => {
    app.use(pino({
        autoLogging: false,
        serializers: {
            ...stdSerializers,
            req: (req) => {
                const serialized = { ...stdSerializers.req(req) };
                if(serialized?.headers?.authorization) {
                    serialized.headers = {
                        ...serialized.headers,
                        authorization: '####REDACTED####',
                    };
                }
                return serialized;
            },
            // TODO: some non-async version of serializer with everything enabled pls
            err: await createErrorSerializer(),
        },
        genReqId: uuidV4,
        wrapSerializers: false,
    }));

    app.use((req, res, next) => {
        req.log.info({ req }, 'New request');

        // An alternative to pino-http autoLogger on the following lines
        // autologger creates new Errors for http 500, which is super bad behavior
        // instead we would probably like to report errors as errors and everything
        // as plain completion
        const startTime = Date.now();

        const onResponse = () => {
            res.removeListener('close', onResponse);
            res.removeListener('finish', onResponse);
            const responseTime = Date.now() - startTime;
            req.log.info({ res, responseTime }, 'Response sent');
        };
        res.on('close', onResponse);
        res.on('finish', onResponse);

        const onResponseError = (err) => {
            res.removeListener('error', onResponseError);
            req.log.error({ err, res }, 'Error while sending response');
        }
        res.on('error', onResponseError);

        next();
    });

    // Attach always useful middleware
    app.use(helmet());
    app.use(cors());

    // Add prometheus monitoring metrics
    if (config.prometheusMetrics) {
        const metricsConfig = { ...config.prometheusMetrics };
        if (config.prometheusMetrics.port) {
            app.metricsApp = express();
            app.metricsApp.listen(metricsConfig.port);
            metricsConfig.metricsApp = app.metricsApp;
            delete metricsConfig.port;
        }
        app.use(prometheus(metricsConfig));
    }
    // TODO we need to terminate app.metricsApp too somehow on shutdown

    // Polyfill async handling in endpoints until support hits express
    [ ...methods, 'all' ].forEach((method) => {
        const originalMethod = app[method];
        app[method] = function(path) {
            // Wrap middleware or arrays of middlewares in aysnchandler
            const middlewares = Array.prototype.slice.call(arguments, 1)
                .map((middleware) => {
                    if(Array.isArray(middleware)) {
                        return middleware.map(asyncHandler);
                    }
                    return asyncHandler(middleware);
                });

            originalMethod.apply(app, [ path, ...middlewares ]);
        };
    });

    const originalUse = app.use;
    app.use = function() {
        // Wrap middlewares in async handler if they are functions or arrays
        const middlewares = Array.prototype.slice.call(arguments)
            .map((middleware) => {
                if(Array.isArray(middleware)) {
                    return middleware.map(asyncHandler);
                }
                if(typeof middleware === 'function') {
                    return asyncHandler(middleware);
                }
                return middleware;
            });

        return originalUse.apply(app, middlewares);
    };

    // Attach configurable finalhandler
    const originalHandle = app.handle.bind(app);
    app.handle = (req, res, callback) => {
        originalHandle(req, res, callback || finalhandler(req, res, {
            onservererror: (err) => req.log.error({ err }, 'An error occurred'),
            errortransform: (err) => {
                if(typeof err !== 'object') {
                    return err;
                }
                if(err.issues && err.name === 'ZodError') {
                    return createHttpError(400, 'Invalid request', { issues: err.issues });
                }
                return err;
            },
        }));
    }
};
