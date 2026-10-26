import type Database from 'better-sqlite3';
import { ReviewResultSchema } from '../../../../../shared/contracts/review/index.js';
import type { ReviewResult } from '../../objects/ReviewResult.js';

interface ReviewRow { memo_id: string; business_day: string; timezone: string; result: 'PASS' | 'FAIL' | null; revision: number; updated_at: string }
const map = (row: ReviewRow): ReviewResult => ({ memoId: row.memo_id, day: row.business_day, timezone: row.timezone, result: row.result, revision: row.revision, updatedAt: row.updated_at });

export function findReviewResult(db: Database.Database, key: { memoId: string; day: string; timezone: string }): ReviewResult | undefined {
  const row = db.prepare('SELECT memo_id, business_day, timezone, result, revision, updated_at FROM review_results WHERE memo_id = ? AND business_day = ? AND timezone = ?').get(key.memoId, key.day, key.timezone) as ReviewRow | undefined;
  return row ? map(row) : undefined;
}

export function listReviewResults(db: Database.Database, input: { timezone: string; day?: string; offset: number; limit: number }): { items: ReviewResult[]; total: number } {
  const filter = input.day ? 'timezone = @timezone AND business_day = @day' : 'timezone = @timezone';
  const parameters = { ...input, day: input.day ?? null };
  const rows = db.prepare(`SELECT memo_id, business_day, timezone, result, revision, updated_at FROM review_results WHERE ${filter} ORDER BY business_day DESC, memo_id LIMIT @limit OFFSET @offset`).all(parameters) as ReviewRow[];
  const count = db.prepare(`SELECT COUNT(*) AS count FROM review_results WHERE ${filter}`).get(parameters) as { count: number };
  return { items: rows.map(map), total: count.count };
}

export function saveReviewResult(db: Database.Database, value: ReviewResult): void {
  db.prepare('INSERT INTO review_results (memo_id, business_day, timezone, result, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(memo_id, business_day, timezone) DO UPDATE SET result = excluded.result, revision = excluded.revision, updated_at = excluded.updated_at')
    .run(value.memoId, value.day, value.timezone, value.result, value.revision, value.updatedAt);
}

export function removeMemoResults(db: Database.Database, memoId: string): void {
  db.prepare('DELETE FROM review_results WHERE memo_id = ?').run(memoId);
}

export function readReviewOperation(db: Database.Database, operationId: string): { input: string; output: ReviewResult } | undefined {
  const row = db.prepare('SELECT input_json, output_json FROM review_operations WHERE operation_id = ?').get(operationId) as { input_json: string; output_json: string } | undefined;
  return row ? { input: row.input_json, output: ReviewResultSchema.parse(JSON.parse(row.output_json)) } : undefined;
}

export function saveReviewOperation(db: Database.Database, operationId: string, input: string, output: ReviewResult): void {
  db.prepare('INSERT INTO review_operations (operation_id, input_json, output_json) VALUES (?, ?, ?)').run(operationId, input, JSON.stringify(output));
}

export function allReviewResults(db: Database.Database, limit: number): ReviewResult[] {
  const rows = db.prepare('SELECT memo_id, business_day, timezone, result, revision, updated_at FROM review_results ORDER BY business_day, timezone, memo_id LIMIT ?').all(limit + 1) as ReviewRow[];
  return rows.map(map);
}

export function reviewsEmpty(db: Database.Database): boolean {
  return db.prepare('SELECT 1 FROM review_results LIMIT 1').get() === undefined;
}
