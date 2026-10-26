import type { Migration } from '../../../../system/database/Migration.js';

export const sessionsMigration: Migration = {
  id: 'identity.002.sessions',
  up(db) {
    db.exec(`CREATE TABLE identity_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX identity_sessions_expiry ON identity_sessions(expires_at);`);
  },
};
