import type Database from 'better-sqlite3';
import { PreferencesSchema } from '../../../../shared/contracts/preferences/index.js';
import { readPreferences } from '../tables/preferences/table.js';
import { defaultPreferences } from '../utils/defaultPreferences.js';

export function plan({ db }: { db: Database.Database }) {
  return PreferencesSchema.parse(readPreferences(db) ?? defaultPreferences());
}
