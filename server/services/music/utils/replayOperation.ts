import type Database from 'better-sqlite3';
import { AppError } from '../../../system/errors/AppError.js';
import { readMusicOperation } from '../tables/tracks/table.js';

export function replayOperation(db: Database.Database, id: string, kind: string, input: string): unknown | undefined {
  const receipt = readMusicOperation(db, id);
  if (!receipt) return undefined;
  if (receipt.kind !== kind || receipt.input !== input) throw new AppError(409, 'OPERATION_REUSED', 'This operation ID was already used with different input.');
  return receipt.output;
}
