import { z } from 'zod';
import { Chat, ChatInputSchema } from '../../../shared/contracts/integrations/index.js';
import { sendStreamAPI } from '../../system/api/sendStreamAPI.js';

export function ChatAPI(input: z.input<typeof ChatInputSchema>, onDelta: (text: string) => void, signal: AbortSignal) {
  return sendStreamAPI(Chat, input, onDelta, signal);
}
