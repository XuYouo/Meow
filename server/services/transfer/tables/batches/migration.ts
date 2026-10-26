import type { Migration } from '../../../../system/database/Migration.js';

export const transferMigrations: readonly Migration[] = [{ id: 'transfer.001.batches', up(db) {
  db.exec(`CREATE TABLE transfer_batches (
    batch_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('restore','memos')),
    source_digest TEXT NOT NULL,
    input_digest TEXT NOT NULL,
    output_json TEXT NOT NULL CHECK(json_valid(output_json)),
    completed_at TEXT NOT NULL,
    UNIQUE(kind, source_digest)
  );
  CREATE TABLE transfer_leases (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    lease_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );`);
} }];
