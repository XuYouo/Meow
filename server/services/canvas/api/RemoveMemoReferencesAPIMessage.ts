import type Database from 'better-sqlite3';
import { readCanvas, writeCanvas } from '../tables/canvases/table.js';

/** Internal cross-domain entry; caller supplies the existing database work unit. */
export function plan(input: { memoId: string }, deps: { db: Database.Database;now: () => string }): void {
  const previous = readCanvas(deps.db);
  if (!previous || !previous.document.memoPositions.some((position) => position.memoId === input.memoId)) return;
  writeCanvas(deps.db,{ ...previous,revision: previous.revision+1,updatedAt: deps.now(),document: { ...previous.document,memoPositions: previous.document.memoPositions.filter((position) => position.memoId !== input.memoId) } },previous.revision);
}
