import { ListMemos, type ListMemosInputSchema } from '../../../shared/contracts/memos';
import type { z } from 'zod';
import { sendAPI } from '../../system/api/sendAPI';

export const ListMemosAPI = (input: z.input<typeof ListMemosInputSchema>, signal?: AbortSignal) => sendAPI(ListMemos, input, signal);
