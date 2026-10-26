import type Database from 'better-sqlite3';
import { PreferenceValuesSchema, PreferencesSchema, type PreferencesDTO } from '../../../../shared/contracts/preferences/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { preferencesEmpty, savePreferences } from '../tables/preferences/table.js';
import { defaultPreferences } from '../utils/defaultPreferences.js';

export function plan(snapshot: PreferencesDTO, { db }: { db: Database.Database }): void {
  const values = PreferencesSchema.parse(snapshot);
  if (!preferencesEmpty(db)) throw new AppError(409, 'RESTORE_REQUIRES_EMPTY', 'Restore requires an empty workspace.');
  if (values.revision === 0) {
    if (JSON.stringify(values) !== JSON.stringify(PreferencesSchema.parse(defaultPreferences()))) throw new AppError(400, 'INVALID_BACKUP', 'Uninitialized preferences have inconsistent values.');
    return;
  }
  savePreferences(db, PreferenceValuesSchema.strip().parse(values), values.revision, values.updatedAt);
}
