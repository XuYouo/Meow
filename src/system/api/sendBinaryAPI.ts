import type { z } from 'zod';

import { ErrorResponseSchema, type ApiContract } from '../../../shared/contracts/api';
import { ApiError } from './sendAPI';
import { notifySessionExpired } from './sessionEvents';

export async function sendBinaryAPI<Input extends z.ZodTypeAny, Output extends z.ZodTypeAny>(contract: ApiContract<Input, Output>, input: z.input<Input>, bytes: Blob, signal?: AbortSignal): Promise<z.output<Output>> {
  const metadata = contract.input.parse(input) as Record<string, unknown>;
  const url = new URL(contract.path, window.location.origin);
  for (const [key, value] of Object.entries(metadata)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  let response: Response;
  try {
    response = await fetch(url, { method: contract.method, credentials: 'same-origin', signal, headers: { Accept: 'application/json', 'Content-Type': 'application/octet-stream', 'X-Meow-Request': '1' }, body: bytes });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', '上传未确认，请重试；已经保存的笔记不会受影响。');
  }
  if (response.status === 401) notifySessionExpired();
  let body: unknown;
  try { body = await response.json(); } catch { throw new ApiError(response.status, 'INVALID_RESPONSE', '上传响应无法解析，请重试。'); }
  if (!response.ok) {
    const error = ErrorResponseSchema.safeParse(body);
    if (error.success) throw new ApiError(response.status, error.data.error.code, error.data.error.message, error.data.error.details);
    throw new ApiError(response.status, 'UPLOAD_FAILED', '上传失败，请重试。');
  }
  const result = contract.output.safeParse(body);
  if (!result.success) throw new ApiError(502, 'INVALID_RESPONSE', '上传响应格式不正确，文件尚未加入笔记。');
  return result.data;
}
