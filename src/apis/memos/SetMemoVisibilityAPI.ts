import { SetMemoVisibility, type SetMemoVisibilityInputSchema } from '../../../shared/contracts/memos';
import type { z } from 'zod';
import { sendAPI } from '../../system/api/sendAPI';

export const SetMemoVisibilityAPI = (input: z.input<typeof SetMemoVisibilityInputSchema>, signal?: AbortSignal) => sendAPI(SetMemoVisibility, input, signal);
