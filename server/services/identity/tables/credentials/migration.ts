import type { Migration } from '../../../../system/database/Migration.js';

export const credentialsMigration: Migration = {
  id: 'identity.001.credentials',
  up(db) {
    db.exec(`CREATE TABLE identity_credentials (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      password_hash TEXT NOT NULL
    )`);
  },
};
