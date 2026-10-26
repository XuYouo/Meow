import type { z } from 'zod';
import { AppError } from '../../../system/errors/AppError.js';

export function parseExternal<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(502, 'INVALID_EXTERNAL_RESPONSE', '外部服务返回了不受支持的数据。');
  return result.data;
}
