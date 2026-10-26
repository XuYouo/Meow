import { touchRelatedMemos } from '../utils/touchRelatedMemos.js';
import type { z } from 'zod';
import { SetMemoVisibilityInputSchema, MemoSchema } from '../../../../shared/contracts/memos/index.js';
import { updateMemoRow } from '../tables/memos/table.js';
import { nextMemoSequence } from '../tables/revisions/table.js';
import { plan as requireOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { currentMemo } from '../utils/currentMemo.js';
import { projectMemo } from '../utils/projectMemo.js';
import { writeOperation } from '../utils/writeOperation.js';
import type { MemoDependencies } from '../utils/MemoDependencies.js';

export function plan(input: z.infer<typeof SetMemoVisibilityInputSchema>, deps: MemoDependencies) {
  requireOwner({ principal: deps.principal });
  return writeOperation(deps,'visibility',input,MemoSchema,() => {
    const previous = currentMemo(deps,input.id,input.baseRevision);
    const before = projectMemo(deps.db,previous,false);
    const row = { ...previous,is_public: Number(input.isPublic),revision: previous.revision+1,sequence: nextMemoSequence(deps.db),updated_at: deps.now() };
    updateMemoRow(deps.db,row,input.baseRevision);
    touchRelatedMemos(deps,before.links);
    const result = projectMemo(deps.db,row,false);
    deps.onMemoChanged?.(before,result,deps.principal);
    return result;
  });
}
