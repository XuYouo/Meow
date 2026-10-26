import type Database from 'better-sqlite3';
import type { Principal } from '../../../system/auth/Principal.js';
import type { Canvas } from '../objects/Canvas.js';

export interface CanvasDependencies {
  db: Database.Database;
  principal: Principal;
  now: () => string;
  onCanvasChanged?: (before: Canvas,after: Canvas) => void;
}
