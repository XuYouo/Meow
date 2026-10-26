import type Database from 'better-sqlite3';
import { MusicSnapshotSchema } from '../../../../shared/contracts/music/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { allTrackTombstones, getLibraryRevision, listTracks } from '../tables/tracks/table.js';

export function plan({ db }: { db: Database.Database }) {
  const tracks = listTracks(db, 0, 10_001);
  const tombstones = allTrackTombstones(db, 10_000);
  if (tracks.total > 10_000 || tombstones.length > 10_000) throw new AppError(413, 'BACKUP_LIMIT', 'This workspace exceeds the backup limit of 10000 music entities.');
  return MusicSnapshotSchema.parse({ tracks: tracks.items, tombstones, libraryRevision: getLibraryRevision(db) });
}
