import type { z } from 'zod';

import { RecordReview } from '../../../shared/contracts/review';
import { sendAPI } from '../../system/api/sendAPI';

export const RecordReviewAPI = (input: z.input<typeof RecordReview.input>, signal?: AbortSignal) => sendAPI(RecordReview, input, signal);
