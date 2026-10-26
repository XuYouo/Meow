import { AppError } from '../../../system/errors/AppError.js';
import { ReviewResultSchema } from '../../../../shared/contracts/review/index.js';
import { findReviewResult, readReviewOperation, saveReviewOperation, saveReviewResult } from '../tables/results/table.js';
import type { ReviewDependencies } from './ReviewDependencies.js';

export function writeReview(input: { memoId: string; day: string; timezone: string; result: 'PASS' | 'FAIL' | null; baseRevision: number; operationId: string }, dependencies: ReviewDependencies) {
  const inputJson = JSON.stringify(input);
  const receipt = readReviewOperation(dependencies.db, input.operationId);
  if (receipt) {
    if (receipt.input !== inputJson) throw new AppError(409, 'OPERATION_REUSED', 'This operation ID was already used with different input.');
    return receipt.output;
  }
  const current = findReviewResult(dependencies.db, input);
  if ((current?.revision ?? 0) !== input.baseRevision) {
    throw new AppError(409, 'REVIEW_CONFLICT', 'This review result changed on another client.', { current: current ?? null });
  }
  const result = ReviewResultSchema.parse({ memoId: input.memoId, day: input.day, timezone: input.timezone, result: input.result, revision: input.baseRevision + 1, updatedAt: dependencies.now() });
  saveReviewResult(dependencies.db, result);
  saveReviewOperation(dependencies.db, input.operationId, inputJson, result);
  return result;
}
