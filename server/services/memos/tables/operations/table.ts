import type Database from 'better-sqlite3';

export function initializeOperationsTable(db: Database.Database): void {
  db.exec('CREATE TABLE memo_operations (operation_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL)');
}
export function getMemoOperation(db: Database.Database, operationId: string): { fingerprint: string; responseJson: string } | undefined {
  const row = db.prepare('SELECT fingerprint,response_json FROM memo_operations WHERE operation_id=?').get(operationId) as { fingerprint: string; response_json: string } | undefined;
  return row ? { fingerprint: row.fingerprint, responseJson: row.response_json } : undefined;
}
export function recordMemoOperation(db: Database.Database, operationId: string, fingerprint: string, response: unknown, now: string): void {
  db.prepare('INSERT INTO memo_operations(operation_id,fingerprint,response_json,created_at) VALUES (?,?,?,?)').run(operationId,fingerprint,JSON.stringify(response),now);
}
export function countMemoOperations(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM memo_operations').get() as { count: number }).count;
}
