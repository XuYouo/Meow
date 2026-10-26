import { randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../../../system/errors/AppError.js';
import { getCredential } from '../tables/credentials/table.js';
import { deleteExpiredSessions, insertSession, revokeSession } from '../tables/sessions/table.js';
import { hashToken, verifyPassword } from '../utils/password.js';
import type { Principal } from '../../../system/auth/Principal.js';
import type { AttemptLimiter } from '../utils/AttemptLimiter.js';

export function plan(input: { password: string }, dependencies: {
  db: Database.Database;
  enabled: boolean;
  now: () => string;
  ttlMs: number;
  address: string;
  limiter: AttemptLimiter;
  principal: Principal;
}) {
  dependencies.limiter.attempt(dependencies.address);
  const credential = getCredential(dependencies.db);
  if (!dependencies.enabled || !credential || !verifyPassword(input.password, credential.passwordHash)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
  }
  const at = dependencies.now();
  if (dependencies.principal.kind === 'owner') revokeSession(dependencies.db, dependencies.principal.sessionId, at);
  deleteExpiredSessions(dependencies.db, at);
  const token = randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.parse(at) + dependencies.ttlMs).toISOString();
  insertSession(dependencies.db, { id: randomUUID(), tokenHash: hashToken(token), createdAt: at, expiresAt });
  dependencies.limiter.clear(dependencies.address);
  return { token, expiresAt };
}
