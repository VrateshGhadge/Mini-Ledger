import type { QueryResultRow } from 'pg';
import { pool } from '../config/db';
import type { Summary } from '../types/summary';

interface SummaryRow extends QueryResultRow {
  total_lent: string;
  total_repaid: string;
  overdue_amount: string;
}

export async function getSummary(userId: string): Promise<Summary> {
  const result = await pool.query<SummaryRow>(
    `SELECT
       COALESCE(SUM(amount), 0)::text AS total_lent,
       COALESCE(SUM(amount) FILTER (WHERE is_repaid), 0)::text AS total_repaid,
       COALESCE(
         SUM(amount) FILTER (
           WHERE NOT is_repaid AND due_date < CURRENT_DATE
         ),
         0
       )::text AS overdue_amount
     FROM loans
     WHERE user_id = $1`,
    [userId],
  );

  const row = result.rows[0];

  return {
    totalLent: Number(row.total_lent),
    totalRepaid: Number(row.total_repaid),
    overdueAmount: Number(row.overdue_amount),
  };
}
