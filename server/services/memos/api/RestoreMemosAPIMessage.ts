import type Database from 'better-sqlite3';
import { MemosSnapshotSchema, type MemosSnapshot } from '../../../../shared/contracts/memos/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { countMemoRows, insertMemoRow } from '../tables/memos/table.js';
import { countTombstones, insertTombstone } from '../tables/tombstones/table.js';
import { countMemoOperations } from '../tables/operations/table.js';
import { restorePinOrder } from '../tables/memoPins/table.js';
import { nextMemoSequence } from '../tables/revisions/table.js';
import { writeRelations } from '../utils/writeRelations.js';
import { readMemoLinks } from '../tables/memoLinks/table.js';

/** Internal restore into an empty domain. The transfer work unit owns atomicity. */
export function plan(input: MemosSnapshot, deps: { db: Database.Database }): { memos: number;tombstones: number } {
  const snapshot=MemosSnapshotSchema.parse(input);
  if (countMemoRows(deps.db)||countTombstones(deps.db)||countMemoOperations(deps.db)) throw new AppError(409,'RESTORE_NOT_EMPTY','恢复目标必须是新的空实例');
  for (const memo of snapshot.memos) insertMemoRow(deps.db,{ id: memo.id,content: memo.content,is_public: Number(memo.isPublic),revision: memo.revision,sequence: nextMemoSequence(deps.db),created_at: memo.createdAt,updated_at: memo.updatedAt });
  for (const memo of snapshot.memos) writeRelations(deps,memo.id,{ tags: memo.tags,links: memo.links,attachments: memo.attachments });
  for (const memo of snapshot.memos) {
    const backlinks=readMemoLinks(deps.db,memo.id,false).backlinks;
    if (JSON.stringify([...memo.backlinks].sort())!==JSON.stringify(backlinks)) throw new AppError(400,'INVALID_BACKUP','备份双链投影不一致');
  }
  restorePinOrder(deps.db,snapshot.pinOrder);
  for (const tombstone of snapshot.tombstones) insertTombstone(deps.db,tombstone,nextMemoSequence(deps.db));
  return { memos: snapshot.memos.length,tombstones: snapshot.tombstones.length };
}
