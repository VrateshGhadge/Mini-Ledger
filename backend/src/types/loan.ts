export type LoanStatus = 'PENDING' | 'OVERDUE' | 'REPAID';

export interface Loan {
  id: string;
  friendName: string;
  amount: number;
  dueDate: string;
  status: LoanStatus;
  isRepaid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLoanInput {
  friendName: string;
  amount: number;
  dueDate: string;
}
