import type Database from 'better-sqlite3';

export interface TransferReceipt { readonly batchId: string; readonly kind: 'restore' | 'memos'; readonly sourceDigest: string; readonly inputDigest?: string; readonly output: unknown }
interface ReceiptRow { batch_id: string; kind: 'restore' | 'memos'; source_digest: string; input_digest: string; output_json: string }
const map = (row: ReceiptRow): TransferReceipt => ({ batchId: row.batch_id, kind: row.kind, sourceDigest: row.source_digest, inputDigest: row.input_digest, output: JSON.parse(row.output_json) as unknown });

export function findBatch(db: Database.Database, id: string): TransferReceipt | undefined {
  const row = db.prepare('SELECT batch_id, kind, source_digest, input_digest, output_json FROM transfer_batches WHERE batch_id = ?').get(id) as ReceiptRow | undefined;
  return row ? map(row) : undefined;
}
export function findSourceBatch(db: Database.Database, kind: 'restore' | 'memos', digest: string): TransferReceipt | undefined {
  const row = db.prepare('SELECT batch_id, kind, source_digest, input_digest, output_json FROM transfer_batches WHERE kind = ? AND source_digest = ?').get(kind, digest) as ReceiptRow | undefined;
  return row ? map(row) : undefined;
}
export function recordBatch(db: Database.Database, receipt: TransferReceipt, at: string): void {
  db.prepare('INSERT INTO transfer_batches (batch_id, kind, source_digest, input_digest, output_json, completed_at) VALUES (?, ?, ?, ?, ?, ?)').run(receipt.batchId, receipt.kind, receipt.sourceDigest, receipt.inputDigest ?? receipt.sourceDigest, JSON.stringify(receipt.output), at);
}

export function acquireLease(db: Database.Database, leaseId: string, at: string, expiresAt: string): boolean {
  return db.prepare('INSERT INTO transfer_leases (singleton, lease_id, expires_at) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET lease_id = excluded.lease_id, expires_at = excluded.expires_at WHERE transfer_leases.expires_at <= ?').run(leaseId, expiresAt, at).changes === 1;
}
export function renewLease(db: Database.Database, leaseId: string, at: string, expiresAt: string): boolean {
  return db.prepare('UPDATE transfer_leases SET expires_at = ? WHERE singleton = 1 AND lease_id = ? AND expires_at > ?').run(expiresAt, leaseId, at).changes === 1;
}
export function releaseLease(db: Database.Database, leaseId: string): void {
  db.prepare('DELETE FROM transfer_leases WHERE singleton = 1 AND lease_id = ?').run(leaseId);
}
