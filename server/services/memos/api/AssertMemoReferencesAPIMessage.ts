import type Database from 'better-sqlite3';
import { AppError } from '../../../system/errors/AppError.js';
import { getMemoRow } from '../tables/memos/table.js';

/** Internal reference validation for another domain within a trusted work unit. */
export function plan(input: { ids: string[] }, deps: { db: Database.Database }): void {
  for (const id of input.ids) if (!getMemoRow(deps.db,id)) throw new AppError(400,'INVALID_MEMO_REFERENCE','引用的笔记不存在');
}
