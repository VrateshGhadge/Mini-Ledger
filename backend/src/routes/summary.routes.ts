import { Router } from 'express';
import { getSummary } from '../controllers/summary.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', getSummary);

export default router;
