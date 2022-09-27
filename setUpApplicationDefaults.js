import pino, { stdSerializers } from 'pino-http';
import { v4 as uuidV4 } from 'uuid';
import createErrorSerializer from 'serialize-every-error';
import finalhandler from 'dexpress-finalhandler';
import helmet from 'helmet';
import cors from 'cors';
import createHttpError from 'http-errors';
import methods from 'methods';
import asyncHandler from 'express-async-handler';
import express from 'express';
import promBundle from 'express-prom-bundle';
import { promisify } from 'util';
import httpGracefulShutdown from 'http-graceful-shutdown';

//TODO: better way to handle asynchrony here?

export default async (app, config) => {
    let server;
    let metricsServer;

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
        }
        app.use(promBundle({
          metricsApp: app.metricsApp, // its fine to pass an undefined here, if we don't want an alternative app for metrics
          autoregister: !Boolean(config.prometheusMetrics.port),  // if no port defined, we register on primary express app
          includeMethod: true,
          includePath: true,
          promClient: {
            collectDefaultMetrics: { },
            ...config.prometheusMetrics.promClient, // see https://github.com/siimon/prom-client for config options
          },
        }));
    }

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

    // patch listen to also start metrics app if it exists
    const originalListen = app.listen.bind(app);
    app.listen = (port, callback) => {
        if (!callback) callback = () => {};
        const server = originalListen(port, () => {
            if (app.metricsApp) {
                metricsServer = app.metricsApp.listen(config.prometheusMetrics.port, callback);
                return;
            }
            callback();
        });

        const closeOriginal = server.close;
        server.close = async (callback) => {
            server.close = closeOriginal;

            const options = { forceExit: false, signals: '' };
            if (metricsServer) await httpGracefulShutdown(metricsServer, options)();
            await httpGracefulShutdown(server, options)();

            if (callback) callback();
            return;
        };

        return server;
    }
};
