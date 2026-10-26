import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApplication } from '../server/app.js';
import { readConfig } from '../server/system/config.js';
import { memosMigrations } from '../server/services/memos/tables/migrations.js';
import { registerMemosRoutes } from '../server/services/memos/routes/index.js';
import { registerMediaRoutes } from '../server/services/media/routes/index.js';
import { mediaAssetsMigration } from '../server/services/media/tables/assets/migration.js';
import { mediaReferencesMigration } from '../server/services/media/tables/references/migration.js';
import { plan as setReferences } from '../server/services/media/api/SetMediaReferencesAPIMessage.js';
import { MediaSchema } from '../shared/contracts/media/index.js';
import { MemoSchema } from '../shared/contracts/memos/index.js';

let directory: string;
let application: ReturnType<typeof createApplication>;
let client: ReturnType<typeof request.agent>;
const write = { 'X-Meow-Request': '1' };
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');

beforeEach(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'meow-media-'));
  application = createApplication({
    config: readConfig({ MEOW_DATA_DIR: directory, MEOW_OWNER_PASSWORD: 'synthetic-password-only' }),
    migrations: [...memosMigrations, mediaAssetsMigration, mediaReferencesMigration],
    registerDomains(registry, runtime) {
      registerMemosRoutes(registry, runtime, { onMemoChanged(before, after) {
        const memo = after ?? before;
        if (memo) setReferences({ resourceType: 'memo', resourceId: memo.id, mediaIds: after?.attachments.map((item) => item.mediaId) ?? [], isPublic: after?.isPublic ?? false }, runtime);
      } });
      registerMediaRoutes(registry, runtime);
    },
    logError() {},
  });
  client = request.agent(application.app);
  await client.post('/api/session/login').set(write).send({ password: 'synthetic-password-only' }).expect(200);
});
afterEach(() => { application.close(); rmSync(directory, { recursive: true, force: true }); });

async function upload(body = png, extras: Record<string, string> = {}) {
  const input = { id: randomUUID(), operationId: randomUUID(), fileName: '合成图片.png', mimeType: 'image/png', ...extras };
  const response = await client.post('/api/media/upload').query(input).set(write).set('Content-Type', 'application/octet-stream').send(body).expect(200);
  return { input, asset: MediaSchema.parse(response.body) };
}

describe('media files, references and authorization', () => {
  it('does not overwrite unknown files and compensates files when the metadata transaction fails', async () => {
    const id = randomUUID(); const destination = path.join(application.runtime.uploadsDir, `${id}.bin`);
    mkdirSync(application.runtime.uploadsDir, { recursive: true }); writeFileSync(destination, 'unowned-sentinel');
    await client.post('/api/media/upload').query({ id, operationId: randomUUID(), fileName: 'new.png', mimeType: 'image/png' }).set(write).set('Content-Type', 'application/octet-stream').send(png).expect(409);
    expect(readFileSync(destination, 'utf8')).toBe('unowned-sentinel');
    application.runtime.db.exec("CREATE TRIGGER synthetic_media_failure BEFORE INSERT ON media_assets BEGIN SELECT RAISE(ABORT,'synthetic disk metadata failure'); END");
    const failedId = randomUUID();
    await client.post('/api/media/upload').query({ id: failedId, operationId: randomUUID(), fileName: 'new.png', mimeType: 'image/png' }).set(write).set('Content-Type', 'application/octet-stream').send(png).expect(500);
    expect(existsSync(path.join(application.runtime.uploadsDir, `${failedId}.bin`))).toBe(false);
    expect(readdirSync(path.join(application.runtime.uploadsDir, '.staging'))).toEqual([]);
    application.runtime.db.exec('DROP TRIGGER synthetic_media_failure');
    await upload();
  });

  it('keeps failed cleanup retryable and rejects a file over the declared upload limit', async () => {
    const { asset } = await upload();
    chmodSync(application.runtime.uploadsDir, 0o500);
    try { await client.delete(`/api/media/${asset.id}`).set(write).send({}).expect(503); }
    finally { chmodSync(application.runtime.uploadsDir, 0o700); }
    await client.get(`/api/media/${asset.id}/content`).expect(404);
    await client.delete(`/api/media/${asset.id}`).set(write).send({}).expect(200);
    await client.post('/api/media/upload').query({ id: randomUUID(), operationId: randomUUID(), fileName: 'too-large.png', mimeType: 'image/png' }).set(write).set('Content-Type', 'application/octet-stream').send(png).set('Content-Length', String(25 * 1024 * 1024 + 1)).expect(413);
  });

  it('persists actual bytes and supports validated private metadata and Range playback', async () => {
    const { asset } = await upload();
    expect(asset.size).toBe(png.length);
    expect(asset.sha256).toHaveLength(64);
    const response = await client.get(`/api/media/${asset.id}/content`).set('Range', 'bytes=0-7').expect(206);
    expect(response.headers['content-range']).toBe(`bytes 0-7/${png.length}`);
    expect(response.body).toEqual(png.subarray(0, 8));
    await client.get(`/api/media/${asset.id}/content`).set('Range', 'bytes=9999-').expect(416);
    await request(application.app).get(`/api/media/${asset.id}`).expect(404);
    await request(application.app).get(`/api/media/${asset.id}/content`).expect(404);
  });

  it('makes referenced files public only while a public note still grants access', async () => {
    const { asset } = await upload();
    const created = await client.post('/api/memos').set(write).send({
      id: randomUUID(), operationId: randomUUID(), content: '公开图片', isPublic: true,
      attachments: [{ mediaId: asset.id, kind: 'image' }],
    }).expect(200);
    const memo = MemoSchema.parse(created.body);
    await request(application.app).get(`/api/media/${asset.id}/content`).expect(200);
    await client.delete(`/api/media/${asset.id}`).set(write).send({}).expect(409);
    await client.patch(`/api/memos/${memo.id}/visibility`).set(write).send({ operationId: randomUUID(), baseRevision: memo.revision, isPublic: false }).expect(200);
    await request(application.app).get(`/api/media/${asset.id}/content`).expect(404);
    await client.delete(`/api/memos/${memo.id}`).set(write).send({ operationId: randomUUID(), baseRevision: memo.revision + 1 }).expect(200);
    await client.delete(`/api/media/${asset.id}`).set(write).send({}).expect(200);
    expect(readdirSync(application.runtime.uploadsDir).filter((name) => name.endsWith('.bin'))).toEqual([]);
  });

  it('rejects missing assets within the memo transaction without leaving a memo', async () => {
    await client.post('/api/memos').set(write).send({
      id: randomUUID(), operationId: randomUUID(), content: '错误引用', attachments: [{ mediaId: randomUUID(), kind: 'image' }],
    }).expect(400);
    expect((await client.get('/api/memos')).body.total).toBe(0);
  });

  it('recovers an exact orphan after interrupted commit and repairs missing confirmed bytes', async () => {
    const id = randomUUID(); const operationId = randomUUID();
    mkdirSync(application.runtime.uploadsDir, { recursive: true });
    writeFileSync(path.join(application.runtime.uploadsDir, `${id}.bin`), png);
    const { input, asset } = await upload(png, { id, operationId });
    unlinkSync(path.join(application.runtime.uploadsDir, `${id}.bin`));
    const missing = await client.get(`/api/media/${id}`).expect(503);
    expect(missing.body.error.code).toBe('MEDIA_FILE_MISSING');
    const replay = await client.post('/api/media/upload').query(input).set(write).set('Content-Type', 'application/octet-stream').send(png).expect(200);
    expect(replay.body).toEqual(asset);
    expect(readFileSync(path.join(application.runtime.uploadsDir, `${id}.bin`))).toEqual(png);
  });

  it('replays identical uploads and rejects reused IDs with different bytes', async () => {
    const { input, asset } = await upload();
    const retry = await client.post('/api/media/upload').query(input).set(write).set('Content-Type', 'application/octet-stream').send(png).expect(200);
    expect(retry.body).toEqual(asset);
    await client.post('/api/media/upload').query(input).set(write).set('Content-Type', 'application/octet-stream').send(Buffer.concat([png, Buffer.from('different')])).expect(409);
    expect(readdirSync(path.join(application.runtime.uploadsDir, '.staging'))).toEqual([]);
  });

  it('rejects forged types, unsafe names, empty files and unauthenticated uploads', async () => {
    const input = { id: randomUUID(), operationId: randomUUID(), fileName: 'image.png', mimeType: 'image/png' };
    await client.post('/api/media/upload').query(input).set(write).set('Content-Type', 'application/octet-stream').send(Buffer.from('<script>alert(1)</script>')).expect(400);
    await client.post('/api/media/upload').query({ ...input, fileName: '../secret' }).set(write).set('Content-Type', 'application/octet-stream').send(png).expect(400);
    await client.post('/api/media/upload').query(input).set(write).set('Content-Type', 'application/octet-stream').send(Buffer.alloc(0)).expect(400);
    await request(application.app).post('/api/media/upload').query(input).set(write).set('Content-Type', 'application/octet-stream').send(png).expect(401);
    expect(readdirSync(application.runtime.uploadsDir).filter((name) => name.endsWith('.bin'))).toEqual([]);
  });
});
