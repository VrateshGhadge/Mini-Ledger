import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function isBodyParserErrorOfType(
  error: unknown,
  type: string,
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: unknown }).type === type
  );
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    const body: ErrorBody = {
      error: {
        code: error.code,
        message: error.message,
      },
    };

    if (error.details !== undefined) {
      body.error.details = error.details;
    }

    res.status(error.statusCode).json(body);
    return;
  }

  if (error instanceof ZodError) {
    const body: ErrorBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      },
    };

    res.status(400).json(body);
    return;
  }

  if (isBodyParserErrorOfType(error, 'entity.parse.failed')) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON.',
      },
    });
    return;
  }

  if (isBodyParserErrorOfType(error, 'entity.too.large')) {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large.',
      },
    });
    return;
  }

  console.error('Unhandled error:', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
};
