import type { z } from 'zod';
import { GetMemoChangesInputSchema, GetMemoChangesOutputSchema } from '../../../../shared/contracts/memos/index.js';
import { listChangedMemoRows } from '../tables/memos/table.js';
import { listChangedTombstones } from '../tables/tombstones/table.js';
import { plan as requireOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { projectMemo } from '../utils/projectMemo.js';
import type { MemoDependencies } from '../utils/MemoDependencies.js';

type Change = z.infer<typeof GetMemoChangesOutputSchema>['changes'][number];
export function plan(input: z.infer<typeof GetMemoChangesInputSchema>, deps: MemoDependencies) {
  requireOwner({ principal: deps.principal });
  const updated: Change[] = listChangedMemoRows(deps.db,input.since).map((row) => ({ kind: 'updated',sequence: row.sequence,memo: projectMemo(deps.db,row,false) }));
  const deleted: Change[] = listChangedTombstones(deps.db,input.since).map((row) => ({ kind: 'deleted',...row }));
  const sorted = [...updated,...deleted].sort((left,right) => left.sequence-right.sequence);
  const changes = sorted.slice(0,input.limit);
  return { changes,nextCursor: changes.at(-1)?.sequence ?? input.since,hasMore: sorted.length > input.limit };
}
