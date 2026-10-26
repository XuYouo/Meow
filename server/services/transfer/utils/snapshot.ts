import type Database from 'better-sqlite3';
import { BackupEntitiesSchema, type BackupCounts, type BackupEntities } from '../../../../shared/contracts/transfer/index.js';
import { plan as exportMemos } from '../../memos/api/ExportMemosAPIMessage.js';
import { plan as exportPreferences } from '../../preferences/api/ExportPreferencesAPIMessage.js';
import { plan as exportCanvas } from '../../canvas/api/ExportCanvasAPIMessage.js';
import { plan as exportReviews } from '../../review/api/ExportReviewsAPIMessage.js';
import { plan as exportMusic } from '../../music/api/ExportMusicAPIMessage.js';
import { plan as exportMedia } from '../../media/api/ExportMediaAPIMessage.js';

export function snapshot(db: Database.Database): BackupEntities {
  return BackupEntitiesSchema.parse({ memos: exportMemos({ db }), preferences: exportPreferences({ db }), canvas: exportCanvas({ db }), reviews: exportReviews({ db }), music: exportMusic({ db }), media: exportMedia({ db }) });
}

export function counts(entities: BackupEntities): BackupCounts {
  return { memos: entities.memos.memos.length, tombstones: entities.memos.tombstones.length, pinned: entities.memos.pinOrder.length, canvasShapes: entities.canvas.document.shapes.length, reviews: entities.reviews.length, tracks: entities.music.tracks.length, trackTombstones: entities.music.tombstones.length, assets: entities.media.assets.length, assetBytes: entities.media.assets.reduce((total, asset) => total + asset.size, 0) };
}

export function empty(entities: BackupEntities): boolean {
  return entities.memos.memos.length === 0 && entities.memos.tombstones.length === 0 && entities.preferences.revision === 0 && entities.canvas.revision === 0 && entities.reviews.length === 0 && entities.music.libraryRevision === 0 && entities.music.tracks.length === 0 && entities.music.tombstones.length === 0 && entities.media.assets.length === 0;
}
