import type Database from 'better-sqlite3';

export function initializeRevisionsTable(db: Database.Database): void {
  db.exec('CREATE TABLE memo_sequence (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL CHECK(value>=0)); INSERT INTO memo_sequence(id,value) VALUES (1,0)');
}
export function nextMemoSequence(db: Database.Database): number {
  return (db.prepare('UPDATE memo_sequence SET value=value+1 WHERE id=1 RETURNING value').get() as { value: number }).value;
}
