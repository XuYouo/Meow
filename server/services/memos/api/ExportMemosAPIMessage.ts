import type Database from 'better-sqlite3';
import { MemosSnapshotSchema, type MemosSnapshot } from '../../../../shared/contracts/memos/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { countMemoRows, listAllMemoRows } from '../tables/memos/table.js';
import { allTombstones, countTombstones } from '../tables/tombstones/table.js';
import { readPinOrder } from '../tables/memoPins/table.js';
import { projectMemo } from '../utils/projectMemo.js';

/** Internal bounded snapshot; transfer owns authorization and the shared read work unit. */
export function plan(deps: { db: Database.Database }): MemosSnapshot {
  if (countMemoRows(deps.db)>5000 || countTombstones(deps.db)>5000) throw new AppError(413,'BACKUP_LIMIT','首版备份上限为 5000 条笔记和 5000 条删除记录');
  return MemosSnapshotSchema.parse({ memos: listAllMemoRows(deps.db).map((row) => projectMemo(deps.db,row,false)),tombstones: allTombstones(deps.db),pinOrder: readPinOrder(deps.db) });
}
