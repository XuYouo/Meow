import { z } from 'zod';
import { defineContract } from '../api.js';

export const MediaSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string().min(1).max(240),
  mimeType: z.string(),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
}).strict();
export type MediaDTO = z.infer<typeof MediaSchema>;

export const UploadMediaInputSchema = z.object({
  id: z.string().uuid(),
  operationId: z.string().uuid(),
  fileName: z.string().min(1).max(240).refine((name) => Array.from(name).every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127 && character !== '/' && character !== '\\';
  }), 'Invalid file name'),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/flac', 'audio/x-flac', 'application/pdf', 'application/octet-stream', 'text/plain']),
}).strict();

/** The request body is binary; validated metadata is encoded in the query. */
export const UploadMedia = defineContract('POST', '/api/media/upload', UploadMediaInputSchema, MediaSchema);
export const GetMedia = defineContract('GET', '/api/media/:id', z.object({ id: z.string().uuid() }).strict(), MediaSchema);
export const ReadMedia = defineContract('GET', '/api/media/:id/content', z.object({ id: z.string().uuid() }).strict(), z.null());
export const DeleteUnusedMedia = defineContract('DELETE', '/api/media/:id', z.object({ id: z.string().uuid() }).strict(), z.object({ deleted: z.literal(true) }).strict());

export const MediaReferenceSchema = z.object({
  resourceType: z.enum(['memo', 'canvas', 'music', 'preferences']), resourceId: z.string().min(1).max(100), mediaId: z.string().uuid(), isPublic: z.boolean(),
}).strict();
export const MediaSnapshotSchema = z.object({
  assets: z.array(MediaSchema.extend({ fileName: UploadMediaInputSchema.shape.fileName, mimeType: UploadMediaInputSchema.shape.mimeType, size: z.number().int().min(1).max(25 * 1024 * 1024) })).max(5000),
  references: z.array(MediaReferenceSchema).max(100_000),
}).strict();
export type MediaSnapshot = z.infer<typeof MediaSnapshotSchema>;
export type MediaReferenceDTO = z.infer<typeof MediaReferenceSchema>;
