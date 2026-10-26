import type Database from 'better-sqlite3';
import { TrackSchema } from '../../../../shared/contracts/music/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { findTrack } from '../tables/tracks/table.js';

export function currentTrack(db: Database.Database, id: string, baseRevision: number) {
  const track = findTrack(db, id);
  if (!track) throw new AppError(404, 'TRACK_NOT_FOUND', 'Track not found.');
  const current = TrackSchema.parse(track);
  if (current.revision !== baseRevision) throw new AppError(409, 'MUSIC_CONFLICT', 'This track changed on another client.', { current });
  return current;
}
