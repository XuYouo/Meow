import type { z } from 'zod';
import { ResetReviewGroup } from '../../../../shared/contracts/review/index.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { plan as recordReview } from './RecordReviewAPIMessage.js';
import type { ReviewDependencies } from '../utils/ReviewDependencies.js';

/** The registry executes this whole group in one synchronous work unit. */
export function plan(input:z.infer<typeof ResetReviewGroup.input>,dependencies:ReviewDependencies) {
  assertOwner(dependencies);
  return {items:input.entries.map((entry) => recordReview({...entry,day:input.day,timezone:input.timezone,result:'FAIL'},dependencies))};
}
