import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ReviewResultSchema, type ReviewResultDTO } from '../../../../shared/contracts/review/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { reviewsEmpty, saveReviewResult } from '../tables/results/table.js';

export function plan(snapshot: readonly ReviewResultDTO[], { db }: { db: Database.Database }): void {
  if (!reviewsEmpty(db)) throw new AppError(409, 'RESTORE_REQUIRES_EMPTY', 'Restore requires an empty workspace.');
  for (const result of z.array(ReviewResultSchema).max(100_000).parse(snapshot)) saveReviewResult(db, result);
}
