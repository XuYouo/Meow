import type { z } from 'zod';

import { ListReviewResults } from '../../../shared/contracts/review';
import { sendAPI } from '../../system/api/sendAPI';

export const ListReviewResultsAPI = (input: z.input<typeof ListReviewResults.input>, signal?: AbortSignal) => sendAPI(ListReviewResults, input, signal);
