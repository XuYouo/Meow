import type { MediaDTO } from '../../../../shared/contracts/media/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import type { Media } from '../objects/Media.js';
import { findAsset } from '../tables/assets/table.js';
import { referenceCount } from '../tables/references/table.js';
import type { MediaDependencies } from './MediaDependencies.js';

export function requireOwner(deps: Pick<MediaDependencies, 'principal'>): void {
  if (deps.principal.kind !== 'owner') throw new AppError(401, 'UNAUTHENTICATED', '请先登录。');
}

export function readableAsset(id: string, deps: Pick<MediaDependencies, 'db' | 'principal'>): Media {
  const asset = findAsset(deps.db, id);
  if (!asset || asset.state !== 'ready' || (deps.principal.kind !== 'owner' && referenceCount(deps.db, id, true) === 0)) {
    throw new AppError(404, 'NOT_FOUND', '附件不存在。');
  }
  return asset;
}

export function mediaDTO(asset: Media): MediaDTO {
  return { id: asset.id, fileName: asset.fileName, mimeType: asset.mimeType, size: asset.size, sha256: asset.sha256, createdAt: asset.createdAt };
}
