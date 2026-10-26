import type Database from 'better-sqlite3';
import type { Principal } from '../../../system/auth/Principal.js';
import type { PreferencesDTO } from '../../../../shared/contracts/preferences/index.js';

export interface PreferencesDependencies {
  readonly db: Database.Database;
  readonly now: () => string;
  readonly principal: Principal;
  readonly onChanged?: (before: PreferencesDTO, after: PreferencesDTO) => void;
}
