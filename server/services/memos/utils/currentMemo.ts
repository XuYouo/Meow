import { AppError } from '../../../system/errors/AppError.js';
import { getMemoRow } from '../tables/memos/table.js';
import { getTombstone } from '../tables/tombstones/table.js';
import type { MemoRow } from '../objects/MemoRow.js';
import type { MemoDependencies } from './MemoDependencies.js';
import { projectMemo } from './projectMemo.js';

export function currentMemo(deps: MemoDependencies, id: string, baseRevision: number): MemoRow {
  const row = getMemoRow(deps.db,id);
  if (!row) {
    if (getTombstone(deps.db,id)) throw new AppError(409,'MEMO_DELETED','该笔记已经删除',{ current: null,deleted: true });
    throw new AppError(404,'MEMO_NOT_FOUND','笔记不存在');
  }
  if (row.revision !== baseRevision) throw new AppError(409,'REVISION_CONFLICT','笔记已有更新，请检查冲突',{ current: projectMemo(deps.db,row,false) });
  return row;
}
