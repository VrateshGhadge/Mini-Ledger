import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { verifyAccessToken } from '../services/token.service';

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.header('authorization');

  if (!header) {
    next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
    return;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    next(new AppError(401, 'AUTH_INVALID_TOKEN', 'Invalid authorization header.'));
    return;
  }

  try {
    req.userId = verifyAccessToken(match[1]);
    next();
  } catch {
    next(new AppError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired token.'));
  }
}
