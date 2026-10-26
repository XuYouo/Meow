import { getMemoRow, updateMemoSequence } from '../tables/memos/table.js';
import { nextMemoSequence } from '../tables/revisions/table.js';
import type { MemoDependencies } from './MemoDependencies.js';

/** Backlink projections change without changing another memo's editable revision. */
export function touchRelatedMemos(deps: MemoDependencies, ids: string[]): void {
  for (const id of [...new Set(ids)]) if (getMemoRow(deps.db,id)) updateMemoSequence(deps.db,id,nextMemoSequence(deps.db));
}
