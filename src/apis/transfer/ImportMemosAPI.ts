import type { z } from 'zod';
import { ImportMemos } from '../../../shared/contracts/transfer';
import { sendAPI } from '../../system/api/sendAPI';

export function ImportMemosAPI(input: z.input<typeof ImportMemos.input>, signal?: AbortSignal) {
  return sendAPI(ImportMemos, input, signal);
}
