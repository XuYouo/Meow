import { AppError } from '../../../system/errors/AppError.js';
import { getMemoRow } from '../tables/memos/table.js';
import { projectMemo } from '../utils/projectMemo.js';
import type { MemoDependencies } from '../utils/MemoDependencies.js';

export function plan(input: { id: string }, deps: MemoDependencies) {
  const row = getMemoRow(deps.db,input.id);
  const publicOnly = deps.principal.kind !== 'owner';
  if (!row || (publicOnly && row.is_public !== 1)) throw new AppError(404,'MEMO_NOT_FOUND','笔记不存在');
  return projectMemo(deps.db,row,publicOnly);
}
