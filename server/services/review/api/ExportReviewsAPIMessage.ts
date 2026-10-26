import type Database from 'better-sqlite3';
import { AppError } from '../../../system/errors/AppError.js';
import { allReviewResults } from '../tables/results/table.js';

export function plan({ db }: { db: Database.Database }) {
  const results = allReviewResults(db, 100_000);
  if (results.length > 100_000) throw new AppError(413, 'BACKUP_LIMIT', 'This workspace exceeds the backup limit of 100000 review records.');
  return results;
}
