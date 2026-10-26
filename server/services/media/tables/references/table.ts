import type Database from 'better-sqlite3';

export function replaceReferences(db: Database.Database, type: string, id: string, mediaIds: readonly string[], isPublic: boolean): void {
  db.prepare('DELETE FROM media_references WHERE resource_type = ? AND resource_id = ?').run(type, id);
  const insert = db.prepare('INSERT INTO media_references(resource_type,resource_id,media_id,is_public) VALUES (?,?,?,?)');
  for (const mediaId of new Set(mediaIds)) insert.run(type, id, mediaId, isPublic ? 1 : 0);
}

export function referenceCount(db: Database.Database, mediaId: string, publicOnly = false): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM media_references WHERE media_id = ?${publicOnly ? ' AND is_public = 1' : ''}`).get(mediaId) as { count: number };
  return row.count;
}

export function listReferences(db: Database.Database, limit: number): { resourceType: 'memo' | 'canvas' | 'music' | 'preferences'; resourceId: string; mediaId: string; isPublic: boolean }[] {
  const rows = db.prepare('SELECT resource_type, resource_id, media_id, is_public FROM media_references ORDER BY resource_type, resource_id, media_id LIMIT ?').all(limit + 1) as { resource_type: 'memo' | 'canvas' | 'music' | 'preferences'; resource_id: string; media_id: string; is_public: number }[];
  return rows.map((row) => ({ resourceType: row.resource_type, resourceId: row.resource_id, mediaId: row.media_id, isPublic: row.is_public === 1 }));
}
