import type { z } from 'zod';

import { ErrorResponseSchema, type ApiContract } from '../../../shared/contracts/api';
import { notifySessionExpired } from './sessionEvents';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function sendAPI<Input extends z.ZodTypeAny, Output extends z.ZodTypeAny>(
  contract: ApiContract<Input, Output>, input: z.input<Input>, signal?: AbortSignal,
): Promise<z.output<Output>> {
  const value = contract.input.parse(input) as Record<string, unknown>;
  let path = contract.path;
  const remaining = { ...value };
  for (const [key, entry] of Object.entries(value)) {
    if (!path.includes(`:${key}`)) continue;
    path = path.replace(`:${key}`, encodeURIComponent(String(entry)));
    delete remaining[key];
  }
  const url = new URL(path, window.location.origin);
  const isRead = contract.method === 'GET';
  if (isRead) {
    for (const [key, entry] of Object.entries(remaining)) if (entry !== undefined && entry !== null) url.searchParams.set(key, String(entry));
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: contract.method, credentials: 'same-origin', signal,
      headers: isRead ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Meow-Request': '1' },
      ...(isRead ? {} : { body: JSON.stringify(remaining) }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', '无法连接服务器。本地保存的更改将在重新连接后提交。');
  }
  if (response.status === 401 && contract.path !== '/api/session/login') notifySessionExpired();
  let body: unknown;
  try { body = await response.json(); } catch { throw new ApiError(response.status, 'INVALID_RESPONSE', '服务器响应无法解析，请稍后重试。'); }
  if (!response.ok) {
    const parsed = ErrorResponseSchema.safeParse(body);
    if (parsed.success) throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.details);
    throw new ApiError(response.status, 'REQUEST_FAILED', '请求未完成，请稍后重试。');
  }
  const parsed = contract.output.safeParse(body);
  if (!parsed.success) throw new ApiError(502, 'INVALID_RESPONSE', '服务器响应格式不正确，未修改本地待提交内容。');
  return parsed.data;
}
