import type { z } from 'zod';
import { ListReviewResults } from '../../../../shared/contracts/review/index.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { listReviewResults } from '../tables/results/table.js';
import type { ReviewDependencies } from '../utils/ReviewDependencies.js';

export function plan(input: z.infer<typeof ListReviewResults.input>, dependencies: ReviewDependencies) {
  assertOwner(dependencies);
  const result = listReviewResults(dependencies.db, input);
  return ListReviewResults.output.parse({ ...result, nextOffset: input.offset + result.items.length < result.total ? input.offset + result.items.length : null });
}
