import type Database from 'better-sqlite3';

export function initializeTagsTable(db: Database.Database): void {
  db.exec('CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE CHECK(length(name) BETWEEN 1 AND 80))');
}
export function ensureTag(db: Database.Database, name: string): number {
  db.prepare('INSERT INTO tags(name) VALUES (?) ON CONFLICT(name) DO NOTHING').run(name);
  return (db.prepare('SELECT id FROM tags WHERE name=?').get(name) as { id: number }).id;
}
export function removeUnusedTags(db: Database.Database): void {
  db.prepare('DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM memo_tags mt WHERE mt.tag_id=tags.id)').run();
}
