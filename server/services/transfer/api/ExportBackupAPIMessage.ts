import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { MAX_BACKUP_BYTES, BackupPackageSchema } from '../../../../shared/contracts/transfer/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as assertActiveSession } from '../../identity/api/AssertActiveSessionAPIMessage.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import type { TransferDependencies } from '../utils/TransferDependencies.js';
import { counts, snapshot } from '../utils/snapshot.js';
import { digest } from '../utils/package.js';
import { validateReferences } from '../utils/references.js';

export async function plan(dependencies: TransferDependencies): Promise<{ bytes: Buffer; backupId: string }> {
  assertOwner(dependencies);
  const entities = dependencies.unitOfWork.run(() => snapshot(dependencies.db));
  validateReferences(entities);
  const total = counts(entities);
  // Base64 adds 4/3 overhead. Reserve space for entities before allocating asset strings.
  if (4 * Math.ceil(total.assetBytes / 3) + Buffer.byteLength(JSON.stringify(entities)) > MAX_BACKUP_BYTES - 1024 * 1024) throw new AppError(413, 'BACKUP_LIMIT', 'The complete backup would exceed the 128MB package limit.');
  const assets: { id: string; base64: string }[] = [];
  for (const asset of entities.media.assets) {
    const location = path.join(dependencies.uploadsDir, `${asset.id}.bin`);
    const details = await stat(location).catch(() => { throw new AppError(503, 'BACKUP_ASSET_MISSING', 'A backup asset file is unavailable.'); });
    if (details.size !== asset.size) throw new AppError(503, 'BACKUP_ASSET_CHANGED', 'An asset changed during export. Retry after checking storage.');
    const content = await readFile(location);
    if (digest(content) !== asset.sha256) throw new AppError(503, 'BACKUP_HASH_MISMATCH', 'An existing asset failed its integrity check.');
    assets.push({ id: asset.id, base64: content.toString('base64') });
  }
  const backupId = randomUUID();
  const value = BackupPackageSchema.parse({ manifest: {
    format: 'meow-workspace', formatVersion: 1, schemaVersion: 1, backupId, createdAt: dependencies.now(), sourceInstanceId: dependencies.instanceId, counts: total,
    excluded: ['credentials', 'sessions', 'operationReceipts', 'devicePreferences'],
    unbundledExternalTracks: entities.music.tracks.flatMap((track) => track.source.kind === 'external' ? [{ trackId: track.id, url: track.source.url, reason: 'externally-hosted' }] : []),
  }, entities, assets });
  const bytes = Buffer.from(JSON.stringify(value), 'utf8');
  if (bytes.length > MAX_BACKUP_BYTES) throw new AppError(413, 'BACKUP_LIMIT', 'The complete backup exceeds 128MB. No partial export was produced.');
  assertActiveSession(dependencies);
  return { bytes, backupId };
}
