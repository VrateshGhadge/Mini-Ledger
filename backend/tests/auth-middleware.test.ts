import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../src/config/env';
import { requireAuth } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error-handler';
import { signAccessToken } from '../src/services/token.service';

function buildProtectedApp() {
  const app = express();

  app.get('/protected', requireAuth, (req, res) => {
    res.status(200).json({ userId: req.userId });
  });

  app.use(errorHandler);
  return app;
}

const protectedApp = buildProtectedApp();
const userId = 'd3f8b7a2-3c4e-4f5a-9b6c-7d8e9f0a1b2c';

describe('JWT authentication middleware', () => {
  it('rejects a request without an Authorization header', async () => {
    const response = await request(protectedApp).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects a non-Bearer Authorization header', async () => {
    const response = await request(protectedApp)
      .get('/protected')
      .set('Authorization', 'Basic abc123');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('rejects a malformed token', async () => {
    const response = await request(protectedApp)
      .get('/protected')
      .set('Authorization', 'Bearer not-a-jwt');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = jwt.sign({}, `${env.JWT_SECRET}-wrong`, {
      algorithm: 'HS256',
      subject: userId,
      issuer: 'miniledger-api',
      expiresIn: '1h',
    });

    const response = await request(protectedApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign({}, env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: userId,
      issuer: 'miniledger-api',
      expiresIn: -1,
    });

    const response = await request(protectedApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = jwt.sign({}, env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: userId,
      issuer: 'some-other-service',
      expiresIn: '1h',
    });

    const response = await request(protectedApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('accepts a valid token and exposes the user id', async () => {
    const token = signAccessToken(userId);

    const response = await request(protectedApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId });
  });
});
