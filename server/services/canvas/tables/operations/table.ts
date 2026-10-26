import type Database from 'better-sqlite3';

export function initializeCanvasOperationsTable(db: Database.Database): void {
  db.exec('CREATE TABLE canvas_operations (operation_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,response_json TEXT NOT NULL CHECK(json_valid(response_json)))');
}
export function findCanvasOperation(db: Database.Database, operationId: string): { fingerprint: string;responseJson: string } | undefined {
  const row = db.prepare('SELECT fingerprint,response_json FROM canvas_operations WHERE operation_id=?').get(operationId) as { fingerprint: string;response_json: string } | undefined;
  return row ? { fingerprint: row.fingerprint,responseJson: row.response_json } : undefined;
}
export function saveCanvasOperation(db: Database.Database, operationId: string, fingerprint: string, response: unknown): void {
  db.prepare('INSERT INTO canvas_operations(operation_id,fingerprint,response_json) VALUES (?,?,?)').run(operationId,fingerprint,JSON.stringify(response));
}
