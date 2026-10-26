import type { z } from 'zod';
import { ResetReview } from '../../../../shared/contracts/review/index.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { plan as getMemo } from '../../memos/api/GetMemoAPIMessage.js';
import { writeReview } from '../utils/writeReview.js';
import type { ReviewDependencies } from '../utils/ReviewDependencies.js';

export function plan(input: z.infer<typeof ResetReview.input>, dependencies: ReviewDependencies) {
  assertOwner(dependencies);
  getMemo({ id: input.memoId }, dependencies);
  return writeReview({ ...input, result: null }, dependencies);
}
