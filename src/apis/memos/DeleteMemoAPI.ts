import { DeleteMemo, type DeleteMemoInputSchema } from '../../../shared/contracts/memos';
import type { z } from 'zod';
import { sendAPI } from '../../system/api/sendAPI';

export const DeleteMemoAPI = (input: z.input<typeof DeleteMemoInputSchema>, signal?: AbortSignal) => sendAPI(DeleteMemo, input, signal);
