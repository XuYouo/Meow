import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { MediaSnapshotSchema, type MediaSnapshot } from '../../../../shared/contracts/media/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { countAssets, insertAsset } from '../tables/assets/table.js';
import { replaceReferences } from '../tables/references/table.js';

/** File staging is the caller's responsibility; only metadata is written here. */
export function plan(snapshot: MediaSnapshot, { db }: { db: Database.Database }): void {
  const value = MediaSnapshotSchema.parse(snapshot);
  if (countAssets(db) !== 0) throw new AppError(409, 'RESTORE_REQUIRES_EMPTY', 'Restore requires an empty workspace.');
  for (const asset of value.assets) insertAsset(db, { ...asset, operationId: randomUUID(), state: 'ready' });
  const resources = new Map<string, typeof value.references>();
  for (const reference of value.references) {
    const key = `${reference.resourceType}:${reference.resourceId}`;
    resources.set(key, [...(resources.get(key) ?? []), reference]);
  }
  for (const references of resources.values()) {
    const first = references[0];
    if (!first) continue;
    replaceReferences(db, first.resourceType, first.resourceId, references.map((reference) => reference.mediaId), first.isPublic);
  }
}
