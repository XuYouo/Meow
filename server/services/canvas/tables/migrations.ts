import type { Migration } from '../../../system/database/Migration.js';
import { initializeCanvasesTable } from './canvases/table.js';
import { initializeCanvasOperationsTable } from './operations/table.js';

export const canvasMigrations: Migration[] = [{ id: '030-canvas',up(db) { initializeCanvasesTable(db); initializeCanvasOperationsTable(db); } }];
