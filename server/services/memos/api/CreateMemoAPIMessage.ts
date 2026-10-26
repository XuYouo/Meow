import { touchRelatedMemos } from '../utils/touchRelatedMemos.js';
import type { z } from 'zod';
import { CreateMemoInputSchema, MemoSchema } from '../../../../shared/contracts/memos/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { getMemoRow, insertMemoRow } from '../tables/memos/table.js';
import { getTombstone } from '../tables/tombstones/table.js';
import { nextMemoSequence } from '../tables/revisions/table.js';
import { setMemoPin } from '../tables/memoPins/table.js';
import { plan as requireOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { normalizeMemo } from '../utils/normalizeMemo.js';
import { projectMemo } from '../utils/projectMemo.js';
import { writeOperation } from '../utils/writeOperation.js';
import { writeRelations } from '../utils/writeRelations.js';
import type { MemoDependencies } from '../utils/MemoDependencies.js';

export function plan(input: z.infer<typeof CreateMemoInputSchema>, deps: MemoDependencies) {
  requireOwner({ principal: deps.principal });
  return writeOperation(deps,'create',input,MemoSchema,() => {
    if (getTombstone(deps.db,input.id)) throw new AppError(409,'MEMO_DELETED','该笔记标识已删除，不能重新创建',{ current: null,deleted: true });
    const current = getMemoRow(deps.db,input.id);
    if (current) throw new AppError(409,'MEMO_EXISTS','笔记标识已存在',{ current: projectMemo(deps.db,current,false) });
    const value = normalizeMemo(input);
    const now = deps.now();
    const row = { id: input.id,content: value.content,is_public: Number(input.isPublic),revision: 1,sequence: nextMemoSequence(deps.db),created_at: now,updated_at: now };
    insertMemoRow(deps.db,row);
    writeRelations(deps,input.id,value);
    setMemoPin(deps.db,input.id,input.isPinned);
    touchRelatedMemos(deps,value.links);
    const result = projectMemo(deps.db,row,false);
    deps.onMemoChanged?.(null,result,deps.principal);
    return result;
  });
}
