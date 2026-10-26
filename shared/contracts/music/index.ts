import { z } from 'zod';
import { defineContract } from '../api.js';

const externalUrl = z.string().url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'External music URLs must use HTTPS without credentials');
export const TrackValuesSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().max(200),
  album: z.string().trim().max(200),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('media'), mediaId: z.string().uuid() }).strict(),
    z.object({ kind: z.literal('external'), url: externalUrl }).strict(),
  ]),
  coverMediaId: z.string().uuid().nullable(),
  lyricsMediaId: z.string().uuid().nullable(),
  lyrics: z.string().max(200_000),
  danmaku: z.array(z.object({ at: z.number().min(0).max(7 * 24 * 60 * 60), text: z.string().trim().min(1).max(200) }).strict()).max(2000),
  duration: z.number().min(0).max(7 * 24 * 60 * 60).nullable(),
}).strict();
export const TrackSchema = TrackValuesSchema.extend({
  id: z.string().uuid(), revision: z.number().int().positive(), position: z.number().int().nonnegative(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type TrackDTO = z.infer<typeof TrackSchema>;
export type TrackValues = z.infer<typeof TrackValuesSchema>;
export const TrackDeletionSchema = z.object({ id: z.string().uuid(), revision: z.number().int().positive(), deletedAt: z.string().datetime() }).strict();
export const ListTracks = defineContract('GET', '/api/music/tracks', z.object({ offset: z.coerce.number().int().nonnegative().default(0), limit: z.coerce.number().int().min(1).max(500).default(100) }).strict(), z.object({ items: z.array(TrackSchema), total: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative().nullable(), revision: z.number().int().nonnegative() }).strict());
export const CreateTrack = defineContract('POST', '/api/music/tracks', z.object({ id: z.string().uuid(), operationId: z.string().uuid(), values: TrackValuesSchema }).strict(), TrackSchema);
export const UpdateTrack = defineContract('PATCH', '/api/music/tracks/:id', z.object({ id: z.string().uuid(), operationId: z.string().uuid(), baseRevision: z.number().int().positive(), values: TrackValuesSchema }).strict(), TrackSchema);
export const DeleteTrack = defineContract('DELETE', '/api/music/tracks/:id', z.object({ id: z.string().uuid(), operationId: z.string().uuid(), baseRevision: z.number().int().positive() }).strict(), TrackDeletionSchema);
export const ReorderTracks = defineContract('PATCH', '/api/music/order', z.object({ ids: z.array(z.string().uuid()).max(10_000), baseRevision: z.number().int().nonnegative(), operationId: z.string().uuid() }).strict(), z.object({ ids: z.array(z.string().uuid()), revision: z.number().int().nonnegative() }).strict());

export const MusicSnapshotSchema = z.object({
  tracks: z.array(TrackSchema).max(10_000),
  tombstones: z.array(TrackDeletionSchema).max(10_000),
  libraryRevision: z.number().int().nonnegative(),
}).strict().superRefine((snapshot, context) => {
  const ids = [...snapshot.tracks.map((track) => track.id), ...snapshot.tombstones.map((tombstone) => tombstone.id)];
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Duplicate track identity' });
  if (new Set(snapshot.tracks.map((track) => track.position)).size !== snapshot.tracks.length) context.addIssue({ code: 'custom', message: 'Duplicate track position' });
});
export type MusicSnapshot = z.infer<typeof MusicSnapshotSchema>;
