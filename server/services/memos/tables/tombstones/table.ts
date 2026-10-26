import type Database from 'better-sqlite3';
import type { MemoTombstone } from '../../objects/MemoTombstone.js';

interface TombstoneRow { id: string; revision: number; sequence: number; deleted_at: string }
export function initializeTombstonesTable(db: Database.Database): void {
  db.exec('CREATE TABLE memo_tombstones (id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>0), sequence INTEGER NOT NULL UNIQUE, deleted_at TEXT NOT NULL)');
}
export function getTombstone(db: Database.Database, id: string): MemoTombstone | undefined {
  const row = db.prepare('SELECT * FROM memo_tombstones WHERE id=?').get(id) as TombstoneRow | undefined;
  return row ? { id: row.id, revision: row.revision, deletedAt: row.deleted_at } : undefined;
}
export function insertTombstone(db: Database.Database, value: MemoTombstone, sequence: number): void {
  db.prepare('INSERT INTO memo_tombstones(id,revision,sequence,deleted_at) VALUES (?,?,?,?)').run(value.id,value.revision,sequence,value.deletedAt);
}
export function listChangedTombstones(db: Database.Database, since: number): { sequence: number; tombstone: MemoTombstone }[] {
  return (db.prepare('SELECT * FROM memo_tombstones WHERE sequence>? ORDER BY sequence LIMIT 101').all(since) as TombstoneRow[]).map((row) => ({ sequence: row.sequence, tombstone: { id: row.id, revision: row.revision, deletedAt: row.deleted_at } }));
}
export function allTombstones(db: Database.Database): MemoTombstone[] {
  return (db.prepare('SELECT * FROM memo_tombstones ORDER BY sequence LIMIT 5001').all() as TombstoneRow[]).map((row) => ({ id: row.id,revision: row.revision,deletedAt: row.deleted_at }));
}
export function countTombstones(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM memo_tombstones').get() as { count: number }).count;
}
