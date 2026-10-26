import type Database from 'better-sqlite3';
import { TrackDeletionSchema, TrackValuesSchema, type TrackValues } from '../../../../../shared/contracts/music/index.js';
import type { Track } from '../../objects/Track.js';

interface TrackRow { id: string; metadata_json: string; revision: number; position: number; created_at: string; updated_at: string }
const map = (row: TrackRow): Track => ({ ...TrackValuesSchema.parse(JSON.parse(row.metadata_json)), id: row.id, revision: row.revision, position: row.position, createdAt: row.created_at, updatedAt: row.updated_at });

export function findTrack(db: Database.Database, id: string): Track | undefined {
  const row = db.prepare('SELECT id, metadata_json, revision, position, created_at, updated_at FROM music_tracks WHERE id = ?').get(id) as TrackRow | undefined;
  return row ? map(row) : undefined;
}
export function listTracks(db: Database.Database, offset: number, limit: number): { items: Track[]; total: number } {
  const rows = db.prepare('SELECT id, metadata_json, revision, position, created_at, updated_at FROM music_tracks ORDER BY position, id LIMIT ? OFFSET ?').all(limit, offset) as TrackRow[];
  const count = db.prepare('SELECT COUNT(*) AS count FROM music_tracks').get() as { count: number };
  return { items: rows.map(map), total: count.count };
}
export function orderedTrackIds(db: Database.Database): string[] {
  return (db.prepare('SELECT id FROM music_tracks ORDER BY position, id').all() as { id: string }[]).map((row) => row.id);
}
export function getLibraryRevision(db: Database.Database): number {
  const row = db.prepare('SELECT revision FROM music_library WHERE singleton = 1').get() as { revision: number };
  return row.revision;
}
export function advanceLibraryRevision(db: Database.Database): number {
  db.prepare('UPDATE music_library SET revision = revision + 1 WHERE singleton = 1').run();
  return getLibraryRevision(db);
}
export function nextTrackPosition(db: Database.Database): number {
  const row = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM music_tracks').get() as { position: number };
  return row.position;
}
export function insertTrack(db: Database.Database, values: TrackValues, identity: { id: string; position: number; at: string }): void {
  db.prepare('INSERT INTO music_tracks (id, metadata_json, revision, position, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)').run(identity.id, JSON.stringify(values), identity.position, identity.at, identity.at);
}
export function updateTrack(db: Database.Database, id: string, values: TrackValues, revision: number, at: string): void {
  db.prepare('UPDATE music_tracks SET metadata_json = ?, revision = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(values), revision, at, id);
}
export function setTrackPosition(db: Database.Database, id: string, position: number): void {
  db.prepare('UPDATE music_tracks SET position = ? WHERE id = ?').run(position, id);
}
export function removeTrack(db: Database.Database, tombstone: { id: string; revision: number; deletedAt: string }): void {
  db.prepare('DELETE FROM music_tracks WHERE id = ?').run(tombstone.id);
  db.prepare('INSERT INTO music_tombstones (id, revision, deleted_at) VALUES (?, ?, ?)').run(tombstone.id, tombstone.revision, tombstone.deletedAt);
}
export function findTrackTombstone(db: Database.Database, id: string) {
  const row = db.prepare('SELECT id, revision, deleted_at FROM music_tombstones WHERE id = ?').get(id) as { id: string; revision: number; deleted_at: string } | undefined;
  return row ? TrackDeletionSchema.parse({ id: row.id, revision: row.revision, deletedAt: row.deleted_at }) : undefined;
}
export function readMusicOperation(db: Database.Database, id: string): { kind: string; input: string; output: unknown } | undefined {
  const row = db.prepare('SELECT operation_kind, input_json, output_json FROM music_operations WHERE operation_id = ?').get(id) as { operation_kind: string; input_json: string; output_json: string } | undefined;
  return row ? { kind: row.operation_kind, input: row.input_json, output: JSON.parse(row.output_json) as unknown } : undefined;
}
export function saveMusicOperation(db: Database.Database, id: string, kind: string, input: string, output: unknown): void {
  db.prepare('INSERT INTO music_operations (operation_id, operation_kind, input_json, output_json) VALUES (?, ?, ?, ?)').run(id, kind, input, JSON.stringify(output));
}

export function allTrackTombstones(db: Database.Database, limit: number) {
  return (db.prepare('SELECT id, revision, deleted_at FROM music_tombstones ORDER BY id LIMIT ?').all(limit + 1) as { id: string; revision: number; deleted_at: string }[])
    .map((row) => ({ id: row.id, revision: row.revision, deletedAt: row.deleted_at }));
}

export function musicEmpty(db: Database.Database): boolean {
  return getLibraryRevision(db) === 0 && db.prepare('SELECT 1 FROM music_tracks LIMIT 1').get() === undefined && db.prepare('SELECT 1 FROM music_tombstones LIMIT 1').get() === undefined;
}

export function insertRestoredTrack(db: Database.Database, track: Track): void {
  const values = TrackValuesSchema.strip().parse(track);
  db.prepare('INSERT INTO music_tracks (id, metadata_json, revision, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(track.id, JSON.stringify(values), track.revision, track.position, track.createdAt, track.updatedAt);
}

export function insertRestoredTombstone(db: Database.Database, tombstone: { id: string; revision: number; deletedAt: string }): void {
  db.prepare('INSERT INTO music_tombstones (id, revision, deleted_at) VALUES (?, ?, ?)').run(tombstone.id, tombstone.revision, tombstone.deletedAt);
}

export function restoreLibraryRevision(db: Database.Database, revision: number): void {
  db.prepare('UPDATE music_library SET revision = ? WHERE singleton = 1').run(revision);
}
