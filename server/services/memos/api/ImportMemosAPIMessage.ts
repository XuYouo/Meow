import type Database from 'better-sqlite3';
import { z } from 'zod';
import { MemoSchema, type MemoDTO } from '../../../../shared/contracts/memos/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { getMemoRow, insertMemoRow } from '../tables/memos/table.js';
import { getTombstone } from '../tables/tombstones/table.js';
import { setMemoPin } from '../tables/memoPins/table.js';
import { nextMemoSequence } from '../tables/revisions/table.js';
import { updateMemoSequence } from '../tables/memos/table.js';
import { writeRelations } from '../utils/writeRelations.js';

const importSchema=z.object({ memos: z.array(MemoSchema).max(5000),pinOrder: z.array(z.string().uuid()).max(5000).optional() }).strict();
/** Internal append import. Transfer owns source probing, authorization and one work unit. */
export function plan(input: { memos: MemoDTO[];pinOrder?: string[] }, deps: { db: Database.Database }): { imported: number;ids: string[] } {
  const batch=importSchema.parse(input),ids=new Set(batch.memos.map((memo) => memo.id));
  if (ids.size!==batch.memos.length) throw new AppError(400,'INVALID_IMPORT','导入含重复笔记标识');
  const pinOrder=batch.pinOrder??batch.memos.filter((memo) => memo.isPinned).map((memo) => memo.id);
  const pins=new Set(pinOrder);
  if (pins.size!==pinOrder.length||pinOrder.some((id) => !ids.has(id))||batch.memos.some((memo) => memo.isPinned!==pins.has(memo.id))) throw new AppError(400,'INVALID_IMPORT','导入置顶数据不一致');
  for (const memo of batch.memos) {
    if (getMemoRow(deps.db,memo.id)||getTombstone(deps.db,memo.id)) throw new AppError(409,'IMPORT_ID_CONFLICT','导入标识与已有或删除记录冲突');
    if (memo.revision!==1||memo.updatedAt<memo.createdAt||new Set(memo.links).size!==memo.links.length||memo.links.includes(memo.id)||new Set(memo.tags).size!==memo.tags.length||new Set(memo.attachments.map((attachment) => attachment.mediaId)).size!==memo.attachments.length) throw new AppError(400,'INVALID_IMPORT','导入笔记版本或关系不正确');
  }
  for (const memo of batch.memos) insertMemoRow(deps.db,{ id: memo.id,content: memo.content,is_public: Number(memo.isPublic),revision: 1,sequence: nextMemoSequence(deps.db),created_at: memo.createdAt,updated_at: memo.updatedAt });
  for (const memo of batch.memos) writeRelations(deps,memo.id,{ tags: memo.tags,links: memo.links,attachments: memo.attachments });
  for (const id of pinOrder) setMemoPin(deps.db,id,true);
  const externalTargets=new Set(batch.memos.flatMap((memo) => memo.links).filter((id) => !ids.has(id)));
  for (const id of externalTargets) updateMemoSequence(deps.db,id,nextMemoSequence(deps.db));
  return { imported: batch.memos.length,ids: batch.memos.map((memo) => memo.id) };
}
