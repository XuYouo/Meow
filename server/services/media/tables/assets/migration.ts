import type { Migration } from '../../../../system/database/Migration.js';

export const mediaAssetsMigration: Migration = {
  id: 'media.assets.001',
  up(db) {
    db.exec(`CREATE TABLE media_assets (
      id TEXT PRIMARY KEY NOT NULL,
      operation_id TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL CHECK(size > 0),
      sha256 TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('ready','deleting')),
      created_at TEXT NOT NULL
    ) STRICT;`);
  },
};
