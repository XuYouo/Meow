import { z } from 'zod';

const metadataSchema = z.object({
  mediaId: z.string().uuid(), operationId: z.string().uuid(), fileName: z.string().min(1), mimeType: z.string(),
  size: z.number().int().positive(), createdAt: z.string().datetime(),
  status: z.enum(['pending', 'failed', 'uploaded']), error: z.string().nullable(),
});
export type PendingMediaMetadata = z.infer<typeof metadataSchema>;
export interface PendingMediaRecord extends PendingMediaMetadata { blob: Blob }
const storeName = 'files';

function databaseName(instanceId: string): string { return `meow-v2-${encodeURIComponent(instanceId)}-owner-pending-media`; }
function openDatabase(instanceId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前浏览器不支持持久附件存储，附件尚未保存。')); return; }
    const request = indexedDB.open(databaseName(instanceId), 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(storeName, { keyPath: 'mediaId' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('附件存储无法打开，请保留文件并重试。', { cause: request.error }));
    request.onblocked = () => reject(new Error('附件存储被其他页面占用，请关闭其他工作区标签页后重试。'));
  });
}

async function transact<T>(instanceId: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase(instanceId);
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    let value: T;
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => { value = request.result; };
    transaction.oncomplete = () => { database.close(); resolve(value); };
    transaction.onabort = () => { database.close(); reject(new Error('附件未能持久保存，可能空间不足。原有文件不会被清除。', { cause: transaction.error })); };
    transaction.onerror = () => { /* The abort handler returns the actual failure. */ };
  });
}

function decode(value: unknown): PendingMediaRecord {
  const parsed = metadataSchema.parse(value);
  if (!value || typeof value !== 'object' || !('blob' in value) || !(value.blob instanceof Blob) || value.blob.size !== parsed.size) throw new Error('本地附件数据不完整，请保留原文件并重新上传。');
  return { ...parsed, blob: value.blob };
}

export async function putPendingMedia(instanceId: string, record: PendingMediaRecord): Promise<void> {
  const data = decode(record);
  await transact(instanceId, 'readwrite', (store) => store.put(data));
}
export async function readPendingMedia(instanceId: string, mediaId: string): Promise<PendingMediaRecord | null> {
  const value: unknown = await transact(instanceId, 'readonly', (store) => store.get(mediaId));
  return value === undefined ? null : decode(value);
}
export async function listPendingMedia(instanceId: string): Promise<PendingMediaRecord[]> {
  const values: unknown[] = await transact(instanceId, 'readonly', (store) => store.getAll());
  return values.map(decode).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function deletePendingMedia(instanceId: string, mediaId: string): Promise<void> {
  await transact(instanceId, 'readwrite', (store) => store.delete(mediaId));
}
