import type Database from 'better-sqlite3';
import type { Principal } from '../../../system/auth/Principal.js';
import { revokeSession } from '../tables/sessions/table.js';

export function plan(dependencies: { principal: Principal; db: Database.Database; now: () => string }): void {
  if (dependencies.principal.kind === 'owner') revokeSession(dependencies.db, dependencies.principal.sessionId, dependencies.now());
}
