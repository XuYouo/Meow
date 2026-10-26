import type { z } from 'zod';
import { ResetReviewGroup } from '../../../shared/contracts/review';
import { sendAPI } from '../../system/api/sendAPI';
export const ResetReviewGroupAPI=(input:z.input<typeof ResetReviewGroup.input>,signal?:AbortSignal)=>sendAPI(ResetReviewGroup,input,signal);
