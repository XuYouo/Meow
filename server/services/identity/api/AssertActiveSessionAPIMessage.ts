import type Database from 'better-sqlite3';
import type { Principal } from '../../../system/auth/Principal.js';
import { AppError } from '../../../system/errors/AppError.js';
import { sessionIsActive } from '../tables/sessions/table.js';

/** Recheck after asynchronous work, before publishing sensitive data or committing writes. */
export function plan(dependencies: { principal: Principal; db: Database.Database; now: () => string }): void {
  if (dependencies.principal.kind !== 'owner' || !sessionIsActive(dependencies.db, dependencies.principal.sessionId, dependencies.now())) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required.');
}
