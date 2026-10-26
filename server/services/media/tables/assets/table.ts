import type Database from 'better-sqlite3';
import type { Media } from '../../objects/Media.js';

interface MediaRow {
  id: string; operation_id: string; file_name: string; mime_type: string;
  size: number; sha256: string; state: 'ready' | 'deleting'; created_at: string;
}

function map(row: MediaRow): Media {
  return { id: row.id, operationId: row.operation_id, fileName: row.file_name, mimeType: row.mime_type,
    size: row.size, sha256: row.sha256, state: row.state, createdAt: row.created_at };
}

export function findAsset(db: Database.Database, id: string): Media | undefined {
  const row = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as MediaRow | undefined;
  return row ? map(row) : undefined;
}

export function findAssetOperation(db: Database.Database, operationId: string): Media | undefined {
  const row = db.prepare('SELECT * FROM media_assets WHERE operation_id = ?').get(operationId) as MediaRow | undefined;
  return row ? map(row) : undefined;
}

export function insertAsset(db: Database.Database, asset: Media): void {
  db.prepare(`INSERT INTO media_assets (id,operation_id,file_name,mime_type,size,sha256,state,created_at)
    VALUES (@id,@operationId,@fileName,@mimeType,@size,@sha256,@state,@createdAt)`).run(asset);
}

export function setAssetDeleting(db: Database.Database, id: string): void {
  db.prepare("UPDATE media_assets SET state = 'deleting' WHERE id = ?").run(id);
}

export function removeAsset(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM media_assets WHERE id = ?').run(id);
}

export function listAssets(db: Database.Database): Media[] {
  return (db.prepare('SELECT * FROM media_assets ORDER BY id').all() as MediaRow[]).map(map);
}

export function countAssets(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM media_assets').get() as { count: number }).count;
}
