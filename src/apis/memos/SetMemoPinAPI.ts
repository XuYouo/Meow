import { SetMemoPin, type SetMemoPinInputSchema } from '../../../shared/contracts/memos';
import type { z } from 'zod';
import { sendAPI } from '../../system/api/sendAPI';

export const SetMemoPinAPI = (input: z.input<typeof SetMemoPinInputSchema>, signal?: AbortSignal) => sendAPI(SetMemoPin, input, signal);
