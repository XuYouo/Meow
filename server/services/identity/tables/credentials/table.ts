import type Database from 'better-sqlite3';
import type { Credential } from '../../objects/Credential.js';

export function getCredential(db: Database.Database): Credential | undefined {
  const row = db.prepare('SELECT password_hash FROM identity_credentials WHERE singleton = 1').get() as
    | { password_hash: string }
    | undefined;
  return row ? { passwordHash: row.password_hash } : undefined;
}

export function setCredential(db: Database.Database, passwordHash: string): void {
  db.prepare('INSERT INTO identity_credentials (singleton, password_hash) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET password_hash = excluded.password_hash')
    .run(passwordHash);
}
