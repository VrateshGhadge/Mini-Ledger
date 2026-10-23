import { randomInt } from 'node:crypto';
import { AppError } from '../errors/app-error';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;
export const MAX_OTP_REQUESTS_PER_WINDOW = 5;
export const MAX_OTP_ATTEMPTS = 5;

interface OtpRecord {
  otp: string;
  expiresAt: number;
  attempts: number;
  locked: boolean;
  lastSentAt: number;
  windowStartedAt: number;
  requestCount: number;
}

export interface RequestOtpResult {
  expiresInSeconds: number;
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'attempts' };

const otpStore = new Map<string, OtpRecord>();

const OTP_CLEANUP_INTERVAL_MS = 60 * 1000;

const cleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [phoneNumber, record] of otpStore) {
    const windowEndsAt = record.windowStartedAt + OTP_REQUEST_WINDOW_MS;
    if (now >= record.expiresAt && now >= windowEndsAt) {
      otpStore.delete(phoneNumber);
    }
  }
}, OTP_CLEANUP_INTERVAL_MS);

cleanupTimer.unref();

function secondsUntil(timestamp: number, now: number): number {
  return Math.max(1, Math.ceil((timestamp - now) / 1000));
}

export function requestOtp(phoneNumber: string): RequestOtpResult {
  const now = Date.now();
  const existing = otpStore.get(phoneNumber);

  if (existing) {
    const cooldownEndsAt = existing.lastSentAt + OTP_RESEND_COOLDOWN_MS;
    if (now < cooldownEndsAt) {
      throw new AppError(
        429,
        'OTP_RATE_LIMITED',
        'Please wait before requesting another OTP.',
        { retryAfterSeconds: secondsUntil(cooldownEndsAt, now) },
      );
    }

    const windowEndsAt = existing.windowStartedAt + OTP_REQUEST_WINDOW_MS;
    if (
      now < windowEndsAt &&
      existing.requestCount >= MAX_OTP_REQUESTS_PER_WINDOW
    ) {
      throw new AppError(
        429,
        'OTP_RATE_LIMITED',
        'Too many OTP requests. Try again later.',
        { retryAfterSeconds: secondsUntil(windowEndsAt, now) },
      );
    }
  }

  const withinWindow =
    existing !== undefined &&
    now < existing.windowStartedAt + OTP_REQUEST_WINDOW_MS;
  const windowStartedAt = withinWindow ? existing.windowStartedAt : now;
  const requestCount = withinWindow ? existing.requestCount + 1 : 1;

  const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');

  otpStore.set(phoneNumber, {
    otp,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    locked: false,
    lastSentAt: now,
    windowStartedAt,
    requestCount,
  });

  console.info(
    `[auth] OTP for ${phoneNumber} is ${otp}. Expires in 5 minutes.`,
  );

  return { expiresInSeconds: OTP_TTL_MS / 1000 };
}

export function verifyOtp(
  phoneNumber: string,
  otp: string,
): VerifyOtpResult {
  const now = Date.now();
  const record = otpStore.get(phoneNumber);

  if (!record) {
    return { ok: false, reason: 'invalid' };
  }

  if (now >= record.expiresAt) {
    otpStore.delete(phoneNumber);
    return { ok: false, reason: 'invalid' };
  }

  if (record.locked) {
    return { ok: false, reason: 'attempts' };
  }

  if (record.otp !== otp) {
    record.attempts += 1;

    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      record.locked = true;
      return { ok: false, reason: 'attempts' };
    }

    return { ok: false, reason: 'invalid' };
  }

  otpStore.delete(phoneNumber);
  return { ok: true };
}

export function getOtpForTesting(phoneNumber: string): string | undefined {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('getOtpForTesting is only available in the test environment');
  }

  return otpStore.get(phoneNumber)?.otp;
}
