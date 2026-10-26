import type Database from 'better-sqlite3';
import { PreferenceValuesSchema, PreferencesSchema, type PreferencesDTO, type PreferenceValues } from '../../../../../shared/contracts/preferences/index.js';
import type { Preferences } from '../../objects/Preferences.js';

export function readPreferences(db: Database.Database): Preferences | undefined {
  const row = db.prepare('SELECT revision, values_json, updated_at FROM workspace_preferences WHERE singleton = 1').get() as
    | { revision: number; values_json: string; updated_at: string } | undefined;
  return row ? { ...PreferenceValuesSchema.parse(JSON.parse(row.values_json)), revision: row.revision, updatedAt: row.updated_at } : undefined;
}

export function savePreferences(db: Database.Database, values: PreferenceValues, revision: number, at: string): Preferences {
  db.prepare('INSERT INTO workspace_preferences (singleton, revision, values_json, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(singleton) DO UPDATE SET revision = excluded.revision, values_json = excluded.values_json, updated_at = excluded.updated_at')
    .run(revision, JSON.stringify(values), at);
  return { ...values, revision, updatedAt: at };
}

export function readPreferenceOperation(db: Database.Database, operationId: string): { input: string; output: PreferencesDTO } | undefined {
  const row = db.prepare('SELECT input_json, output_json FROM preferences_operations WHERE operation_id = ?').get(operationId) as { input_json: string; output_json: string } | undefined;
  return row ? { input: row.input_json, output: PreferencesSchema.parse(JSON.parse(row.output_json)) } : undefined;
}

export function savePreferenceOperation(db: Database.Database, operationId: string, input: string, output: PreferencesDTO): void {
  db.prepare('INSERT INTO preferences_operations (operation_id, input_json, output_json) VALUES (?, ?, ?)').run(operationId, input, JSON.stringify(output));
}

export function preferencesEmpty(db: Database.Database): boolean {
  return db.prepare('SELECT 1 FROM workspace_preferences LIMIT 1').get() === undefined;
}
