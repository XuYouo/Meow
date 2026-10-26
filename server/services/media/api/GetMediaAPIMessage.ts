import type { MediaDependencies } from '../utils/MediaDependencies.js';
import { mediaDTO, readableAsset } from '../utils/access.js';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as assertActiveSession } from '../../identity/api/AssertActiveSessionAPIMessage.js';

export async function plan(input: { id: string }, deps: Pick<MediaDependencies, 'db' | 'principal' | 'uploadsDir' | 'now'>) {
  const asset = readableAsset(input.id, deps);
  const file = await stat(path.join(deps.uploadsDir, `${asset.id}.bin`)).catch(() => null);
  if (deps.principal.kind === 'owner') assertActiveSession(deps);
  readableAsset(input.id, deps);
  if (!file?.isFile() || file.size !== asset.size) throw new AppError(503, 'MEDIA_FILE_MISSING', '附件字节缺失或不完整，请从保留的原文件重新上传。');
  return mediaDTO(asset);
}
