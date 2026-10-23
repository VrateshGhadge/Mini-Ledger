import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/middleware/error-handler';

function buildFailingApp() {
  const app = express();

  app.get('/boom', () => {
    throw new Error('sensitive database detail');
  });

  app.use(errorHandler);
  return app;
}

function buildJsonApp() {
  const app = express();

  app.use(express.json({ limit: '100kb' }));
  app.post('/payload', (_req, res) => {
    res.status(204).send();
  });
  app.use(errorHandler);

  return app;
}

describe('centralized error handling', () => {
  it('returns a generic JSON 500 without leaking internals', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(buildFailingApp()).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive');
    expect(JSON.stringify(response.body)).not.toContain('at ');
  });

  it('returns a JSON 413 for oversized request bodies', async () => {
    const response = await request(buildJsonApp())
      .post('/payload')
      .send({ data: 'x'.repeat(110 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large.',
      },
    });
  });
});
