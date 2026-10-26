import type Database from 'better-sqlite3';

export function initializeMemoPinsTable(db: Database.Database): void {
  db.exec('CREATE TABLE memo_pins (memo_id TEXT PRIMARY KEY REFERENCES memos(id) ON DELETE CASCADE, position INTEGER NOT NULL CHECK(position >= 0))');
}
export function setMemoPin(db: Database.Database, id: string, pinned: boolean): void {
  if (!pinned) { db.prepare('DELETE FROM memo_pins WHERE memo_id=?').run(id); return; }
  db.prepare('INSERT INTO memo_pins(memo_id,position) SELECT ?,COALESCE(MAX(position),-1)+1 FROM memo_pins WHERE true ON CONFLICT(memo_id) DO NOTHING').run(id);
}
export function readMemoPin(db: Database.Database, id: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM memo_pins WHERE memo_id=?').get(id));
}
export function readPinOrder(db: Database.Database): string[] {
  return (db.prepare('SELECT memo_id FROM memo_pins ORDER BY position,memo_id LIMIT 5001').all() as { memo_id: string }[]).map((row) => row.memo_id);
}
export function restorePinOrder(db: Database.Database, order: string[]): void {
  const statement=db.prepare('INSERT INTO memo_pins(memo_id,position) VALUES (?,?)');
  order.forEach((id,index) => statement.run(id,index));
}
