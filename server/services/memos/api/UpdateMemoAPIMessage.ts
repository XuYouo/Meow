import { touchRelatedMemos } from '../utils/touchRelatedMemos.js';
import type { z } from 'zod';
import { UpdateMemoInputSchema, MemoSchema } from '../../../../shared/contracts/memos/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { updateMemoRow } from '../tables/memos/table.js';
import { nextMemoSequence } from '../tables/revisions/table.js';
import { currentMemo } from '../utils/currentMemo.js';
import { plan as requireOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { normalizeMemo } from '../utils/normalizeMemo.js';
import { projectMemo } from '../utils/projectMemo.js';
import { writeOperation } from '../utils/writeOperation.js';
import { writeRelations } from '../utils/writeRelations.js';
import type { MemoDependencies } from '../utils/MemoDependencies.js';

export function plan(input: z.infer<typeof UpdateMemoInputSchema>, deps: MemoDependencies) {
  requireOwner({ principal: deps.principal });
  return writeOperation(deps,'update',input,MemoSchema,() => {
    const previous = currentMemo(deps,input.id,input.baseRevision);
    const before = projectMemo(deps.db,previous,false);
    const value = normalizeMemo(input);
    const row = { ...previous,content: value.content,revision: previous.revision+1,sequence: nextMemoSequence(deps.db),updated_at: deps.now() };
    if (!updateMemoRow(deps.db,row,input.baseRevision)) throw new AppError(409,'REVISION_CONFLICT','笔记已有更新');
    writeRelations(deps,input.id,value);
    touchRelatedMemos(deps,[...before.links,...value.links]);
    const result = projectMemo(deps.db,row,false);
    deps.onMemoChanged?.(before,result,deps.principal);
    return result;
  });
}
