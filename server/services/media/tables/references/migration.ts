import type { Migration } from '../../../../system/database/Migration.js';

export const mediaReferencesMigration: Migration = {
  id: 'media.references.001',
  up(db) {
    db.exec(`CREATE TABLE media_references (
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
      is_public INTEGER NOT NULL CHECK(is_public IN (0,1)),
      PRIMARY KEY(resource_type,resource_id,media_id)
    ) STRICT;
    CREATE INDEX media_reference_asset ON media_references(media_id,is_public);`);
  },
};
