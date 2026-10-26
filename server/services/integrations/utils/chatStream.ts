import { StringDecoder } from 'node:string_decoder';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import { AppError } from '../../../system/errors/AppError.js';
import { parseExternal } from './parseExternal.js';

const chunkSchema = z.object({ choices: z.array(z.object({ delta: z.object({ content: z.string().nullable().optional(), refusal: z.string().nullable().optional() }) })) });

export async function* chatDeltas(stream: Readable): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let bytes = 0;
  let finished = false;
  try {
    for await (const raw of stream) {
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) throw new AppError(502, 'EXTERNAL_TOO_LARGE', 'AI响应超过大小限制。');
      pending += decoder.write(chunk);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const value = line.slice(5).trim();
        if (!value) continue;
        if (value === '[DONE]') { finished = true; return; }
        let data: unknown;
        try { data = JSON.parse(value) as unknown; } catch { throw new AppError(502, 'INVALID_EXTERNAL_RESPONSE', 'AI流式响应无效。'); }
        const parsed = parseExternal(chunkSchema, data);
        const delta = parsed.choices[0]?.delta;
        const text = delta?.content ?? delta?.refusal;
        if (text) yield text;
      }
      if (pending.length > 256 * 1024) throw new AppError(502, 'INVALID_EXTERNAL_RESPONSE', 'AI响应行超过限制。');
    }
    if (!finished) throw new AppError(502, 'INCOMPLETE_AI_RESPONSE', 'AI响应中断，请重试。');
  } finally { stream.destroy(); }
}
