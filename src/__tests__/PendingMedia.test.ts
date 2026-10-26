import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../system/api/sendAPI';
import { listPendingMedia, readPendingMedia } from '../system/storage/PendingMediaStore';
import { ensurePendingMediaUploaded, getPendingMediaBlob, releasePendingMedia, stagePendingMedia } from '../features/media/pendingMedia';

const mock = vi.hoisted(() => ({ upload: vi.fn(), metadata: vi.fn() }));
vi.mock('../apis/media/UploadMediaAPI', () => ({ UploadMediaAPI: mock.upload }));
vi.mock('../apis/media/GetMediaAPI', () => ({ GetMediaAPI: mock.metadata }));

beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
  mock.upload.mockReset().mockResolvedValue({}); mock.metadata.mockReset().mockResolvedValue({});
});

describe('durable pending media', () => {
  it('persists actual bytes before exposing a stable media reference and retains retry identity across reloads', async () => {
    const instanceId = crypto.randomUUID();
    const staged = await stagePendingMedia(instanceId, new File(['recorded bytes'], 'recording.webm', { type: 'audio/webm;codecs=opus' }));
    const original = await readPendingMedia(instanceId, staged.mediaId);
    expect(original?.status).toBe('pending');
    expect(original?.mimeType).toBe('audio/webm');
    expect(await (await getPendingMediaBlob(instanceId, staged.mediaId))?.text()).toBe('recorded bytes');
    expect(await readPendingMedia('another-instance', staged.mediaId)).toBeNull();
    mock.upload.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    await expect(ensurePendingMediaUploaded(instanceId, [staged.mediaId])).rejects.toThrow('offline');
    const failed = await readPendingMedia(instanceId, staged.mediaId);
    expect(failed?.status).toBe('failed');
    expect(failed?.operationId).toBe(original?.operationId);
    await ensurePendingMediaUploaded(instanceId, [staged.mediaId]);
    expect(mock.upload.mock.calls[1]?.[2]).toEqual({ id: staged.mediaId, operationId: original?.operationId });
    expect((await readPendingMedia(instanceId, staged.mediaId))?.status).toBe('uploaded');
    // Upload confirmation alone does not discard bytes if the domain save fails.
    expect(await (await getPendingMediaBlob(instanceId, staged.mediaId))?.text()).toBe('recorded bytes');
    await releasePendingMedia(instanceId, [staged.mediaId]);
    expect(await listPendingMedia(instanceId)).toEqual([]);
  });

  it('checks previously uploaded files before reuse and regenerates only a confirmed-missing upload operation', async () => {
    const instanceId = crypto.randomUUID();
    const staged = await stagePendingMedia(instanceId, new File(['image bytes'], 'image.png', { type: 'image/png' }));
    await ensurePendingMediaUploaded(instanceId, [staged.mediaId]);
    const first = await readPendingMedia(instanceId, staged.mediaId);
    mock.metadata.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'server error'));
    await expect(ensurePendingMediaUploaded(instanceId, [staged.mediaId])).rejects.toThrow('server error');
    expect((await readPendingMedia(instanceId, staged.mediaId))?.status).toBe('uploaded');
    mock.metadata.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'missing'));
    await ensurePendingMediaUploaded(instanceId, [staged.mediaId]);
    const restored = await readPendingMedia(instanceId, staged.mediaId);
    expect(restored?.mediaId).toBe(first?.mediaId);
    expect(restored?.operationId).not.toBe(first?.operationId);
    expect(restored?.status).toBe('uploaded');
    mock.metadata.mockRejectedValueOnce(new ApiError(503, 'MEDIA_FILE_MISSING', 'file bytes missing'));
    await ensurePendingMediaUploaded(instanceId, [staged.mediaId]);
    expect((await readPendingMedia(instanceId, staged.mediaId))?.operationId).toBe(restored?.operationId);
    expect(mock.upload.mock.calls.at(-1)?.[2]).toEqual({ id: staged.mediaId, operationId: restored?.operationId });
  });

  it('rejects quota failure without claiming that a local attachment has been saved', async () => {
    const instanceId = crypto.randomUUID();
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('No space', 'QuotaExceededError'); });
    await expect(stagePendingMedia(instanceId, new File(['bytes'], 'file.txt', { type: 'text/plain' }))).rejects.toThrow('No space');
    spy.mockRestore();
    expect(await listPendingMedia(instanceId)).toEqual([]);
    expect(mock.upload).not.toHaveBeenCalled();
  });
});
