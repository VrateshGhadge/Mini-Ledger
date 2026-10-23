import request from 'supertest';
import app from '../../src/app';

function withAuth(
  token: string,
) {
  return { Authorization: `Bearer ${token}` };
}

export function createLoan(
  payload: Record<string, unknown>,
  token: string,
) {
  return request(app)
    .post('/api/loans')
    .set(withAuth(token))
    .send(payload);
}

export function listLoans(token: string) {
  return request(app).get('/api/loans').set(withAuth(token));
}

export function repayLoan(loanId: string, token: string) {
  return request(app)
    .patch(`/api/loans/${loanId}/repay`)
    .set(withAuth(token));
}

export function getSummary(token: string) {
  return request(app).get('/api/summary').set(withAuth(token));
}
