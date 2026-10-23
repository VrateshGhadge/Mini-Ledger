import type { QueryResultRow } from 'pg';
import { pool } from '../../src/config/db';
import { signAccessToken } from '../../src/services/token.service';

interface UserRow extends QueryResultRow {
  id: string;
  phone_number: string;
}

export interface TestUser {
  id: string;
  phoneNumber: string;
  token: string;
}

export async function createTestUser(phoneNumber: string): Promise<TestUser> {
  const result = await pool.query<UserRow>(
    'INSERT INTO users (phone_number) VALUES ($1) RETURNING id, phone_number',
    [phoneNumber],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to create test user');
  }

  return {
    id: row.id,
    phoneNumber: row.phone_number,
    token: signAccessToken(row.id),
  };
}
