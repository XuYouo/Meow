import { touchRelatedMemos } from '../utils/touchRelatedMemos.js';
import type { z } from 'zod';
import { DeleteMemoInputSchema, MemoTombstoneSchema } from '../../../../shared/contracts/memos/index.js';
import { removeMemoRow } from '../tables/memos/table.js';
import { insertTombstone } from '../tables/tombstones/table.js';
import { removeUnusedTags } from '../tables/tags/table.js';
import { nextMemoSequence } from '../tables/revisions/table.js';
import { plan as requireOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { currentMemo } from '../utils/currentMemo.js';
import { projectMemo } from '../utils/projectMemo.js';
import { writeOperation } from '../utils/writeOperation.js';
import type { MemoDependencies } from '../utils/MemoDependencies.js';

export function plan(input: z.infer<typeof DeleteMemoInputSchema>, deps: MemoDependencies) {
  requireOwner({ principal: deps.principal });
  return writeOperation(deps,'delete',input,MemoTombstoneSchema,() => {
    const current = currentMemo(deps,input.id,input.baseRevision);
    const before = projectMemo(deps.db,current,false);
    const tombstone = { id: input.id,revision: current.revision+1,deletedAt: deps.now() };
    removeMemoRow(deps.db,input.id,input.baseRevision);
    insertTombstone(deps.db,tombstone,nextMemoSequence(deps.db));
    removeUnusedTags(deps.db);
    touchRelatedMemos(deps,[...before.links,...before.backlinks]);
    deps.onMemoChanged?.(before,null,deps.principal);
    return tombstone;
  });
}
