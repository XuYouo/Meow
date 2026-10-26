import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../system/errors/AppError.js';
import { getMemoOperation, recordMemoOperation } from '../tables/operations/table.js';
import type { MemoDependencies } from './MemoDependencies.js';

export function writeOperation<T>(deps: MemoDependencies, action: string, input: { operationId: string }, schema: z.ZodType<T>, mutate: () => T): T {
  const fingerprint = createHash('sha256').update(JSON.stringify({ action,input })).digest('hex');
  const existing = getMemoOperation(deps.db,input.operationId);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new AppError(409,'OPERATION_REUSED','操作标识已被其他请求使用');
    return schema.parse(JSON.parse(existing.responseJson));
  }
  const result = mutate();
  recordMemoOperation(deps.db,input.operationId,fingerprint,result,deps.now());
  return result;
}
