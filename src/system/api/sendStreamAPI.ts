import { z } from 'zod';
import { ErrorResponseSchema, type ApiContract } from '../../../shared/contracts/api.js';
import { ApiError } from './sendAPI.js';
import { notifySessionExpired } from './sessionEvents.js';

const streamEvent = z.union([z.object({ delta: z.string() }).strict(), z.object({ done: z.literal(true) }).strict(), z.object({ error: z.string() }).strict()]);

export async function sendStreamAPI<Input extends z.ZodTypeAny, Output extends z.ZodTypeAny>(
  contract: ApiContract<Input, Output>, input: z.input<Input>, onDelta: (text: string) => void, signal: AbortSignal,
): Promise<void> {
  const value = contract.input.parse(input);
  let response: Response;
  try {
    response = await fetch(contract.path, {
      method: contract.method, credentials: 'same-origin', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-Meow-Request': '1' },
      body: JSON.stringify(value),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', '无法连接AI服务，请稍后重试。');
  }
  if (!response.ok) {
    if (response.status === 401) notifySessionExpired();
    const raw: unknown = await response.json().catch(() => null);
    const parsed = ErrorResponseSchema.safeParse(raw);
    throw new ApiError(response.status, parsed.success ? parsed.data.error.code : 'AI_UNAVAILABLE', parsed.success ? parsed.data.error.message : 'AI服务暂时不可用。');
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new ApiError(502, 'INVALID_RESPONSE', 'AI服务没有返回流式响应。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let received = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > 2 * 1024 * 1024) throw new ApiError(502, 'INVALID_RESPONSE', 'AI响应超过大小限制。');
      pending += decoder.decode(chunk.value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        let raw: unknown;
        try { raw = JSON.parse(line.slice(5).trim()) as unknown; } catch { throw new ApiError(502, 'INVALID_RESPONSE', 'AI响应无法解析。'); }
        const event = streamEvent.safeParse(raw);
        if (!event.success) throw new ApiError(502, 'INVALID_RESPONSE', 'AI响应格式错误。');
        if ('error' in event.data) throw new ApiError(502, 'AI_STREAM_FAILED', event.data.error);
        if ('done' in event.data) return;
        onDelta(event.data.delta);
      }
    }
    throw new ApiError(502, 'AI_STREAM_INCOMPLETE', 'AI响应中断，已收到的文字仍保留在这里。');
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
