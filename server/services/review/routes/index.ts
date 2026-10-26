import type { ApplicationRuntime } from '../../../app.js';
import type { RouteRegistry } from '../../../system/http/RouteRegistry.js';
import { ListReviewResults, RecordReview, ResetReview, ResetReviewGroup } from '../../../../shared/contracts/review/index.js';
import { plan as listReviewResults } from '../api/ListReviewResultsAPIMessage.js';
import { plan as recordReview } from '../api/RecordReviewAPIMessage.js';
import { plan as resetReviewGroup } from '../api/ResetReviewGroupAPIMessage.js';
import { plan as resetReview } from '../api/ResetReviewAPIMessage.js';

export function registerReviewRoutes(registry: RouteRegistry, runtime: ApplicationRuntime): void {
  registry.register({ contract: ListReviewResults, access: 'owner', handler: (input, { principal }) => listReviewResults(input, { ...runtime, principal }) });
  registry.register({ contract: RecordReview, access: 'owner', handler: (input, { principal }) => recordReview(input, { ...runtime, principal }) });
  registry.register({ contract: ResetReviewGroup, access: 'owner', handler: (input, { principal }) => resetReviewGroup(input, { ...runtime, principal }) });
  registry.register({ contract: ResetReview, access: 'owner', handler: (input, { principal }) => resetReview(input, { ...runtime, principal }) });
}
