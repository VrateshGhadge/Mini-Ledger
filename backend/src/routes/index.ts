import { Router } from 'express';
import authRoutes from './auth.routes';
import healthRoutes from './health.routes';
import loanRoutes from './loan.routes';
import summaryRoutes from './summary.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/loans', loanRoutes);
router.use('/summary', summaryRoutes);

export default router;

