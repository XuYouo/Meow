import type Database from 'better-sqlite3';
import type { Principal } from '../../../system/auth/Principal.js';

export interface ReviewDependencies {
  readonly db: Database.Database;
  readonly now: () => string;
  readonly principal: Principal;
}
