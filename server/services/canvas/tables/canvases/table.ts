import type Database from 'better-sqlite3';
import { CanvasDocumentSchema } from '../../../../../shared/contracts/canvas/index.js';
import type { Canvas } from '../../objects/Canvas.js';

export function initializeCanvasesTable(db: Database.Database): void {
  db.exec('CREATE TABLE canvases (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>0), updated_at TEXT NOT NULL, document_json TEXT NOT NULL CHECK(json_valid(document_json)))');
}
export function readCanvas(db: Database.Database): Canvas | undefined {
  const row = db.prepare('SELECT revision,updated_at,document_json FROM canvases WHERE id=1').get() as { revision: number;updated_at: string;document_json: string } | undefined;
  return row ? { revision: row.revision,updatedAt: row.updated_at,document: CanvasDocumentSchema.parse(JSON.parse(row.document_json)) } : undefined;
}
export function writeCanvas(db: Database.Database, canvas: Canvas, baseRevision: number): boolean {
  if (baseRevision === 0) return db.prepare('INSERT INTO canvases(id,revision,updated_at,document_json) VALUES (1,?,?,?) ON CONFLICT(id) DO NOTHING').run(canvas.revision,canvas.updatedAt,JSON.stringify(canvas.document)).changes === 1;
  return db.prepare('UPDATE canvases SET revision=?,updated_at=?,document_json=? WHERE id=1 AND revision=?').run(canvas.revision,canvas.updatedAt,JSON.stringify(canvas.document),baseRevision).changes === 1;
}
