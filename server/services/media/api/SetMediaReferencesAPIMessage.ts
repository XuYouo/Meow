import type Database from 'better-sqlite3';
import { AppError } from '../../../system/errors/AppError.js';
import { findAsset } from '../tables/assets/table.js';
import { replaceReferences } from '../tables/references/table.js';

/** Internal use case; invoked by workspace orchestration inside the caller's unit. */
export function plan(input: { resourceType: 'memo' | 'canvas' | 'music' | 'preferences'; resourceId: string; mediaIds: readonly string[]; isPublic: boolean }, deps: { db: Database.Database }): void {
  for (const id of new Set(input.mediaIds)) {
    const asset = findAsset(deps.db, id);
    if (!asset || asset.state !== 'ready') throw new AppError(400, 'INVALID_MEDIA_REFERENCE', '引用的附件不存在或正在删除。');
  }
  replaceReferences(deps.db, input.resourceType, input.resourceId, input.mediaIds, input.isPublic);
}
