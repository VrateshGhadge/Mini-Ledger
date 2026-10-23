import { z } from 'zod';

const MAX_LOAN_AMOUNT = 9_999_999_999.99;

function isValidDueDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() >= 1 &&
    date.toISOString().slice(0, 10) === value
  );
}

export const createLoanSchema = z.object({
  friendName: z
    .string()
    .trim()
    .min(1, 'Friend name is required')
    .max(100, 'Friend name must be at most 100 characters'),
  amount: z
    .number()
    .positive('Amount must be greater than zero')
    .max(MAX_LOAN_AMOUNT, 'Amount is too large')
    .multipleOf(0.01, 'Amount can have at most two decimal places'),
  dueDate: z
    .string()
    .trim()
    .refine(
      isValidDueDate,
      'Due date must be a valid date in YYYY-MM-DD format',
    ),
});

export const loanIdParamsSchema = z.object({
  id: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Loan id must be a valid UUID',
  ),
});
