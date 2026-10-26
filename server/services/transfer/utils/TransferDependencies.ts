import type Database from 'better-sqlite3';
import type { Principal } from '../../../system/auth/Principal.js';
import type { UnitOfWork } from '../../../system/database/UnitOfWork.js';
import type { AsyncMutex } from '../../../system/concurrency/AsyncMutex.js';

export interface TransferDependencies {
  readonly db: Database.Database;
  readonly unitOfWork: UnitOfWork;
  readonly filePublication: AsyncMutex;
  readonly principal: Principal;
  readonly uploadsDir: string;
  readonly instanceId: string;
  readonly now: () => string;
  /** Tests inject filesystem/commit failure without touching actual user data. */
  readonly fault?: (stage: 'stage-file' | 'link-file' | 'before-commit' | 'after-commit' | 'cleanup', index: number) => void;
}
