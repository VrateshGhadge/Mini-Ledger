import request from 'supertest';
import app from '../src/app';
import { pool } from '../src/config/db';
import { createLoan, listLoans, repayLoan } from './helpers/api';
import {
  closeDatabase,
  ensureSchema,
  getDbDate,
  truncateAllTables,
} from './helpers/database';
import { createTestUser, type TestUser } from './helpers/users';

interface LoanBody {
  id: string;
  friendName: string;
  amount: number;
  dueDate: string;
  status: 'PENDING' | 'OVERDUE' | 'REPAID';
  isRepaid: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredLoanRow {
  user_id: string;
  friend_name: string;
  amount: string;
  due_date: string;
  is_repaid: boolean;
}

let user: TestUser;
let otherUser: TestUser;

beforeAll(async () => {
  await ensureSchema();
});

beforeEach(async () => {
  await truncateAllTables();
  user = await createTestUser('+919000000001');
  otherUser = await createTestUser('+919000000002');
});

afterAll(async () => {
  await closeDatabase();
});

describe('loan endpoint authentication', () => {
  it('rejects unauthenticated requests to all loan and summary endpoints', async () => {
    const payload = {
      friendName: 'Rahul',
      amount: 100,
      dueDate: await getDbDate(1),
    };

    const createResponse = await request(app)
      .post('/api/loans')
      .send(payload);
    expect(createResponse.status).toBe(401);
    expect(createResponse.body.error.code).toBe('AUTH_REQUIRED');

    const listResponse = await request(app).get('/api/loans');
    expect(listResponse.status).toBe(401);
    expect(listResponse.body.error.code).toBe('AUTH_REQUIRED');

    const repayResponse = await request(app).patch(
      '/api/loans/00000000-0000-4000-8000-000000000000/repay',
    );
    expect(repayResponse.status).toBe(401);
    expect(repayResponse.body.error.code).toBe('AUTH_REQUIRED');

    const summaryResponse = await request(app).get('/api/summary');
    expect(summaryResponse.status).toBe(401);
    expect(summaryResponse.body.error.code).toBe('AUTH_REQUIRED');
  });
});

describe('POST /api/loans', () => {
  it('creates a loan for the authenticated user', async () => {
    const tomorrow = await getDbDate(1);

    const response = await createLoan(
      {
        friendName: '  Rahul  ',
        amount: 2000.5,
        dueDate: tomorrow,
      },
      user.token,
    );

    expect(response.status).toBe(201);
    const loan = response.body as LoanBody;

    expect(loan).toEqual({
      id: expect.any(String),
      friendName: 'Rahul',
      amount: 2000.5,
      dueDate: tomorrow,
      status: 'PENDING',
      isRepaid: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(typeof loan.amount).toBe('number');
    expect(new Date(loan.createdAt).toISOString()).toBe(loan.createdAt);
    expect(new Date(loan.updatedAt).toISOString()).toBe(loan.updatedAt);

    const stored = await pool.query<StoredLoanRow>(
      `SELECT user_id, friend_name, amount::text AS amount,
              due_date::text AS due_date, is_repaid
       FROM loans
       WHERE id = $1`,
      [loan.id],
    );

    expect(stored.rowCount).toBe(1);
    expect(stored.rows[0]).toMatchObject({
      user_id: user.id,
      friend_name: 'Rahul',
      amount: '2000.50',
      due_date: tomorrow,
      is_repaid: false,
    });
  });

  it('derives OVERDUE immediately when the due date is in the past', async () => {
    const yesterday = await getDbDate(-1);

    const response = await createLoan(
      { friendName: 'Past due', amount: 100, dueDate: yesterday },
      user.token,
    );

    expect(response.status).toBe(201);
    expect((response.body as LoanBody).status).toBe('OVERDUE');
  });

  describe('validation', () => {
    const invalidLoans: Array<{
      name: string;
      payload: Record<string, unknown>;
    }> = [
      {
        name: 'a whitespace-only friend name',
        payload: { friendName: '   ', amount: 100, dueDate: '2099-10-30' },
      },
      {
        name: 'a missing friend name',
        payload: { amount: 100, dueDate: '2099-10-30' },
      },
      {
        name: 'a friend name longer than 100 characters',
        payload: {
          friendName: 'R'.repeat(101),
          amount: 100,
          dueDate: '2099-10-30',
        },
      },
      {
        name: 'a zero amount',
        payload: { friendName: 'Rahul', amount: 0, dueDate: '2099-10-30' },
      },
      {
        name: 'a negative amount',
        payload: { friendName: 'Rahul', amount: -10, dueDate: '2099-10-30' },
      },
      {
        name: 'an amount with more than two decimal places',
        payload: { friendName: 'Rahul', amount: 10.999, dueDate: '2099-10-30' },
      },
      {
        name: 'a string amount',
        payload: { friendName: 'Rahul', amount: '100', dueDate: '2099-10-30' },
      },
      {
        name: 'an amount above the database limit',
        payload: {
          friendName: 'Rahul',
          amount: 10_000_000_000,
          dueDate: '2099-10-30',
        },
      },
      {
        name: 'a missing amount',
        payload: { friendName: 'Rahul', dueDate: '2099-10-30' },
      },
      {
        name: 'an impossible calendar date',
        payload: { friendName: 'Rahul', amount: 100, dueDate: '2026-02-30' },
      },
      {
        name: 'a non-ISO date',
        payload: { friendName: 'Rahul', amount: 100, dueDate: '30-10-2026' },
      },
      {
        name: 'a missing due date',
        payload: { friendName: 'Rahul', amount: 100 },
      },
    ];

    it.each(invalidLoans)('rejects $name', async ({ payload }) => {
      const response = await createLoan(payload, user.token);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(response.body.error.details)).toBe(true);
    });
  });
});

describe('GET /api/loans', () => {
  it('lists only the owner loans with derived statuses and overdue first', async () => {
    const twoDaysAgo = await getDbDate(-2);
    const yesterday = await getDbDate(-1);
    const today = await getDbDate(0);
    const tomorrow = await getDbDate(1);

    await createLoan(
      { friendName: 'Old overdue', amount: 100, dueDate: twoDaysAgo },
      user.token,
    );
    await createLoan(
      { friendName: 'Recent overdue', amount: 200, dueDate: yesterday },
      user.token,
    );
    await createLoan(
      { friendName: 'Due today', amount: 300, dueDate: today },
      user.token,
    );
    await createLoan(
      { friendName: 'Future', amount: 400, dueDate: tomorrow },
      user.token,
    );

    const repaid = await createLoan(
      { friendName: 'Repaid overdue', amount: 500, dueDate: yesterday },
      user.token,
    );
    await repayLoan(repaid.body.id as string, user.token);

    await createLoan(
      { friendName: 'Other user loan', amount: 999, dueDate: tomorrow },
      otherUser.token,
    );

    const response = await listLoans(user.token);

    expect(response.status).toBe(200);
    const loans = response.body as LoanBody[];

    expect(loans).toHaveLength(5);
    expect(loans.map((loan) => loan.friendName)).toEqual([
      'Old overdue',
      'Recent overdue',
      'Due today',
      'Future',
      'Repaid overdue',
    ]);
    expect(loans.map((loan) => loan.status)).toEqual([
      'OVERDUE',
      'OVERDUE',
      'PENDING',
      'PENDING',
      'REPAID',
    ]);
    expect(loans[0]).toMatchObject({
      amount: 100,
      dueDate: twoDaysAgo,
      isRepaid: false,
    });
    expect(loans.every((loan) => typeof loan.amount === 'number')).toBe(true);
    expect(loans.some((loan) => loan.friendName === 'Other user loan')).toBe(
      false,
    );
  });
});

describe('PATCH /api/loans/:id/repay', () => {
  it('marks a loan as repaid and is idempotent', async () => {
    const tomorrow = await getDbDate(1);
    const created = await createLoan(
      { friendName: 'Rahul', amount: 1250.75, dueDate: tomorrow },
      user.token,
    );
    const loanId = created.body.id as string;

    const first = await repayLoan(loanId, user.token);
    expect(first.status).toBe(200);
    expect((first.body as LoanBody).status).toBe('REPAID');
    expect((first.body as LoanBody).isRepaid).toBe(true);

    const second = await repayLoan(loanId, user.token);
    expect(second.status).toBe(200);
    expect((second.body as LoanBody).status).toBe('REPAID');
    expect((second.body as LoanBody).updatedAt).toBe(
      (first.body as LoanBody).updatedAt,
    );

    const stored = await pool.query<{ is_repaid: boolean }>(
      'SELECT is_repaid FROM loans WHERE id = $1',
      [loanId],
    );
    expect(stored.rows[0].is_repaid).toBe(true);
  });

  it('returns 404 for a nonexistent loan id', async () => {
    const response = await repayLoan(
      '00000000-0000-4000-8000-000000000000',
      user.token,
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('LOAN_NOT_FOUND');
  });

  it('rejects an invalid loan id', async () => {
    const response = await repayLoan('not-a-uuid', user.token);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'id' })]),
    );
  });

  it('prevents another user from reading or repaying a loan', async () => {
    const tomorrow = await getDbDate(1);
    const created = await createLoan(
      { friendName: 'Private loan', amount: 300, dueDate: tomorrow },
      user.token,
    );
    const loanId = created.body.id as string;

    const otherList = await listLoans(otherUser.token);
    expect(otherList.status).toBe(200);
    expect(otherList.body).toEqual([]);

    const otherRepay = await repayLoan(loanId, otherUser.token);
    expect(otherRepay.status).toBe(404);
    expect(otherRepay.body.error.code).toBe('LOAN_NOT_FOUND');

    const ownerList = await listLoans(user.token);
    expect(ownerList.body).toHaveLength(1);
    expect((ownerList.body as LoanBody[])[0].isRepaid).toBe(false);
  });
});
