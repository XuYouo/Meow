import type Database from 'better-sqlite3';
import type { Principal } from '../../../system/auth/Principal.js';
import type { TrackDTO } from '../../../../shared/contracts/music/index.js';

export interface MusicDependencies {
  readonly db: Database.Database;
  readonly now: () => string;
  readonly principal: Principal;
  readonly onChanged?: (before: TrackDTO | null, after: TrackDTO | null) => void;
}
