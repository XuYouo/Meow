import type Database from 'better-sqlite3';
import { MediaSnapshotSchema } from '../../../../shared/contracts/media/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { countAssets, listAssets } from '../tables/assets/table.js';
import { listReferences } from '../tables/references/table.js';

export function plan({ db }: { db: Database.Database }) {
  if (countAssets(db) > 5000) throw new AppError(413, 'BACKUP_LIMIT', 'This workspace exceeds the backup limit of 5000 media assets.');
  const assets = listAssets(db);
  if (assets.some((asset) => asset.state !== 'ready')) throw new AppError(409, 'MEDIA_BUSY', 'Wait for pending media cleanup before exporting a backup.');
  const references = listReferences(db, 100_000);
  if (references.length > 100_000) throw new AppError(413, 'BACKUP_LIMIT', 'This workspace exceeds the backup reference limit.');
  return MediaSnapshotSchema.parse({ assets: assets.map(({ id, fileName, mimeType, size, sha256, createdAt }) => ({ id, fileName, mimeType, size, sha256, createdAt })), references });
}
