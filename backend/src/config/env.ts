import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(
      /^\d+(ms|s|m|h|d|w|y)$/,
      'JWT_EXPIRES_IN must be a duration such as "7d" or "12h"',
    )
    .default('7d'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:8081'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = parsed.data;

if (env.NODE_ENV === 'test') {
  if (!env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is required when NODE_ENV is "test"');
  }

  if (env.TEST_DATABASE_URL === env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be different from DATABASE_URL');
  }

  const testDatabaseName = new URL(env.TEST_DATABASE_URL).pathname.replace(/^\//, '');
  if (!testDatabaseName.endsWith('_test')) {
    throw new Error('The test database name must end with "_test"');
  }
}

export const databaseUrl =
  env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL! : env.DATABASE_URL;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
