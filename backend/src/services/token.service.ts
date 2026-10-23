import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

const TOKEN_ISSUER = 'miniledger-api';

export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: TOKEN_ISSUER,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: TOKEN_ISSUER,
  });

  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new jwt.JsonWebTokenError('Token payload is missing a subject');
  }

  return payload.sub;
}
