import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupPackageSchema, type BackupPackage, type MemosPreviewDTO } from '../../shared/contracts/transfer/index.js';
import { PreferenceValuesSchema, type PreferencesDTO } from '../../shared/contracts/preferences/index.js';
import type { MemoDTO } from '../../shared/contracts/memos/index.js';
import type { MediaDTO } from '../../shared/contracts/media/index.js';
import type { TrackDTO } from '../../shared/contracts/music/index.js';
import { createWorkspaceApplication } from '../bootstrap.js';
import { readConfig } from '../system/config.js';
import type { TransferDependencies } from '../services/transfer/utils/TransferDependencies.js';
import { digest } from '../services/transfer/utils/package.js';
import { startLease, keepLease } from '../services/transfer/utils/lease.js';
import { prepareRestoreFiles, stageRestoreFiles } from '../services/transfer/utils/restoreFiles.js';
import { parsePackage } from '../services/transfer/utils/package.js';
import { readBounded } from '../services/transfer/utils/readBounded.js';
import { Readable } from 'node:stream';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA5sAAAAASUVORK5CYII=', 'base64');
const audio = Buffer.alloc(48, 128);
audio.write('RIFF', 0); audio.writeUInt32LE(40, 4); audio.write('WAVE', 8); audio.write('fmt ', 12); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(8000, 28); audio.writeUInt16LE(1, 32); audio.writeUInt16LE(8, 34); audio.write('data', 36); audio.writeUInt32LE(4, 40);
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function directory(): string { const root = mkdtempSync(path.join(os.tmpdir(), 'meow-transfer-test-')); cleanups.push(() => rmSync(root, { recursive: true, force: true })); return root; }

async function fixture(fault?: TransferDependencies['fault'], now?: () => string) {
  const config = readConfig({ MEOW_DATA_DIR: directory(), MEOW_OWNER_PASSWORD: 'A synthetic destination password' });
  const application = createWorkspaceApplication({ config, transferFault: fault, now, logError: () => {} });
  const server = createServer(application.app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); application.close(); });
  const base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${base}/api/session/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Meow-Request': '1' }, body: JSON.stringify({ password: 'A synthetic destination password' }) });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Failed to login');
  const request = (url: string, method = 'GET', body?: unknown, anonymous = false) => fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json', 'X-Meow-Request': '1', ...(!anonymous ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const binary = (url: string, bytes: Buffer, anonymous = false) => fetch(`${base}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Meow-Request': '1', ...(!anonymous ? { Cookie: cookie } : {}) }, body: new Uint8Array(bytes) });
  async function upload(content: Buffer, fileName: string, mimeType: string): Promise<MediaDTO> {
    const response = await binary(`/api/media/upload?${new URLSearchParams({ id: randomUUID(), operationId: randomUUID(), fileName, mimeType })}`, content);
    if (!response.ok) throw new Error(await response.text());
    return await response.json() as MediaDTO;
  }
  async function memo(content: string, extra: Record<string, unknown> = {}): Promise<MemoDTO> {
    const response = await request('/api/memos', 'POST', { id: randomUUID(), operationId: randomUUID(), content, ...extra });
    if (!response.ok) throw new Error(await response.text());
    return await response.json() as MemoDTO;
  }
  async function exported(): Promise<{ value: BackupPackage; bytes: Buffer }> {
    const response = await request('/api/transfer/backup');
    if (!response.ok) throw new Error(await response.text());
    const bytes = Buffer.from(await response.arrayBuffer());
    return { bytes, value: BackupPackageSchema.parse(JSON.parse(bytes.toString('utf8'))) };
  }
  return { ...application, base, cookie, server, request, binary, upload, memo, exported };
}

async function populated() {
  const source = await fixture();
  const png = await source.upload(image, 'one.png', 'image/png');
  const wav = await source.upload(audio, 'one.wav', 'audio/wav');
  const lyrics = await source.upload(Buffer.from('[00:01.00]歌词'), 'one.lrc', 'text/plain');
  await source.upload(Buffer.from('an unreferenced real file'), 'unused.txt', 'text/plain');
  const first = await source.memo('Private #学习/软件', { tags: ['学习/软件'], isPinned: true, attachments: [{ mediaId: png.id, kind: 'image' }] });
  const second = await source.memo('Public #分享', { tags: ['分享'], isPublic: true, isPinned: true, links: [first.id], attachments: [{ mediaId: png.id, kind: 'image' }] });
  const deleted = await source.memo('A deleted note');
  expect((await source.request(`/api/memos/${deleted.id}`, 'DELETE', { id: deleted.id, baseRevision: deleted.revision, operationId: randomUUID() })).status).toBe(200);
  const initial = await (await source.request('/api/preferences')).json() as PreferencesDTO;
  const values = { ...PreferenceValuesSchema.strip().parse(initial), title: '完整备份样本', accentColor: 'purple', avatarMediaId: png.id, background: { mode: 'image', color: '#eeeeee', mediaId: png.id, fit: 'cover', opacity: 0.2 }, reviewTimezone: 'Pacific/Honolulu' };
  expect((await source.request('/api/preferences', 'PATCH', { values, baseRevision: 0, operationId: randomUUID() })).status).toBe(200);
  const style = { stroke: '#112233', fill: 'transparent', strokeWidth: 2, dash: 'solid', opacity: 1, fontSize: 16, textAlign: 'left' };
  const document = { schemaVersion: 1, viewport: { x: 22, y: 33, scale: 0.8 }, memoPositions: [{ memoId: first.id, x: 100, y: 200, z: 2 }], shapes: [{ id: randomUUID(), type: 'image', x: 1, y: 2, width: 40, height: 50, z: 1, style, erasures: [], mediaId: png.id, alt: 'test' }] };
  expect((await source.request('/api/canvas', 'PATCH', { document, baseRevision: 0, operationId: randomUUID() })).status).toBe(200);
  expect((await source.request('/api/review/results', 'POST', { memoId: first.id, day: '2026-10-23', timezone: 'Pacific/Honolulu', result: 'FAIL', baseRevision: 0, operationId: randomUUID() })).status).toBe(200);
  const trackInput = { id: randomUUID(), operationId: randomUUID(), values: { title: 'A song', artist: 'Artist', album: 'Album', source: { kind: 'media', mediaId: wav.id }, coverMediaId: png.id, lyricsMediaId: lyrics.id, lyrics: '[00:01.00]歌词', danmaku: [{ at: 1, text: '弹幕' }], duration: 12 } };
  expect((await source.request('/api/music/tracks', 'POST', trackInput)).status).toBe(200);
  const external = await source.request('/api/music/tracks', 'POST', { ...trackInput, id: randomUUID(), operationId: randomUUID(), values: { ...trackInput.values, title: 'Remote song', source: { kind: 'external', url: 'https://example.org/remote.mp3' } } });
  const remote = await external.json() as TrackDTO;
  const list = await (await source.request('/api/music/tracks')).json() as { revision: number };
  expect((await source.request('/api/music/order', 'PATCH', { ids: [remote.id, trackInput.id], baseRevision: list.revision, operationId: randomUUID() })).status).toBe(200);
  return { source, first, second, deleted, png, wav, lyrics, ...(await source.exported()) };
}

describe('complete new-workspace backup and restore', () => {
  it('round-trips every domain, actual bytes and public references without credentials or old-instance identity', async () => {
    const original = await populated();
    expect(original.value.manifest.counts).toMatchObject({ memos: 2, tombstones: 1, pinned: 2, canvasShapes: 1, reviews: 1, tracks: 2, assets: 4 });
    expect(original.bytes.toString()).not.toContain('A synthetic destination password');
    expect(original.bytes.toString()).not.toContain(original.source.cookie);
    expect(original.value.manifest.unbundledExternalTracks).toHaveLength(1);
    const target = await fixture();
    const response = await target.binary('/api/transfer/restore', original.bytes);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ restored: true, replayed: false, cleanupPending: false, counts: original.value.manifest.counts });
    expect(target.runtime.instanceId).not.toBe(original.source.runtime.instanceId);
    const copy = await target.exported();
    expect(copy.value.entities).toEqual(original.value.entities);
    expect(copy.value.assets).toEqual(original.value.assets);
    for (const asset of original.value.entities.media.assets) expect(digest(readFileSync(path.join(target.runtime.uploadsDir, `${asset.id}.bin`)))).toBe(asset.sha256);
    expect(target.runtime.db.pragma('foreign_key_check')).toEqual([]);
    expect((await target.request(`/api/memos/${original.first.id}`, 'GET', undefined, true)).status).toBe(404);
    expect((await target.request(`/api/memos/${original.second.id}`, 'GET', undefined, true)).status).toBe(200);
    expect((await target.request(`/api/media/${original.png.id}/content`, 'GET', undefined, true)).status).toBe(200);
    expect((await target.request(`/api/media/${original.wav.id}/content`, 'GET', undefined, true)).status).toBe(404);
    expect((await target.request('/api/memos', 'POST', { id: original.deleted.id, operationId: randomUUID(), content: 'Should not resurrect' })).status).toBe(409);
    const repeated = await target.binary('/api/transfer/restore', original.bytes);
    expect(await repeated.json()).toMatchObject({ restored: true, replayed: true, cleanupPending: false });
    expect((await target.exported()).value.entities).toEqual(original.value.entities);
  });

  it('rejects nonempty targets and corrupt/missing/unsafe packages before publishing data or files', async () => {
    const original = await populated();
    const nonempty = await fixture();
    const existing = await nonempty.memo('Keep this note');
    expect((await nonempty.binary('/api/transfer/restore', original.bytes)).status).toBe(409);
    expect(await (await nonempty.request(`/api/memos/${existing.id}`)).json()).toMatchObject({ content: existing.content });
    const reorderedEmpty=await fixture();
    expect((await reorderedEmpty.request('/api/music/order','PATCH',{ids:[],baseRevision:0,operationId:randomUUID()})).status).toBe(200);
    expect(await (await reorderedEmpty.request('/api/transfer/status')).json()).toMatchObject({empty:false});
    expect((await reorderedEmpty.binary('/api/transfer/restore',original.bytes)).status).toBe(409);
    const target = await fixture();
    const changes: ((copy: BackupPackage) => void)[] = [
      (copy) => { copy.manifest.counts.memos += 1; },
      (copy) => { copy.assets.pop(); },
      (copy) => { const asset=copy.entities.media.assets.find((entry)=>entry.id===original.png.id);if(asset)asset.mimeType='audio/wav'; },
      (copy) => { const asset = copy.assets[0]; if (asset) asset.base64 = Buffer.from('corruption').toString('base64'); },
      (copy) => { const reference = copy.entities.media.references[0]; if (reference) reference.isPublic = !reference.isPublic; },
      (copy) => { const asset = copy.entities.media.assets[0]; if (asset) asset.fileName = '../escape'; },
    ];
    for (const change of changes) {
      const copy = structuredClone(original.value); change(copy);
      expect((await target.binary('/api/transfer/restore', Buffer.from(JSON.stringify(copy)))).status).toBe(400);
      expect(await (await target.request('/api/transfer/status')).json()).toMatchObject({ empty: true });
      expect(readdirSync(target.runtime.uploadsDir).filter((name) => name.endsWith('.bin'))).toEqual([]);
    }
    expect((await target.binary('/api/transfer/restore', Buffer.from('PK\u0003\u0004compressed archive'))).status).toBe(400);
    expect((await target.binary('/api/transfer/restore', original.bytes, true)).status).toBe(401);
  });

  it('rolls back a staged-file disk-full failure and a cross-domain precommit failure, then retries successfully', async () => {
    const original = await populated();
    let failure: 'disk' | 'commit' | null = 'disk';
    const target = await fixture((stage, index) => {
      if (failure === 'disk' && stage === 'stage-file' && index === 1) throw Object.assign(new Error('synthetic disk full'), { code: 'ENOSPC' });
      if (failure === 'commit' && stage === 'before-commit') throw new Error('synthetic before commit');
    });
    expect((await target.binary('/api/transfer/restore', original.bytes)).status).toBe(507);
    expect(await (await target.request('/api/transfer/status')).json()).toMatchObject({ empty: true });
    expect(readdirSync(target.runtime.uploadsDir).filter((name) => name.endsWith('.bin'))).toEqual([]);
    failure = 'commit';
    expect((await target.binary('/api/transfer/restore', original.bytes)).status).toBe(500);
    expect(await (await target.request('/api/transfer/status')).json()).toMatchObject({ empty: true });
    expect(target.runtime.db.prepare('SELECT COUNT(*) AS count FROM transfer_batches').get()).toEqual({ count: 0 });
    failure = null;
    expect((await target.binary('/api/transfer/restore', original.bytes)).status).toBe(200);
    expect((await target.exported()).value.entities).toEqual(original.value.entities);
  });

  it('recovers journal-owned hard links after cleanup failure and preserves unknown existing files', async () => {
    const original = await populated();
    let fail = true;
    const target = await fixture((stage) => { if (fail && (stage === 'before-commit' || stage === 'cleanup')) throw new Error('synthetic interrupted cleanup'); });
    expect((await target.binary('/api/transfer/restore', original.bytes)).status).toBe(503);
    expect(await (await target.request('/api/transfer/status')).json()).toMatchObject({ empty: true });
    expect(readdirSync(path.join(target.runtime.uploadsDir, '.restore'))).toHaveLength(1);
    fail = false;
    expect((await target.binary('/api/transfer/restore', original.bytes)).status).toBe(200);
    expect((await target.exported()).value.entities).toEqual(original.value.entities);
    const blocked = await fixture();
    const id = original.value.entities.media.assets[0]?.id;
    if (!id) throw new Error('Missing asset fixture');
    const unknown = path.join(blocked.runtime.uploadsDir, `${id}.bin`);
    writeFileSync(unknown, 'an existing unknown file');
    expect((await blocked.binary('/api/transfer/restore', original.bytes)).status).toBe(409);
    expect(readFileSync(unknown, 'utf8')).toBe('an existing unknown file');
    expect(await (await blocked.request('/api/transfer/status')).json()).toMatchObject({ empty: true });
  });

  it('reports committed restore despite cleanup failure, and idempotently completes cleanup on retry', async () => {
    const original = await populated();
    let fail = true;
    const target = await fixture((stage) => { if (fail && stage === 'cleanup') throw new Error('synthetic cleanup error'); });
    const committed = await target.binary('/api/transfer/restore', original.bytes);
    expect(committed.status).toBe(200);
    expect(await committed.json()).toMatchObject({ restored: true, cleanupPending: true });
    expect((await target.exported()).value.entities).toEqual(original.value.entities);
    fail = false;
    expect(await (await target.binary('/api/transfer/restore', original.bytes)).json()).toMatchObject({ restored: true, replayed: true, cleanupPending: false });
    expect(readdirSync(path.join(target.runtime.uploadsDir, '.restore'))).toHaveLength(0);
  });

  it('recovers an unclean-stop staging state after the fenced lease expires', async () => {
    const original = await populated();
    let time = '2026-10-24T00:00:00.000Z';
    const target = await fixture(undefined, () => time);
    const row = target.runtime.db.prepare('SELECT id FROM identity_sessions WHERE revoked_at IS NULL').get() as { id: string };
    const dependencies: TransferDependencies = { ...target.runtime, principal: { kind: 'owner', id: 'owner', sessionId: row.id } };
    const decoded = parsePackage(original.bytes);
    const lease = startLease(dependencies);
    const pending = await prepareRestoreFiles(decoded.value.manifest.backupId, decoded.sourceDigest, lease, decoded.files, dependencies);
    await stageRestoreFiles(pending, decoded.files, dependencies);
    expect(await (await target.request('/api/transfer/status')).json()).toMatchObject({ empty: true });
    expect((await target.binary('/api/transfer/restore', original.bytes)).status).toBe(409);
    time = '2026-10-24T00:06:00.000Z';
    expect((await target.binary('/api/transfer/restore', original.bytes)).status).toBe(200);
    expect(() => keepLease(dependencies, lease)).toThrow(/no longer owns/);
    expect((await target.exported()).value.entities).toEqual(original.value.entities);
    expect(readdirSync(path.join(target.runtime.uploadsDir, '.restore'))).toHaveLength(0);
  });

  it('rechecks a session revoked during asynchronous staging before any domain can commit', async () => {
    const original = await populated();
    const target = await fixture((stage, index) => { if (stage === 'stage-file' && index === 0) revoke(); });
    const revoke = () => { target.runtime.db.prepare('UPDATE identity_sessions SET revoked_at = ?').run(new Date().toISOString()); };
    expect((await target.binary('/api/transfer/restore', original.bytes)).status).toBe(401);
    expect(target.runtime.db.prepare('SELECT COUNT(*) AS count FROM memos').get()).toEqual({ count: 0 });
    expect(target.runtime.db.prepare('SELECT COUNT(*) AS count FROM media_assets').get()).toEqual({ count: 0 });
    expect(target.runtime.db.prepare('SELECT COUNT(*) AS count FROM transfer_batches').get()).toEqual({ count: 0 });
    expect(readdirSync(target.runtime.uploadsDir).filter((name) => name.endsWith('.bin'))).toEqual([]);
  });

  it('fails complete export on a missing asset or a workspace exceeding the declared entity limit', async () => {
    const original = await populated();
    const assetId = original.value.entities.media.assets[0]?.id;
    if (!assetId) throw new Error('Missing fixture asset');
    rmSync(path.join(original.source.runtime.uploadsDir, `${assetId}.bin`));
    const missing = await original.source.request('/api/transfer/backup');
    expect(missing.status).toBe(503);
    expect(missing.headers.get('content-type')).toContain('application/json');
    const large = await fixture();
    large.runtime.unitOfWork.run(() => {
      const insert = large.runtime.db.prepare('INSERT INTO memos (id, content, is_public, revision, sequence, created_at, updated_at) VALUES (?, ?, 0, 1, ?, ?, ?)');
      for (let index = 1; index <= 5001; index += 1) insert.run(randomUUID(), 'Synthetic bound fixture', index, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z');
    });
    expect((await large.request('/api/transfer/backup')).status).toBe(413);
  });

  it('rejects concurrent restore writers and aborts oversized/interrupted input without a partial workspace', async () => {
    const original = await populated();
    const target = await fixture();
    const responses = await Promise.all([target.binary('/api/transfer/restore', original.bytes), target.binary('/api/transfer/restore', original.bytes)]);
    expect(responses.filter((response) => response.status === 200).length).toBeGreaterThanOrEqual(1);
    expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
    expect((await target.exported()).value.entities).toEqual(original.value.entities);
    await expect(readBounded(Readable.from([Buffer.alloc(8), Buffer.alloc(8)]), 10)).rejects.toMatchObject({ status: 413 });
    const interrupted = await fixture();
    await new Promise<void>((resolve) => {
      const upload = httpRequest(`${interrupted.base}/api/transfer/restore`, { method: 'POST', headers: { Cookie: interrupted.cookie, 'X-Meow-Request': '1', 'Content-Type': 'application/octet-stream', 'Content-Length': original.bytes.length } });
      upload.on('error', () => resolve()); upload.on('close', resolve);
      upload.write(original.bytes.subarray(0, 100)); upload.destroy();
    });
    expect(await (await interrupted.request('/api/transfer/status')).json()).toMatchObject({ empty: true });
    expect(interrupted.runtime.db.prepare('SELECT COUNT(*) AS count FROM transfer_batches').get()).toEqual({ count: 0 });
  });
});

function externalSource(withResource = false): { bytes: Buffer; file: string } {
  const file = path.join(directory(), 'memos.sqlite');
  const source = new Database(file);
  source.exec('CREATE TABLE memo (id INTEGER PRIMARY KEY, content TEXT, created_ts INTEGER, updated_ts INTEGER, payload TEXT, pinned INTEGER, visibility TEXT, row_status TEXT)');
  source.prepare('INSERT INTO memo VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(1, '来源私有 #知识/笔记', 1700000000, 1700000010, JSON.stringify({ tags: ['来源'] }), 1, 'PRIVATE', 'NORMAL');
  source.prepare('INSERT INTO memo VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(2, '来源公开', 1700000010, 1700000020, '{}', 0, 'PUBLIC', 'NORMAL');
  source.prepare('INSERT INTO memo VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(3, '已归档', 1700000020, 1700000020, '{}', 0, 'PRIVATE', 'ARCHIVED');
  if (withResource) {
    source.exec('CREATE TABLE resource (id INTEGER PRIMARY KEY, filename TEXT, type TEXT, size INTEGER); CREATE TABLE memo_resource (memo_id INTEGER, resource_id INTEGER)');
    source.prepare('INSERT INTO resource VALUES (1, ?, ?, ?)').run('one.png', 'image/png', image.length);
    source.exec('INSERT INTO memo_resource VALUES (1, 1), (2, 1)');
  }
  source.close();
  return { bytes: readFileSync(file), file };
}

describe('external Memos consistent-snapshot import', () => {
  it('previews scope, preserves source times/visibility/tags/pins, maps identities and imports a source batch once', async () => {
    const test = await fixture();
    const source = externalSource();
    const previewResponse = await test.binary('/api/transfer/memos/preview?fileName=memos.sqlite', source.bytes);
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json() as MemosPreviewDTO;
    expect(preview).toMatchObject({ memoCount: 2, pinnedCount: 1, publicCount: 1, archivedExcluded: 1, alreadyImported: false });
    const operationId = randomUUID();
    const input = { previewId: preview.previewId, operationId, allowMissingAssets: false, assets: [] };
    const result = await test.request('/api/transfer/memos/import', 'POST', input);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ imported: 2, replayed: false });
    expect(await (await test.request('/api/transfer/memos/import', 'POST', input)).json()).toMatchObject({ imported: 2, replayed: true });
    const listing = await (await test.request('/api/memos')).json() as { items: MemoDTO[]; total: number };
    expect(listing.total).toBe(2);
    const imported = listing.items.find((memo) => memo.isPinned);
    expect(imported).toMatchObject({ content: '来源私有 #知识/笔记', isPublic: false, revision: 1, createdAt: new Date(1700000000 * 1000).toISOString(), updatedAt: new Date(1700000010 * 1000).toISOString() });
    expect(imported?.tags).toEqual(expect.arrayContaining(['来源', '知识/笔记']));
    const repeatedPreview = await (await test.binary('/api/transfer/memos/preview?fileName=memos.sqlite', source.bytes)).json() as MemosPreviewDTO;
    expect(repeatedPreview).toMatchObject({ sourceDigest: preview.sourceDigest, sourceId: preview.sourceId, alreadyImported: true });
    expect(await (await test.request('/api/transfer/memos/import', 'POST', { ...input, previewId: repeatedPreview.previewId, operationId: randomUUID() })).json()).toMatchObject({ imported: 2, replayed: true });
    expect(readFileSync(source.file)).toEqual(source.bytes);
    expect((await test.exported()).value.entities.memos.memos).toHaveLength(2);
  });

  it('requires explicit missing-asset consent or validates supplied files and public shared references', async () => {
    const source = externalSource(true);
    const missing = await fixture();
    const missingPreview = await (await missing.binary('/api/transfer/memos/preview?fileName=memos.sqlite', source.bytes)).json() as MemosPreviewDTO;
    expect(missingPreview.missingAssets).toHaveLength(1);
    const missingInput = { previewId: missingPreview.previewId, operationId: randomUUID(), allowMissingAssets: false, assets: [] };
    expect((await missing.request('/api/transfer/memos/import', 'POST', missingInput)).status).toBe(400);
    expect(await (await missing.request('/api/memos')).json()).toMatchObject({ total: 0 });
    const partial = await missing.request('/api/transfer/memos/import', 'POST', { ...missingInput, allowMissingAssets: true });
    expect(await partial.json()).toMatchObject({ imported: 2, missingAssets: [{ sourceResourceId: '1' }] });
    const supplied = await fixture();
    const preview = await (await supplied.binary('/api/transfer/memos/preview?fileName=memos.sqlite', source.bytes)).json() as MemosPreviewDTO;
    const media = await supplied.upload(image, 'one.png', 'image/png');
    const result = await supplied.request('/api/transfer/memos/import', 'POST', { previewId: preview.previewId, operationId: randomUUID(), allowMissingAssets: false, assets: [{ sourceResourceId: '1', mediaId: media.id }] });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ imported: 2, missingAssets: [] });
    expect((await supplied.request(`/api/media/${media.id}/content`, 'GET', undefined, true)).status).toBe(200);
    const copy = await supplied.exported();
    expect(copy.value.entities.media.references).toHaveLength(2);
    const target = await fixture();
    expect((await target.binary('/api/transfer/restore', copy.bytes)).status).toBe(200);
    expect((await target.exported()).value.entities).toEqual(copy.value.entities);
  });

  it('rejects unknown schemas, standalone WAL/SHM and WAL-mode copies without modifying source bytes', async () => {
    const test = await fixture();
    const unknownFile = path.join(directory(), 'unknown.sqlite');
    const unknown = new Database(unknownFile); unknown.exec('CREATE TABLE memos (id TEXT, content TEXT)'); unknown.close();
    const original = readFileSync(unknownFile);
    expect((await test.binary('/api/transfer/memos/preview?fileName=unknown.sqlite', original)).status).toBe(400);
    expect(readFileSync(unknownFile)).toEqual(original);
    const source = externalSource();
    expect((await test.binary('/api/transfer/memos/preview?fileName=source.db-wal', source.bytes)).status).toBe(400);
    expect((await test.binary('/api/transfer/memos/preview?fileName=source.db-shm', source.bytes)).status).toBe(400);
    const wal = new Database(source.file); wal.pragma('journal_mode = WAL'); wal.close();
    const walBytes = readFileSync(source.file);
    expect((await test.binary('/api/transfer/memos/preview?fileName=source.sqlite', walBytes)).status).toBe(400);
    expect(readFileSync(source.file)).toEqual(walBytes);
  });
});
