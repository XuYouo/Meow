import type { z } from 'zod';

import { ResetReview } from '../../../shared/contracts/review';
import { sendAPI } from '../../system/api/sendAPI';

export const ResetReviewAPI = (input: z.input<typeof ResetReview.input>, signal?: AbortSignal) => sendAPI(ResetReview, input, signal);
