import type { MediaReferenceDTO } from '../../../../shared/contracts/media/index.js';
import type { BackupEntities } from '../../../../shared/contracts/transfer/index.js';
import { AppError } from '../../../system/errors/AppError.js';

export function canonicalReferences(entities: BackupEntities): MediaReferenceDTO[] {
  const references: MediaReferenceDTO[] = [];
  const add = (resourceType: MediaReferenceDTO['resourceType'], resourceId: string, mediaIds: readonly (string | null)[], isPublic: boolean) => {
    for (const mediaId of new Set(mediaIds.filter((value): value is string => value !== null))) references.push({ resourceType, resourceId, mediaId, isPublic });
  };
  for (const memo of entities.memos.memos) add('memo', memo.id, memo.attachments.map((attachment) => attachment.mediaId), memo.isPublic);
  add('canvas', 'workspace', entities.canvas.document.shapes.filter((shape) => shape.type === 'image').map((shape) => shape.mediaId), false);
  for (const track of entities.music.tracks) add('music', track.id, [track.source.kind === 'media' ? track.source.mediaId : null, track.coverMediaId, track.lyricsMediaId], false);
  add('preferences', 'workspace', [entities.preferences.avatarMediaId, entities.preferences.background.mode === 'image' ? entities.preferences.background.mediaId : null], true);
  return references;
}

export function validateReferences(entities: BackupEntities): void {
  const assets = new Set(entities.media.assets.map((asset) => asset.id));
  if (assets.size !== entities.media.assets.length) throw new AppError(400, 'INVALID_BACKUP', 'Duplicate media identities.');
  const memos = new Set(entities.memos.memos.map((memo) => memo.id));
  for (const memo of entities.memos.memos) {
    if (memo.links.some((id) => !memos.has(id))) throw new AppError(400, 'INVALID_BACKUP', 'A memo references a missing memo.');
  }
  if (entities.reviews.some((review) => !memos.has(review.memoId)) || entities.canvas.document.memoPositions.some((position) => !memos.has(position.memoId))) throw new AppError(400, 'INVALID_BACKUP', 'Review or canvas memo references are incomplete.');
  const reviewKeys = entities.reviews.map((review) => `${review.memoId}:${review.day}:${review.timezone}`);
  if (new Set(reviewKeys).size !== reviewKeys.length) throw new AppError(400, 'INVALID_BACKUP', 'Duplicate review identities.');
  const key = (reference: MediaReferenceDTO) => JSON.stringify([reference.resourceType, reference.resourceId, reference.mediaId, reference.isPublic]);
  const expected = canonicalReferences(entities).map(key).sort();
  const actual = entities.media.references.map(key).sort();
  if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) throw new AppError(400, 'INVALID_BACKUP', 'Media reference/publicity metadata does not match the domain entities.');
  if (entities.media.references.some((reference) => !assets.has(reference.mediaId))) throw new AppError(400, 'INVALID_BACKUP', 'A referenced media asset is missing.');
  const mediaById = new Map(entities.media.assets.map((asset) => [asset.id, asset]));
  const requireKind = (mediaId: string | null, kind: 'image' | 'audio' | 'file') => {
    if (mediaId === null) return;
    const media = mediaById.get(mediaId);
    if (!media || (kind !== 'file' && !media.mimeType.startsWith(`${kind}/`))) throw new AppError(400, 'INVALID_BACKUP', 'A media type does not match its use in the workspace.');
  };
  for (const memo of entities.memos.memos) for (const attachment of memo.attachments) requireKind(attachment.mediaId, attachment.kind);
  for (const shape of entities.canvas.document.shapes) if (shape.type === 'image') requireKind(shape.mediaId, 'image');
  requireKind(entities.preferences.avatarMediaId, 'image');
  requireKind(entities.preferences.background.mediaId, 'image');
  for (const track of entities.music.tracks) {
    if (track.source.kind === 'media') requireKind(track.source.mediaId, 'audio');
    requireKind(track.coverMediaId, 'image');
    requireKind(track.lyricsMediaId, 'file');
  }
}
