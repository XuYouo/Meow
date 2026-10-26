import type Database from 'better-sqlite3';

export function initializeMemoLinksTable(db: Database.Database): void {
  db.exec('CREATE TABLE memo_links (source_id TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE, target_id TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE, CHECK(source_id != target_id), PRIMARY KEY(source_id,target_id)); CREATE INDEX memo_links_target_idx ON memo_links(target_id,source_id)');
}
export function replaceMemoLinks(db: Database.Database, id: string, links: string[]): void {
  db.prepare('DELETE FROM memo_links WHERE source_id=?').run(id);
  const insert = db.prepare('INSERT INTO memo_links(source_id,target_id) VALUES (?,?)');
  for (const target of links) insert.run(id, target);
}
export function readMemoLinks(db: Database.Database, id: string, publicOnly: boolean): { links: string[]; backlinks: string[] } {
  const visible = publicOnly ? ' AND m.is_public=1' : '';
  const links = (db.prepare(`SELECT l.target_id AS id FROM memo_links l JOIN memos m ON m.id=l.target_id WHERE l.source_id=?${visible} ORDER BY l.target_id`).all(id) as { id: string }[]).map((row) => row.id);
  const backlinks = (db.prepare(`SELECT l.source_id AS id FROM memo_links l JOIN memos m ON m.id=l.source_id WHERE l.target_id=?${visible} ORDER BY l.source_id`).all(id) as { id: string }[]).map((row) => row.id);
  return { links, backlinks };
}
export function affectedLinkMemoIds(db: Database.Database, id: string): string[] {
  return (db.prepare('SELECT source_id AS id FROM memo_links WHERE target_id=? UNION SELECT target_id AS id FROM memo_links WHERE source_id=?').all(id,id) as { id: string }[]).map((row) => row.id);
}
