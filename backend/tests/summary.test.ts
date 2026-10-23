import request from 'supertest';
import app from '../src/app';
import { createLoan, getSummary, repayLoan } from './helpers/api';
import {
  closeDatabase,
  ensureSchema,
  getDbDate,
  truncateAllTables,
} from './helpers/database';
import { createTestUser, type TestUser } from './helpers/users';

interface SummaryBody {
  totalLent: number;
  totalRepaid: number;
  overdueAmount: number;
}

let user: TestUser;
let otherUser: TestUser;

beforeAll(async () => {
  await ensureSchema();
});

beforeEach(async () => {
  await truncateAllTables();
  user = await createTestUser('+919000000011');
  otherUser = await createTestUser('+919000000012');
});

afterAll(async () => {
  await closeDatabase();
});

describe('GET /api/summary', () => {
  it('requires authentication', async () => {
    const response = await request(app).get('/api/summary');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('returns zeros when the user has no loans', async () => {
    const response = await getSummary(user.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalLent: 0,
      totalRepaid: 0,
      overdueAmount: 0,
    });

    for (const value of Object.values(response.body as SummaryBody)) {
      expect(typeof value).toBe('number');
    }
  });

  it('calculates totals from loans and excludes due-today and repaid overdue loans', async () => {
    const yesterday = await getDbDate(-1);
    const today = await getDbDate(0);
    const tomorrow = await getDbDate(1);
    const fiveDaysAgo = await getDbDate(-5);

    await createLoan(
      { friendName: 'Future', amount: 1000.1, dueDate: tomorrow },
      user.token,
    );
    await createLoan(
      { friendName: 'Overdue', amount: 2000.2, dueDate: yesterday },
      user.token,
    );
    await createLoan(
      { friendName: 'Due today', amount: 500.3, dueDate: today },
      user.token,
    );

    const repaid = await createLoan(
      { friendName: 'Repaid old', amount: 750.45, dueDate: fiveDaysAgo },
      user.token,
    );
    await repayLoan(repaid.body.id as string, user.token);

    const response = await getSummary(user.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalLent: 4251.05,
      totalRepaid: 750.45,
      overdueAmount: 2000.2,
    });
  });

  it('does not count a loan due today as overdue', async () => {
    const today = await getDbDate(0);
    await createLoan(
      { friendName: 'Due today', amount: 300, dueDate: today },
      user.token,
    );

    const response = await getSummary(user.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalLent: 300,
      totalRepaid: 0,
      overdueAmount: 0,
    });
  });

  it('excludes a repaid loan from overdue even if its due date has passed', async () => {
    const yesterday = await getDbDate(-1);
    const created = await createLoan(
      { friendName: 'Repaid overdue', amount: 400, dueDate: yesterday },
      user.token,
    );
    await repayLoan(created.body.id as string, user.token);

    const response = await getSummary(user.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalLent: 400,
      totalRepaid: 400,
      overdueAmount: 0,
    });
  });

  it('never includes another user loans in the totals', async () => {
    const tomorrow = await getDbDate(1);
    await createLoan(
      { friendName: 'Owner loan', amount: 900, dueDate: tomorrow },
      user.token,
    );

    const response = await getSummary(otherUser.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalLent: 0,
      totalRepaid: 0,
      overdueAmount: 0,
    });
  });
});
