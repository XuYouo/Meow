import { stat } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as assertActiveSession } from '../../identity/api/AssertActiveSessionAPIMessage.js';
import { findAsset, findAssetOperation } from '../tables/assets/table.js';
import type { MediaDependencies } from '../utils/MediaDependencies.js';
import { mediaDTO, requireOwner } from '../utils/access.js';

/** Internal idempotency lookup, used before repeating an external download. */
export async function plan(input: { id: string; operationId: string; fileName: string }, deps: MediaDependencies) {
  requireOwner(deps);
  const asset = findAssetOperation(deps.db, input.operationId) ?? findAsset(deps.db, input.id);
  if (!asset) return null;
  if (asset.id !== input.id || asset.operationId !== input.operationId || asset.fileName !== input.fileName || asset.state !== 'ready') {
    throw new AppError(409, 'OPERATION_CONFLICT', '上传标识已用于不同内容。');
  }
  const file = await stat(path.join(deps.uploadsDir, `${asset.id}.bin`)).catch(() => null);
  assertActiveSession(deps);
  if (!file?.isFile() || file.size !== asset.size) throw new AppError(409, 'MEDIA_FILE_MISSING', '附件文件不完整，请重新上传。');
  return mediaDTO(asset);
}
