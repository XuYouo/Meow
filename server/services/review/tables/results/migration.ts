import type { Migration } from '../../../../system/database/Migration.js';

export const reviewMigrations: readonly Migration[] = [{
  id: 'review.001.results',
  up(db) {
    db.exec(`CREATE TABLE review_results (
      memo_id TEXT NOT NULL,
      business_day TEXT NOT NULL,
      timezone TEXT NOT NULL,
      result TEXT CHECK (result IS NULL OR result IN ('PASS', 'FAIL')),
      revision INTEGER NOT NULL CHECK (revision >= 1),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (memo_id, business_day, timezone),
      FOREIGN KEY (memo_id) REFERENCES memos(id) DEFERRABLE INITIALLY DEFERRED
    );
    CREATE INDEX review_results_by_day ON review_results(timezone, business_day);
    CREATE TABLE review_operations (
      operation_id TEXT PRIMARY KEY,
      input_json TEXT NOT NULL CHECK (json_valid(input_json)),
      output_json TEXT NOT NULL CHECK (json_valid(output_json))
    );`);
  },
}];
