import cors from 'cors';
import express from 'express';
import { corsOrigins, env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { requestLogger } from './middleware/request-logger';
import apiRouter from './routes';

const app = express();

app.disable('x-powered-by');
app.use(requestLogger);
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? '*' : corsOrigins,
  }),
);
app.use(express.json({ limit: '100kb' }));
app.use('/api', apiRouter);
app.use(notFound);
app.use(errorHandler);

export default app;

