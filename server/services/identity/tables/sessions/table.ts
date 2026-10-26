import type Database from 'better-sqlite3';
import type { Session } from '../../objects/Session.js';

export function insertSession(db: Database.Database, session: Session): void {
  db.prepare('INSERT INTO identity_sessions (id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(session.id, session.tokenHash, session.createdAt, session.expiresAt);
}

export function findActiveSession(db: Database.Database, tokenHash: string, at: string): Session | undefined {
  const row = db.prepare('SELECT id, token_hash, created_at, expires_at FROM identity_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?')
    .get(tokenHash, at) as { id: string; token_hash: string; created_at: string; expires_at: string } | undefined;
  return row ? { id: row.id, tokenHash: row.token_hash, createdAt: row.created_at, expiresAt: row.expires_at } : undefined;
}

export function revokeSession(db: Database.Database, id: string, at: string): void {
  db.prepare('UPDATE identity_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(at, id);
}

export function revokeAllSessions(db: Database.Database, at: string): void {
  db.prepare('UPDATE identity_sessions SET revoked_at = ? WHERE revoked_at IS NULL').run(at);
}

export function deleteExpiredSessions(db: Database.Database, at: string): void {
  db.prepare('DELETE FROM identity_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL').run(at);
}

export function sessionIsActive(db: Database.Database, id: string, at: string): boolean {
  return db.prepare('SELECT 1 FROM identity_sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?').get(id, at) !== undefined;
}
