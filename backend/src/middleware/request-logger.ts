import type { RequestHandler } from 'express';
import { env } from '../config/env';

export const requestLogger: RequestHandler = (req, res, next) => {
  if (env.NODE_ENV === 'test') {
    next();
    return;
  }

  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    console.info(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`,
    );
  });

  next();
};
