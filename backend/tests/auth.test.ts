import request from 'supertest';
import app from '../src/app';
import { pool } from '../src/config/db';
import {
  MAX_OTP_ATTEMPTS,
  MAX_OTP_REQUESTS_PER_WINDOW,
  OTP_REQUEST_WINDOW_MS,
  OTP_TTL_MS,
  getOtpForTesting,
} from '../src/services/otp.service';
import { verifyAccessToken } from '../src/services/token.service';
import {
  closeDatabase,
  ensureSchema,
  truncateAllTables,
} from './helpers/database';

type PhoneRow = { phone_number: string };
type CountRow = { count: string };

const NORMALIZED_PHONE = '+919876543210';

let phoneSequence = 0;

function nextPhone(): string {
  phoneSequence += 1;
  return `+9198765${String(phoneSequence).padStart(5, '0')}`;
}

function currentOtp(phoneNumber: string): string {
  const otp = getOtpForTesting(phoneNumber);
  if (!otp) {
    throw new Error(`No OTP stored for ${phoneNumber}`);
  }
  return otp;
}

function wrongOtp(otp: string): string {
  return otp === '000000' ? '111111' : '000000';
}

function requestOtp(phoneNumber: string) {
  return request(app)
    .post('/api/auth/request-otp')
    .send({ phoneNumber });
}

function verifyOtp(phoneNumber: string, otp: string) {
  return request(app)
    .post('/api/auth/verify-otp')
    .send({ phoneNumber, otp });
}

beforeAll(async () => {
  await ensureSchema();
});

beforeEach(async () => {
  await truncateAllTables();
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterAll(async () => {
  await closeDatabase();
});

describe('POST /api/auth/request-otp', () => {
  it('normalizes the phone, logs the OTP, and does not return it', async () => {
    const response = await requestOtp('+91 98765-43210');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'OTP generated. Check the server terminal.',
      expiresInSeconds: OTP_TTL_MS / 1000,
    });
    expect(response.body).not.toHaveProperty('otp');

    const otp = currentOtp(NORMALIZED_PHONE);
    expect(otp).toMatch(/^\d{6}$/);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining(otp),
    );
  });

  it('rejects an invalid phone number', async () => {
    const response = await requestOtp('12345');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'phoneNumber' }),
      ]),
    );
  });

  it('rate limits a second request during the cooldown', async () => {
    const phone = nextPhone();
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    const first = await requestOtp(phone);
    expect(first.status).toBe(200);

    const second = await requestOtp(phone);
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('OTP_RATE_LIMITED');
    expect(second.body.error.details.retryAfterSeconds).toBeGreaterThan(0);

    now += 30_000;
    const third = await requestOtp(phone);
    expect(third.status).toBe(200);
  });

  it('caps OTP requests per 15-minute window', async () => {
    const phone = nextPhone();
    const windowStart = Date.now();
    let now = windowStart;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    for (let attempt = 0; attempt < MAX_OTP_REQUESTS_PER_WINDOW; attempt += 1) {
      const response = await requestOtp(phone);
      expect(response.status).toBe(200);
      now += 31_000;
    }

    const blocked = await requestOtp(phone);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('OTP_RATE_LIMITED');

    now = windowStart + OTP_REQUEST_WINDOW_MS;
    const allowed = await requestOtp(phone);
    expect(allowed.status).toBe(200);
  });
});

describe('POST /api/auth/verify-otp', () => {
  it('returns a JWT and user for a valid OTP', async () => {
    const phone = nextPhone();

    const otpResponse = await requestOtp(phone);
    expect(otpResponse.status).toBe(200);

    const otp = currentOtp(phone);
    const response = await verifyOtp(phone, otp);

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toEqual({
      id: expect.any(String),
      phoneNumber: phone,
      createdAt: expect.any(String),
    });
    expect(verifyAccessToken(response.body.token)).toBe(response.body.user.id);

    const storedUser = await pool.query<PhoneRow>(
      'SELECT phone_number FROM users WHERE id = $1',
      [response.body.user.id],
    );
    expect(storedUser.rowCount).toBe(1);
    expect(storedUser.rows[0].phone_number).toBe(phone);
  });

  it('reuses the existing user on a later login', async () => {
    const phone = nextPhone();

    await requestOtp(phone);
    const first = await verifyOtp(phone, currentOtp(phone));
    expect(first.status).toBe(200);

    await requestOtp(phone);
    const second = await verifyOtp(phone, currentOtp(phone));
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);

    const countResult = await pool.query<CountRow>(
      'SELECT COUNT(*)::text AS count FROM users',
    );
    expect(countResult.rows[0].count).toBe('1');
  });

  it('rejects an incorrect OTP', async () => {
    const phone = nextPhone();
    await requestOtp(phone);

    const response = await verifyOtp(phone, wrongOtp(currentOtp(phone)));

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('OTP_INVALID_OR_EXPIRED');

    const users = await pool.query<CountRow>(
      'SELECT COUNT(*)::text AS count FROM users',
    );
    expect(users.rows[0].count).toBe('0');
  });

  it('rejects verification when no OTP was requested', async () => {
    const response = await verifyOtp(nextPhone(), '123456');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('OTP_INVALID_OR_EXPIRED');
  });

  it('rejects an invalid OTP format', async () => {
    const phone = nextPhone();
    await requestOtp(phone);

    const response = await verifyOtp(phone, '12345');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'otp' })]),
    );
  });

  it('rejects an expired OTP', async () => {
    const phone = nextPhone();
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    await requestOtp(phone);
    const otp = currentOtp(phone);

    now += OTP_TTL_MS;
    const response = await verifyOtp(phone, otp);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('OTP_INVALID_OR_EXPIRED');
  });

  it('rejects an OTP that has already been used', async () => {
    const phone = nextPhone();
    await requestOtp(phone);
    const otp = currentOtp(phone);

    const first = await verifyOtp(phone, otp);
    expect(first.status).toBe(200);

    const second = await verifyOtp(phone, otp);
    expect(second.status).toBe(401);
    expect(second.body.error.code).toBe('OTP_INVALID_OR_EXPIRED');
  });

  it('locks verification after the maximum number of failed attempts', async () => {
    const phone = nextPhone();
    await requestOtp(phone);
    const otp = currentOtp(phone);
    const wrong = wrongOtp(otp);

    for (let attempt = 1; attempt <= MAX_OTP_ATTEMPTS; attempt += 1) {
      const response = await verifyOtp(phone, wrong);

      if (attempt < MAX_OTP_ATTEMPTS) {
        expect(response.status).toBe(401);
      } else {
        expect(response.status).toBe(429);
        expect(response.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
      }
    }

    const locked = await verifyOtp(phone, otp);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
  });

  it('returns a JSON error for malformed request bodies', async () => {
    const response = await request(app)
      .post('/api/auth/request-otp')
      .set('Content-Type', 'application/json')
      .send('{"phoneNumber":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });
});
