import type { Request, Response } from 'express';
import * as summaryService from '../services/summary.service';

export async function getSummary(
  req: Request,
  res: Response,
): Promise<void> {
  const summary = await summaryService.getSummary(req.userId!);

  res.status(200).json(summary);
}
