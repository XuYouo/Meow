import { ReadMediaAPI } from '../../apis/media/ReadMediaAPI';
import { UploadMediaInputSchema } from '../../../shared/contracts/media';
import { GetMediaAPI } from '../../apis/media/GetMediaAPI';
import { UploadMediaAPI } from '../../apis/media/UploadMediaAPI';
import { ApiError } from '../../system/api/sendAPI';
import { deletePendingMedia, putPendingMedia, readPendingMedia, type PendingMediaRecord } from '../../system/storage/PendingMediaStore';

const listeners = new Map<string, Set<() => void>>();
const inflight = new Map<string, Promise<void>>();
function changed(instanceId: string) { for (const listener of listeners.get(instanceId) ?? []) listener(); }
export function subscribePendingMedia(instanceId: string, listener: () => void): () => void {
  const group = listeners.get(instanceId) ?? new Set<() => void>(); group.add(listener); listeners.set(instanceId, group);
  return () => { group.delete(listener); if (!group.size) listeners.delete(instanceId); };
}
export function getMediaContentURL(mediaId: string): string { return ReadMediaAPI(mediaId); }
export async function getPendingMediaBlob(instanceId: string, mediaId: string): Promise<Blob | null> { return (await readPendingMedia(instanceId, mediaId))?.blob ?? null; }

export async function stagePendingMedia(instanceId: string, file: File): Promise<{ mediaId: string }> {
  if (!file.size) throw new Error('不能保存空文件。');
  if (file.size > 25 * 1024 * 1024) throw new Error('单个文件不能超过25 MB。');
  const metadata = UploadMediaInputSchema.parse({ id: crypto.randomUUID(), operationId: crypto.randomUUID(), fileName: file.name, mimeType: file.type.split(';')[0] || 'application/octet-stream' });
  const blob = new Blob([file], { type: metadata.mimeType });
  await putPendingMedia(instanceId, { mediaId: metadata.id, operationId: metadata.operationId, fileName: metadata.fileName, mimeType: metadata.mimeType, size: blob.size, blob, createdAt: new Date().toISOString(), status: 'pending', error: null });
  changed(instanceId); return { mediaId: metadata.id };
}

async function uploadOne(instanceId: string, mediaId: string, signal?: AbortSignal): Promise<void> {
  let record = await readPendingMedia(instanceId, mediaId);
  if (!record) return; // Already-confirmed server references are validated by their domain use case.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  try {
    if (record.status === 'uploaded') {
      try { await GetMediaAPI(mediaId, signal); return; }
      catch (cause) {
        if (!(cause instanceof ApiError) || (cause.status !== 404 && cause.code !== 'MEDIA_FILE_MISSING')) throw cause;
        record = { ...record, operationId: cause.status === 404 ? crypto.randomUUID() : record.operationId, status: 'pending', error: null };
        await putPendingMedia(instanceId, record);
      }
    }
    await UploadMediaAPI(new File([record.blob], record.fileName, { type: record.mimeType }), signal, { id: record.mediaId, operationId: record.operationId });
    await putPendingMedia(instanceId, { ...record, status: 'uploaded', error: null });
    changed(instanceId);
  } catch (cause) {
    if (!signal?.aborted) {
      const failed: PendingMediaRecord = { ...record, status: record.status === 'uploaded' ? 'uploaded' : 'failed', error: cause instanceof Error ? cause.message : '上传未确认，请重试。' };
      await putPendingMedia(instanceId, failed); changed(instanceId);
    }
    throw cause;
  }
}

export async function ensurePendingMediaUploaded(instanceId: string, ids: readonly string[], signal?: AbortSignal): Promise<void> {
  for (const mediaId of new Set(ids)) {
    const key = `${instanceId}:${mediaId}`;
    let operation = inflight.get(key);
    if (!operation) {
      operation = uploadOne(instanceId, mediaId, signal);
      inflight.set(key, operation);
    }
    try { await operation; } finally { if (inflight.get(key) === operation) inflight.delete(key); }
  }
}

export async function releasePendingMedia(instanceId: string, ids: readonly string[]): Promise<void> {
  for (const id of new Set(ids)) await deletePendingMedia(instanceId, id);
  changed(instanceId);
}
