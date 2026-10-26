import type Database from 'better-sqlite3';
import { AppError } from '../../../system/errors/AppError.js';
import { findAsset } from '../tables/assets/table.js';

/** Internal workspace validation; caller already authorizes the owning resource. */
export function plan(input: readonly { mediaId: string; kind: 'image' | 'audio' | 'file' }[], dependencies: { db: Database.Database }): void {
  for (const reference of input) {
    const asset = findAsset(dependencies.db, reference.mediaId);
    if (!asset || asset.state !== 'ready') throw new AppError(400, 'INVALID_MEDIA_REFERENCE', '引用的附件不存在或正在删除。');
    if (reference.kind !== 'file' && !asset.mimeType.startsWith(`${reference.kind}/`)) {
      throw new AppError(400, 'INVALID_MEDIA_REFERENCE', '附件类型与使用位置不符。');
    }
  }
}
