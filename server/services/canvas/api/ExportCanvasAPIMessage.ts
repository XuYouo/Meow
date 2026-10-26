import type Database from 'better-sqlite3';
import type { CanvasDTO } from '../../../../shared/contracts/canvas/index.js';
import { readCanvas } from '../tables/canvases/table.js';

export function plan(deps: { db: Database.Database }): CanvasDTO {
  return readCanvas(deps.db)??{ revision: 0,updatedAt: null,document: { schemaVersion: 1,viewport: { x: 0,y: 0,scale: 1 },memoPositions: [],shapes: [] } };
}
