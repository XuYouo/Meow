import type Database from 'better-sqlite3';
import type { Principal } from '../../../system/auth/Principal.js';
import type { Memo } from '../objects/Memo.js';

export interface MemoDependencies {
  db: Database.Database;
  principal: Principal;
  now: () => string;
  /** Runs synchronously inside the caller's database work unit. */
  onMemoChanged?: (before: Memo | null, after: Memo | null,principal: Principal) => void;
}
