import { z } from 'zod';
import { defineContract } from '../api.js';
import { MemosSnapshotSchema } from '../memos/index.js';
import { CanvasSchema } from '../canvas/index.js';
import { PreferencesSchema } from '../preferences/index.js';
import { ReviewResultSchema } from '../review/index.js';
import { MusicSnapshotSchema } from '../music/index.js';
import { MediaSnapshotSchema } from '../media/index.js';

export const MAX_BACKUP_BYTES = 128 * 1024 * 1024;
export const MAX_MEMOS_SOURCE_BYTES = 25 * 1024 * 1024;
export const BackupCountsSchema = z.object({
  memos: z.number().int().nonnegative(), tombstones: z.number().int().nonnegative(), pinned: z.number().int().nonnegative(), canvasShapes: z.number().int().nonnegative(), reviews: z.number().int().nonnegative(), tracks: z.number().int().nonnegative(), trackTombstones: z.number().int().nonnegative(), assets: z.number().int().nonnegative(), assetBytes: z.number().int().nonnegative(),
}).strict();
export const BackupEntitiesSchema = z.object({
  memos: MemosSnapshotSchema,
  preferences: PreferencesSchema,
  canvas: CanvasSchema,
  reviews: z.array(ReviewResultSchema).max(100_000),
  music: MusicSnapshotSchema,
  media: MediaSnapshotSchema,
}).strict();
export const BackupManifestSchema = z.object({
  format: z.literal('meow-workspace'), formatVersion: z.literal(1), schemaVersion: z.literal(1), backupId: z.string().uuid(), createdAt: z.string().datetime(), sourceInstanceId: z.string().uuid(),
  counts: BackupCountsSchema,
  excluded: z.tuple([z.literal('credentials'), z.literal('sessions'), z.literal('operationReceipts'), z.literal('devicePreferences')]),
  unbundledExternalTracks: z.array(z.object({ trackId: z.string().uuid(), url: z.string().url(), reason: z.literal('externally-hosted') }).strict()).max(10_000),
}).strict();
export const BackupPackageSchema = z.object({
  manifest: BackupManifestSchema,
  entities: BackupEntitiesSchema,
  assets: z.array(z.object({ id: z.string().uuid(), base64: z.string().max(4 * Math.ceil(25 * 1024 * 1024 / 3)) }).strict()).max(5000),
}).strict();
export type BackupEntities = z.infer<typeof BackupEntitiesSchema>;
export type BackupPackage = z.infer<typeof BackupPackageSchema>;
export type BackupCounts = z.infer<typeof BackupCountsSchema>;

export const ExportBackup = defineContract('GET', '/api/transfer/backup', z.object({}).strict(), z.null());
export const RestoreBackup = defineContract('POST', '/api/transfer/restore', z.object({}).strict(), z.object({ restored: z.literal(true), backupId: z.string().uuid(), counts: BackupCountsSchema, replayed: z.boolean(), cleanupPending: z.boolean() }).strict());
export const TransferStatus = defineContract('GET', '/api/transfer/status', z.object({}).strict(), z.object({ empty: z.boolean(), backupMaxBytes: z.literal(MAX_BACKUP_BYTES), memosSourceMaxBytes: z.literal(MAX_MEMOS_SOURCE_BYTES) }).strict());
export const MissingSourceAssetSchema = z.object({ sourceResourceId: z.string().max(200), fileName: z.string().max(240), mimeType: z.string().max(100), sourceMemoIds: z.array(z.string().max(200)).max(5000) }).strict();
export const MemosPreviewSchema = z.object({
  previewId: z.string().uuid(), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/), sourceId: z.string().uuid(), supportedFormat: z.literal('memos-memo-created_ts-v1'), memoCount: z.number().int().nonnegative().max(5000), pinnedCount: z.number().int().nonnegative(), publicCount: z.number().int().nonnegative(), archivedExcluded: z.number().int().nonnegative(), alreadyImported: z.boolean(), missingAssets: z.array(MissingSourceAssetSchema).max(5000), warnings: z.array(z.string().max(1000)).max(100),
}).strict();
export type MemosPreviewDTO = z.infer<typeof MemosPreviewSchema>;
export const PreviewMemosImport = defineContract('POST', '/api/transfer/memos/preview', z.object({ fileName: z.string().min(1).max(240).refine((name) => !/[\\/]/.test(name), 'Invalid file name') }).strict(), MemosPreviewSchema);
export const ImportMemos = defineContract('POST', '/api/transfer/memos/import', z.object({
  previewId: z.string().uuid(), operationId: z.string().uuid(), allowMissingAssets: z.boolean(), assets: z.array(z.object({ sourceResourceId: z.string().min(1).max(200), mediaId: z.string().uuid() }).strict()).max(5000),
}).strict(), z.object({ imported: z.number().int().nonnegative(), sourceId: z.string().uuid(), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/), missingAssets: z.array(MissingSourceAssetSchema), replayed: z.boolean() }).strict());
