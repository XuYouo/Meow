import type Database from 'better-sqlite3';
import { getCredential, setCredential } from '../tables/credentials/table.js';
import { revokeAllSessions } from '../tables/sessions/table.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

export function plan(password: string | undefined, dependencies: { db: Database.Database; now: () => string }): void {
  const existing = getCredential(dependencies.db);
  if (!password) {
    revokeAllSessions(dependencies.db, dependencies.now());
    return;
  }
  if (!existing || !verifyPassword(password, existing.passwordHash)) {
    setCredential(dependencies.db, hashPassword(password));
    revokeAllSessions(dependencies.db, dependencies.now());
  }
}
