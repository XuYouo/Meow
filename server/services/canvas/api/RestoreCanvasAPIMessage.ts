import type Database from 'better-sqlite3';
import { CanvasSchema, type CanvasDTO } from '../../../../shared/contracts/canvas/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as assertMemoReferences } from '../../memos/api/AssertMemoReferencesAPIMessage.js';
import { readCanvas, writeCanvas } from '../tables/canvases/table.js';

export function plan(input: CanvasDTO, deps: { db: Database.Database }): void {
  const snapshot=CanvasSchema.parse(input);
  if (readCanvas(deps.db)) throw new AppError(409,'RESTORE_NOT_EMPTY','恢复目标画布必须为空');
  if (snapshot.revision===0) {
    if (snapshot.updatedAt!==null||snapshot.document.shapes.length||snapshot.document.memoPositions.length||snapshot.document.viewport.x!==0||snapshot.document.viewport.y!==0||snapshot.document.viewport.scale!==1) throw new AppError(400,'INVALID_BACKUP','初始画布快照无效');
    return;
  }
  if (!snapshot.updatedAt) throw new AppError(400,'INVALID_BACKUP','画布缺少修改时间');
  assertMemoReferences({ ids: snapshot.document.memoPositions.map((position) => position.memoId) },deps);
  if (!writeCanvas(deps.db,snapshot,0)) throw new AppError(409,'RESTORE_NOT_EMPTY','恢复目标画布必须为空');
}
