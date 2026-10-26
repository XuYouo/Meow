import { SessionSchema, type Session } from '../../../shared/contracts/identity';
import type { BrowserStorage } from './WorkspaceCache';

const key = 'meow:v2:verified-tab-session';

// A tab marker grants no server authority and carries no credential. It permits
// recovery of this tab's already-unlocked local work only while transport is down.
export function rememberVerifiedTabSession(storage: BrowserStorage, session: Session): void {
  if (session.authenticated && session.principal === 'owner') storage.setItem(key, JSON.stringify(session));
  else storage.removeItem(key);
}

export function readVerifiedTabSession(storage: BrowserStorage): Session | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const result = SessionSchema.safeParse(JSON.parse(raw));
    return result.success && result.data.authenticated && result.data.principal === 'owner' ? result.data : null;
  } catch { return null; }
}

export function forgetVerifiedTabSession(storage: BrowserStorage): void { storage.removeItem(key); }
