import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { CanvasSchema, SaveCanvasInputSchema } from '../../../../shared/contracts/canvas/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as requireOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { plan as getMemo } from '../../memos/api/GetMemoAPIMessage.js';
import { readCanvas, writeCanvas } from '../tables/canvases/table.js';
import { findCanvasOperation, saveCanvasOperation } from '../tables/operations/table.js';
import { plan as getCanvas } from './GetCanvasAPIMessage.js';
import type { CanvasDependencies } from '../utils/CanvasDependencies.js';

export function plan(input: z.infer<typeof SaveCanvasInputSchema>, deps: CanvasDependencies) {
  requireOwner({ principal: deps.principal });
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const operation = findCanvasOperation(deps.db,input.operationId);
  if (operation) {
    if (operation.fingerprint !== fingerprint) throw new AppError(409,'OPERATION_REUSED','操作标识已被其他请求使用');
    return CanvasSchema.parse(JSON.parse(operation.responseJson));
  }
  const previous = getCanvas(deps);
  if (input.baseRevision !== previous.revision) throw new AppError(409,'CANVAS_CONFLICT','画布已有更新，本地画布已保留',{ current: previous });
  for (const position of input.document.memoPositions) getMemo({ id: position.memoId },deps);
  const next = { revision: previous.revision+1,updatedAt: deps.now(),document: input.document };
  if (!writeCanvas(deps.db,next,input.baseRevision)) throw new AppError(409,'CANVAS_CONFLICT','画布已有更新',{ current: readCanvas(deps.db) });
  deps.onCanvasChanged?.(previous,next);
  saveCanvasOperation(deps.db,input.operationId,fingerprint,next);
  return next;
}
