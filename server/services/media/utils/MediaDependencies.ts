import type Database from 'better-sqlite3';
import type { Principal } from '../../../system/auth/Principal.js';
import type { UnitOfWork } from '../../../system/database/UnitOfWork.js';
import type { AsyncMutex } from '../../../system/concurrency/AsyncMutex.js';

export interface MediaDependencies {
  readonly db: Database.Database;
  readonly unitOfWork: UnitOfWork;
  readonly uploadsDir: string;
  readonly now: () => string;
  readonly principal: Principal;
  readonly filePublication: AsyncMutex;
}
