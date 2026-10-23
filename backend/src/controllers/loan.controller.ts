import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import * as loanService from '../services/loan.service';
import {
  createLoanSchema,
  loanIdParamsSchema,
} from '../validators/loan.validators';

export async function createLoan(
  req: Request,
  res: Response,
): Promise<void> {
  const input = createLoanSchema.parse(req.body);
  const loan = await loanService.createLoan(req.userId!, input);

  res.status(201).json(loan);
}

export async function listLoans(
  req: Request,
  res: Response,
): Promise<void> {
  const loans = await loanService.listLoans(req.userId!);

  res.status(200).json(loans);
}

export async function repayLoan(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = loanIdParamsSchema.parse(req.params);
  const loan = await loanService.repayLoan(req.userId!, id);

  if (!loan) {
    throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan not found.');
  }

  res.status(200).json(loan);
}
