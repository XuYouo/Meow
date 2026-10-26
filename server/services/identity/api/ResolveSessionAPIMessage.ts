import type Database from 'better-sqlite3';
import { anonymous, type Principal } from '../../../system/auth/Principal.js';
import { findActiveSession } from '../tables/sessions/table.js';
import { hashToken } from '../utils/password.js';

export function plan(token: string | undefined, dependencies: { db: Database.Database; now: () => string; enabled: boolean }): Principal {
  if (!dependencies.enabled || !token || !/^[a-f0-9]{96}$/.test(token)) return anonymous;
  const session = findActiveSession(dependencies.db, hashToken(token), dependencies.now());
  return session ? { kind: 'owner', id: 'owner', sessionId: session.id } : anonymous;
}
