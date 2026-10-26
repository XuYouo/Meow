import type { z } from 'zod';
import { SetMemoPinInputSchema, MemoSchema } from '../../../../shared/contracts/memos/index.js';
import { updateMemoRow } from '../tables/memos/table.js';
import { setMemoPin } from '../tables/memoPins/table.js';
import { nextMemoSequence } from '../tables/revisions/table.js';
import { plan as requireOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { currentMemo } from '../utils/currentMemo.js';
import { projectMemo } from '../utils/projectMemo.js';
import { writeOperation } from '../utils/writeOperation.js';
import type { MemoDependencies } from '../utils/MemoDependencies.js';

export function plan(input: z.infer<typeof SetMemoPinInputSchema>, deps: MemoDependencies) {
  requireOwner({ principal: deps.principal });
  return writeOperation(deps,'pin',input,MemoSchema,() => {
    const previous = currentMemo(deps,input.id,input.baseRevision);
    const row = { ...previous,revision: previous.revision+1,sequence: nextMemoSequence(deps.db),updated_at: deps.now() };
    updateMemoRow(deps.db,row,input.baseRevision);
    setMemoPin(deps.db,input.id,input.isPinned);
    return projectMemo(deps.db,row,false);
  });
}
