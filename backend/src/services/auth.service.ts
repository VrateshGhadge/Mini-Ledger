import type { QueryResultRow } from 'pg';
import { pool } from '../config/db';
import type { User } from '../types/user';

interface UserRow extends QueryResultRow {
  id: string;
  phone_number: string;
  created_at: Date;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findOrCreateUser(phoneNumber: string): Promise<User> {
  const inserted = await pool.query<UserRow>(
    `INSERT INTO users (phone_number)
     VALUES ($1)
     ON CONFLICT (phone_number) DO NOTHING
     RETURNING id, phone_number, created_at`,
    [phoneNumber],
  );

  if (inserted.rows[0]) {
    return mapUser(inserted.rows[0]);
  }

  const existing = await pool.query<UserRow>(
    'SELECT id, phone_number, created_at FROM users WHERE phone_number = $1',
    [phoneNumber],
  );

  if (!existing.rows[0]) {
    throw new Error('Failed to create or find user');
  }

  return mapUser(existing.rows[0]);
}
