import type Database from 'better-sqlite3';
import type { MemoRow } from '../../objects/MemoRow.js';

export function initializeMemosTable(db: Database.Database): void {
  db.exec(`CREATE TABLE memos (
    id TEXT PRIMARY KEY, content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 200000),
    is_public INTEGER NOT NULL CHECK(is_public IN (0, 1)),
    revision INTEGER NOT NULL CHECK(revision > 0), sequence INTEGER NOT NULL UNIQUE CHECK(sequence > 0),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ); CREATE INDEX memos_created_idx ON memos(created_at DESC, id);
  CREATE INDEX memos_public_idx ON memos(is_public, created_at DESC);`);
}
export function getMemoRow(db: Database.Database, id: string): MemoRow | undefined {
  return db.prepare('SELECT * FROM memos WHERE id = ?').get(id) as MemoRow | undefined;
}
export function insertMemoRow(db: Database.Database, row: MemoRow): void {
  db.prepare('INSERT INTO memos(id,content,is_public,revision,sequence,created_at,updated_at) VALUES (@id,@content,@is_public,@revision,@sequence,@created_at,@updated_at)').run(row);
}
export function updateMemoRow(db: Database.Database, row: MemoRow, baseRevision: number): boolean {
  return db.prepare('UPDATE memos SET content=@content,is_public=@is_public,revision=@revision,sequence=@sequence,updated_at=@updated_at WHERE id=@id AND revision=@baseRevision').run({ ...row, baseRevision }).changes === 1;
}
export function removeMemoRow(db: Database.Database, id: string, baseRevision: number): boolean {
  return db.prepare('DELETE FROM memos WHERE id=? AND revision=?').run(id, baseRevision).changes === 1;
}
export interface MemoFilter {
  publicOnly: boolean; search?: string; tag?: string; from?: string; to?: string; offset: number; limit: number;
}
function filterSql(filter: MemoFilter): { where: string; params: Record<string, string | number> } {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};
  if (filter.publicOnly) conditions.push('m.is_public = 1');
  if (filter.search) { conditions.push("m.content LIKE @search ESCAPE '\\'"); params.search = `%${filter.search.replace(/[\\%_]/g, '\\$&')}%`; }
  if (filter.tag) {
    conditions.push("EXISTS (SELECT 1 FROM memo_tags mt JOIN tags t ON t.id=mt.tag_id WHERE mt.memo_id=m.id AND (t.name=@tag OR t.name LIKE @tagPrefix ESCAPE '\\'))");
    params.tag = filter.tag;
    params.tagPrefix = `${filter.tag.replace(/[\\%_]/g, '\\$&')}/%`;
  }
  if (filter.from) { conditions.push('substr(m.created_at,1,10) >= @from'); params.from = filter.from; }
  if (filter.to) { conditions.push('substr(m.created_at,1,10) <= @to'); params.to = filter.to; }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}
export function listMemoRows(db: Database.Database, filter: MemoFilter): { rows: MemoRow[]; total: number } {
  const { where, params } = filterSql(filter);
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM memos m ${where}`).get(params) as { count: number }).count;
  const rows = db.prepare(`SELECT m.* FROM memos m LEFT JOIN memo_pins p ON p.memo_id=m.id ${where} ORDER BY CASE WHEN p.memo_id IS NULL THEN 1 ELSE 0 END, p.position, m.created_at DESC, m.id LIMIT @limit OFFSET @offset`).all({ ...params, offset: filter.offset, limit: filter.limit }) as MemoRow[];
  return { rows, total };
}
export function listChangedMemoRows(db: Database.Database, since: number): MemoRow[] {
  return db.prepare('SELECT * FROM memos WHERE sequence>? ORDER BY sequence LIMIT 101').all(since) as MemoRow[];
}
export function listAllMemoRows(db: Database.Database): MemoRow[] {
  return db.prepare('SELECT * FROM memos ORDER BY created_at,id LIMIT 5001').all() as MemoRow[];
}

export function updateMemoSequence(db: Database.Database, id: string, sequence: number): void {
  db.prepare('UPDATE memos SET sequence=? WHERE id=?').run(sequence,id);
}
export function countMemoRows(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM memos').get() as { count: number }).count;
}
