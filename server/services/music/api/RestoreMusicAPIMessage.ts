import type Database from 'better-sqlite3';
import { MusicSnapshotSchema, type MusicSnapshot } from '../../../../shared/contracts/music/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { insertRestoredTombstone, insertRestoredTrack, musicEmpty, restoreLibraryRevision } from '../tables/tracks/table.js';

export function plan(snapshot: MusicSnapshot, { db }: { db: Database.Database }): void {
  const value = MusicSnapshotSchema.parse(snapshot);
  if (!musicEmpty(db)) throw new AppError(409, 'RESTORE_REQUIRES_EMPTY', 'Restore requires an empty workspace.');
  for (const track of value.tracks) insertRestoredTrack(db, track);
  for (const tombstone of value.tombstones) insertRestoredTombstone(db, tombstone);
  restoreLibraryRevision(db, value.libraryRevision);
}
