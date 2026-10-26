import type { Migration } from '../../../../system/database/Migration.js';

export const musicMigrations: readonly Migration[] = [{
  id: 'music.001.library',
  up(db) {
    db.exec(`CREATE TABLE music_tracks (
      id TEXT PRIMARY KEY,
      metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
      revision INTEGER NOT NULL CHECK(revision >= 1),
      position INTEGER NOT NULL CHECK(position >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX music_tracks_order ON music_tracks(position, id);
    CREATE TABLE music_library (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      revision INTEGER NOT NULL CHECK(revision >= 0)
    );
    INSERT INTO music_library VALUES(1, 0);
    CREATE TABLE music_tombstones (
      id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL CHECK(revision >= 1),
      deleted_at TEXT NOT NULL
    );
    CREATE TABLE music_operations (
      operation_id TEXT PRIMARY KEY,
      operation_kind TEXT NOT NULL,
      input_json TEXT NOT NULL CHECK(json_valid(input_json)),
      output_json TEXT NOT NULL CHECK(json_valid(output_json))
    );`);
  },
}];
