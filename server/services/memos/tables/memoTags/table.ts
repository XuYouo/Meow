import type Database from 'better-sqlite3';

export function initializeMemoTagsTable(db: Database.Database): void {
  db.exec('CREATE TABLE memo_tags (memo_id TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(memo_id,tag_id)); CREATE INDEX memo_tags_tag_idx ON memo_tags(tag_id,memo_id)');
}
export function replaceMemoTags(db: Database.Database, id: string, tagIds: number[]): void {
  db.prepare('DELETE FROM memo_tags WHERE memo_id=?').run(id);
  const insert = db.prepare('INSERT INTO memo_tags(memo_id,tag_id) VALUES (?,?)');
  for (const tagId of tagIds) insert.run(id, tagId);
}
export function readMemoTags(db: Database.Database, id: string): string[] {
  return (db.prepare('SELECT t.name FROM memo_tags mt JOIN tags t ON t.id=mt.tag_id WHERE mt.memo_id=? ORDER BY t.name').all(id) as { name: string }[]).map((row) => row.name);
}
