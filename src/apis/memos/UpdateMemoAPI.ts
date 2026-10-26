import { UpdateMemo, type UpdateMemoInputSchema } from '../../../shared/contracts/memos';
import type { z } from 'zod';
import { sendAPI } from '../../system/api/sendAPI';

export const UpdateMemoAPI = (input: z.input<typeof UpdateMemoInputSchema>, signal?: AbortSignal) => sendAPI(UpdateMemo, input, signal);
