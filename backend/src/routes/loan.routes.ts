import { Router } from 'express';
import {
  createLoan,
  listLoans,
  repayLoan,
} from '../controllers/loan.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.post('/', createLoan);
router.get('/', listLoans);
router.patch('/:id/repay', repayLoan);

export default router;
