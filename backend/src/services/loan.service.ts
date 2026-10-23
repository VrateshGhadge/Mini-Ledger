import type { QueryResultRow } from 'pg';
import { pool } from '../config/db';
import type {
  CreateLoanInput,
  Loan,
  LoanStatus,
} from '../types/loan';

interface LoanRow extends QueryResultRow {
  id: string;
  friend_name: string;
  amount: string;
  due_date: string;
  status: LoanStatus;
  is_repaid: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapLoan(row: LoanRow): Loan {
  return {
    id: row.id,
    friendName: row.friend_name,
    amount: Number(row.amount),
    dueDate: row.due_date,
    status: row.status,
    isRepaid: row.is_repaid,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createLoan(
  userId: string,
  input: CreateLoanInput,
): Promise<Loan> {
  const result = await pool.query<LoanRow>(
    `INSERT INTO loans (user_id, friend_name, amount, due_date)
     VALUES ($1, $2, $3, $4)
     RETURNING
       id,
       friend_name,
       amount::text AS amount,
       due_date::text AS due_date,
       CASE
         WHEN is_repaid THEN 'REPAID'
         WHEN due_date < CURRENT_DATE THEN 'OVERDUE'
         ELSE 'PENDING'
       END AS status,
       is_repaid,
       created_at,
       updated_at`,
    [userId, input.friendName, input.amount, input.dueDate],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to create loan');
  }

  return mapLoan(row);
}

export async function listLoans(userId: string): Promise<Loan[]> {
  const result = await pool.query<LoanRow>(
    `SELECT
       id,
       friend_name,
       amount::text AS amount,
       due_date::text AS due_date,
       CASE
         WHEN is_repaid THEN 'REPAID'
         WHEN due_date < CURRENT_DATE THEN 'OVERDUE'
         ELSE 'PENDING'
       END AS status,
       is_repaid,
       created_at,
       updated_at
     FROM loans
     WHERE user_id = $1
     ORDER BY
       is_repaid ASC,
       CASE
         WHEN NOT is_repaid AND due_date < CURRENT_DATE THEN 0
         ELSE 1
       END ASC,
       due_date ASC,
       created_at DESC`,
    [userId],
  );

  return result.rows.map(mapLoan);
}

export async function repayLoan(
  userId: string,
  loanId: string,
): Promise<Loan | null> {
  const result = await pool.query<LoanRow>(
    `UPDATE loans
     SET
       is_repaid = TRUE,
       updated_at = CASE WHEN is_repaid THEN updated_at ELSE NOW() END
     WHERE id = $1 AND user_id = $2
     RETURNING
       id,
       friend_name,
       amount::text AS amount,
       due_date::text AS due_date,
       'REPAID'::text AS status,
       is_repaid,
       created_at,
       updated_at`,
    [loanId, userId],
  );

  const row = result.rows[0];
  return row ? mapLoan(row) : null;
}
