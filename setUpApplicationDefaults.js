import pino, { stdSerializers } from 'pino-http';
import { v4 as uuidV4 } from 'uuid';
import createErrorSerializer from 'serialize-every-error';
import finalhandler from 'dexpress-finalhandler';
import helmet from 'helmet';
import cors from 'cors';
import prometheus from 'express-prometheus-middleware';
import createHttpError from 'http-errors';

//TODO: better way to handle asynchrony here?

export default async (app) => {
    app.use(pino({
        autoLogging: false,
        serializers: {
            ...stdSerializers,
            req: (req) => {
                const serialized = stdSerializers.req(req);
                if(serialized?.headers?.authorization) {
                    serialized.headers.authorization = '####REDACTED####';
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
    app.use(prometheus());

    // Attach configurable finalhandler
    const originalHandle = app.handle.bind(app);
    app.handle = (req, res, callback) => {
        originalHandle(req, res, callback || finalhandler(req, res, {
            onservererror: (err) => req.log.error({ err }, 'An error occurred'),
            errortransform: (err) => {
                if(err.issues && err.name === 'ZodError') {
                    return createHttpError(400, 'Invalid request', { issues: err.issues });
                }
                return err;
            },
        }));
    }
};
