import type { Migration } from '../../../../system/database/Migration.js';

export const preferencesMigrations: readonly Migration[] = [{
  id: 'preferences.001.workspace',
  up(db) {
    db.exec(`CREATE TABLE workspace_preferences (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      revision INTEGER NOT NULL CHECK (revision >= 1),
      values_json TEXT NOT NULL CHECK (json_valid(values_json)),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE preferences_operations (
      operation_id TEXT PRIMARY KEY,
      input_json TEXT NOT NULL CHECK (json_valid(input_json)),
      output_json TEXT NOT NULL CHECK (json_valid(output_json))
    );`);
  },
}];
