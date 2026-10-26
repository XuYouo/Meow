import { CreateMemo, type CreateMemoInputSchema } from '../../../shared/contracts/memos';
import type { z } from 'zod';
import { sendAPI } from '../../system/api/sendAPI';

export const CreateMemoAPI = (input: z.input<typeof CreateMemoInputSchema>, signal?: AbortSignal) => sendAPI(CreateMemo, input, signal);
