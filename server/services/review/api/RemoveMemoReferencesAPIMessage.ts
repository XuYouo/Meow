import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { removeMemoResults } from '../tables/results/table.js';
import type { ReviewDependencies } from '../utils/ReviewDependencies.js';

/** Internal workspace operation. The caller shares the memo deletion work unit. */
export function plan(input: { memoId: string }, dependencies: ReviewDependencies): void {
  assertOwner(dependencies);
  removeMemoResults(dependencies.db, input.memoId);
}
