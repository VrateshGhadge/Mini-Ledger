import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pool } from '../../src/config/db';

async function assertTestDatabase(): Promise<void> {
  const result = await pool.query<{ name: string }>(
    'SELECT current_database() AS name',
  );

  if (!result.rows[0]?.name.endsWith('_test')) {
    throw new Error(
      'Refusing to run tests against a database whose name does not end with "_test"',
    );
  }
}

export async function ensureSchema(): Promise<void> {
  await assertTestDatabase();
  const schemaSql = readFileSync(
    path.join(__dirname, '..', '..', 'sql', 'schema.sql'),
    'utf8',
  );
  await pool.query(schemaSql);
}

export async function truncateAllTables(): Promise<void> {
  await pool.query('TRUNCATE TABLE loans, users RESTART IDENTITY CASCADE');
}

export async function getDbDate(offsetDays: number): Promise<string> {
  const result = await pool.query<{ date: string }>(
    "SELECT to_char(CURRENT_DATE + $1::int, 'YYYY-MM-DD') AS date",
    [offsetDays],
  );

  return result.rows[0].date;
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
