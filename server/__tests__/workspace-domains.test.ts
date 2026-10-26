import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { PreferenceValuesSchema, type PreferencesDTO } from '../../shared/contracts/preferences/index.js';
import type { TrackValues } from '../../shared/contracts/music/index.js';
import type { MemoDTO } from '../../shared/contracts/memos/index.js';
import { createApplication } from '../app.js';
import { readConfig } from '../system/config.js';
import { AppError } from '../system/errors/AppError.js';
import { memosMigrations } from '../services/memos/tables/migrations.js';
import { registerMemosRoutes } from '../services/memos/routes/index.js';
import { preferencesMigrations } from '../services/preferences/tables/preferences/migration.js';
import { registerPreferencesRoutes } from '../services/preferences/routes/index.js';
import { reviewMigrations } from '../services/review/tables/results/migration.js';
import { registerReviewRoutes } from '../services/review/routes/index.js';
import { plan as removeReviews } from '../services/review/api/RemoveMemoReferencesAPIMessage.js';
import { musicMigrations } from '../services/music/tables/tracks/migration.js';
import { registerMusicRoutes } from '../services/music/routes/index.js';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function fixture(options: { failPreferences?: boolean; failMusic?: boolean } = {}) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'meow-domains-test-'));
  cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
  const password = 'another synthetic password';
  const application = createApplication({
    config: readConfig({ MEOW_DATA_DIR: dataDir, MEOW_OWNER_PASSWORD: password }),
    logError: () => {},
    migrations: [...memosMigrations, ...preferencesMigrations, ...reviewMigrations, ...musicMigrations],
    registerDomains(registry, runtime) {
      registerMemosRoutes(registry, runtime, { onMemoChanged(before, after) {
        if (before && !after) removeReviews({ memoId: before.id }, { ...runtime, principal: { kind: 'owner', id: 'owner', sessionId: 'trusted-workspace' } });
      } });
      registerPreferencesRoutes(registry, runtime, { onChanged() { if (options.failPreferences) throw new AppError(400, 'INVALID_MEDIA_REFERENCE', 'Invalid media reference.'); } });
      registerReviewRoutes(registry, runtime);
      registerMusicRoutes(registry, runtime, { onChanged() { if (options.failMusic) throw new AppError(400, 'INVALID_MEDIA_REFERENCE', 'Invalid media reference.'); } });
    },
  });
  const server = createServer(application.app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); application.close(); });
  const base = `http://127.0.0.1:${address.port}`;
  const authenticated = await fetch(`${base}/api/session/login`, { method: 'POST', headers: { 'X-Meow-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  const cookie = authenticated.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Login failed');
  const request = (url: string, method = 'GET', body?: unknown, owner = true) => fetch(`${base}${url}`, { method, headers: { 'X-Meow-Request': '1', 'Content-Type': 'application/json', ...(owner ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  async function createMemo(content = 'Review sample'): Promise<MemoDTO> {
    const result = await request('/api/memos', 'POST', { id: randomUUID(), operationId: randomUUID(), content });
    if (!result.ok) throw new Error(await result.text());
    return await result.json() as MemoDTO;
  }
  return { ...application, request, createMemo };
}

function trackValues(title: string): TrackValues {
  return { title, artist: 'Artist', album: 'Album', source: { kind: 'external', url: 'https://example.org/sample.mp3' }, coverMediaId: null, lyricsMediaId: null, lyrics: '[00:01.00]A lyric', danmaku: [{ at: 1, text: 'A comment' }], duration: 12 };
}

describe('workspace preferences', () => {
  it('distinguishes owner preferences from the explicit anonymous appearance projection', async () => {
    const test = await fixture();
    expect((await test.request('/api/preferences', 'GET', undefined, false)).status).toBe(401);
    const initial = await (await test.request('/api/preferences')).json() as PreferencesDTO;
    expect(initial.revision).toBe(0);
    const values = PreferenceValuesSchema.strip().parse(initial);
    const input = { values: { ...values, title: 'A workspace', reviewTimezone: 'Pacific/Honolulu' }, baseRevision: 0, operationId: randomUUID() };
    const saved = await test.request('/api/preferences', 'PATCH', input);
    expect(saved.status).toBe(200);
    expect((await saved.json() as PreferencesDTO).revision).toBe(1);
    const publicAppearance = await (await test.request('/api/preferences/public', 'GET', undefined, false)).json();
    expect(publicAppearance).toMatchObject({ title: 'A workspace', revision: 1 });
    expect(publicAppearance).not.toHaveProperty('reviewTimezone');
    expect(publicAppearance).not.toHaveProperty('password');
    expect((await test.request('/api/preferences', 'PATCH', input)).status).toBe(200);
    const conflict = await test.request('/api/preferences', 'PATCH', { ...input, operationId: randomUUID() });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: 'PREFERENCES_CONFLICT', details: { current: { revision: 1 } } } });
    expect((await test.request('/api/preferences', 'PATCH', { ...input, values: { ...input.values, aiKey: 'must-reject' }, operationId: randomUUID() })).status).toBe(400);
  });

  it('rolls back preferences and the idempotency receipt when linked-media validation fails', async () => {
    const test = await fixture({ failPreferences: true });
    const current = await (await test.request('/api/preferences')).json() as PreferencesDTO;
    const values = PreferenceValuesSchema.strip().parse(current);
    expect((await test.request('/api/preferences', 'PATCH', { values, baseRevision: current.revision, operationId: randomUUID() })).status).toBe(400);
    expect(await (await test.request('/api/preferences')).json()).toMatchObject({ revision: 0 });
    expect(test.runtime.db.prepare('SELECT COUNT(*) AS count FROM preferences_operations').get()).toEqual({ count: 0 });
  });
});

describe('daily review', () => {
  it('uses declared timezone dates, validates dates/zones, and keeps PASS/FAIL/reset revisions', async () => {
    const test = await fixture();
    const memo = await test.createMemo();
    const input = { memoId: memo.id, day: '2026-10-24', timezone: 'Asia/Shanghai', result: 'PASS', baseRevision: 0, operationId: randomUUID() };
    const saved = await test.request('/api/review/results', 'POST', input);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ result: 'PASS', revision: 1 });
    expect((await test.request('/api/review/results', 'POST', input)).status).toBe(200);
    const conflict = await test.request('/api/review/results', 'POST', { ...input, result: 'FAIL', operationId: randomUUID() });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: 'REVIEW_CONFLICT', details: { current: { result: 'PASS' } } } });
    expect((await test.request('/api/review/results', 'POST', { ...input, day: '2026-02-30', operationId: randomUUID() })).status).toBe(400);
    expect((await test.request('/api/review/results', 'POST', { ...input, timezone: 'NOT-A-ZONE', operationId: randomUUID() })).status).toBe(400);
    const identity = { memoId: input.memoId, day: input.day, timezone: input.timezone, baseRevision: input.baseRevision, operationId: input.operationId };
    const reset = await test.request('/api/review/results', 'DELETE', { ...identity, baseRevision: 1, operationId: randomUUID() });
    expect(await reset.json()).toMatchObject({ result: null, revision: 2 });
    const listing = await test.request('/api/review/results?timezone=Asia%2FShanghai&day=2026-10-24');
    expect(await listing.json()).toMatchObject({ total: 1, items: [{ revision: 2, result: null }] });
  });

  it('resets a date group atomically, preserves receipts on retry, and rolls all entries back on conflict', async () => {
    const test=await fixture(); const first=await test.createMemo('first'), second=await test.createMemo('second');
    const base={day:'2026-10-24',timezone:'UTC'};
    await test.request('/api/review/results','POST',{...base,memoId:second.id,baseRevision:0,operationId:randomUUID(),result:'PASS'});
    const failed={...base,entries:[{memoId:first.id,baseRevision:0,operationId:randomUUID()},{memoId:second.id,baseRevision:0,operationId:randomUUID()}]};
    expect((await test.request('/api/review/reset-group','POST',failed)).status).toBe(409);
    expect(await (await test.request('/api/review/results?timezone=UTC')).json()).toMatchObject({total:1,items:[{memoId:second.id,result:'PASS',revision:1}]});
    expect(test.runtime.db.prepare('SELECT COUNT(*) AS count FROM review_operations').get()).toEqual({count:1});
    const input={...failed,entries:[failed.entries[0],{...failed.entries[1],baseRevision:1}]};
    const saved=await test.request('/api/review/reset-group','POST',input); expect(saved.status).toBe(200);
    const body=await saved.json();expect(body).toMatchObject({items:[{memoId:first.id,result:'FAIL',revision:1},{memoId:second.id,result:'FAIL',revision:2}]});
    expect(await (await test.request('/api/review/reset-group','POST',input)).json()).toEqual(body);
    expect((await test.request('/api/review/reset-group','POST',input,false)).status).toBe(401);
  });

  it('rejects anonymous/nonexistent memo results and removes memo references in one shared transaction', async () => {
    const test = await fixture();
    const memo = await test.createMemo();
    const input = { memoId: memo.id, day: '2026-10-24', timezone: 'UTC', result: 'FAIL', baseRevision: 0, operationId: randomUUID() };
    expect((await test.request('/api/review/results', 'POST', input, false)).status).toBe(401);
    expect((await test.request('/api/review/results', 'POST', { ...input, memoId: randomUUID() })).status).toBe(404);
    expect((await test.request('/api/review/results', 'POST', input)).status).toBe(200);
    expect((await test.request(`/api/memos/${memo.id}`, 'DELETE', { id: memo.id, operationId: randomUUID(), baseRevision: memo.revision })).status).toBe(200);
    expect(await (await test.request('/api/review/results?timezone=UTC')).json()).toMatchObject({ total: 0, items: [] });
    expect(test.runtime.db.pragma('foreign_key_check')).toEqual([]);
    expect((await test.request('/api/review/results', 'POST', input)).status).toBe(404);
  });
});

describe('music metadata ownership, order, revisions, and references', () => {
  it('persists tracks and order, protects revisions, and never includes player device state', async () => {
    const test = await fixture();
    expect((await test.request('/api/music/tracks', 'GET', undefined, false)).status).toBe(401);
    const firstId = randomUUID();
    const secondId = randomUUID();
    const first = { id: firstId, operationId: randomUUID(), values: trackValues('First') };
    expect((await test.request('/api/music/tracks', 'POST', first)).status).toBe(200);
    expect((await test.request('/api/music/tracks', 'POST', first)).status).toBe(200);
    expect((await test.request('/api/music/tracks', 'POST', { id: secondId, operationId: randomUUID(), values: trackValues('Second') })).status).toBe(200);
    const initial = await (await test.request('/api/music/tracks')).json() as { revision: number; items: { id: string }[] };
    expect(initial.items.map((item) => item.id)).toEqual([firstId, secondId]);
    const order = { ids: [secondId, firstId], baseRevision: initial.revision, operationId: randomUUID() };
    expect((await test.request('/api/music/order', 'PATCH', order)).status).toBe(200);
    expect((await test.request('/api/music/order', 'PATCH', order)).status).toBe(200);
    expect((await test.request('/api/music/order', 'PATCH', { ...order, operationId: randomUUID() })).status).toBe(409);
    const ordered = await (await test.request('/api/music/tracks')).json() as { revision: number; items: { id: string }[] };
    expect(ordered.items.map((item) => item.id)).toEqual([secondId, firstId]);
    expect((await test.request('/api/music/order', 'PATCH', { ids: [firstId, firstId], baseRevision: ordered.revision, operationId: randomUUID() })).status).toBe(400);
    const updated = await test.request(`/api/music/tracks/${firstId}`, 'PATCH', { id: firstId, operationId: randomUUID(), baseRevision: 1, values: trackValues('Changed') });
    expect(await updated.json()).toMatchObject({ title: 'Changed', revision: 2 });
    expect((await test.request(`/api/music/tracks/${firstId}`, 'PATCH', { id: firstId, operationId: randomUUID(), baseRevision: 1, values: trackValues('Conflict') })).status).toBe(409);
    expect((await test.request('/api/music/tracks', 'POST', { id: randomUUID(), operationId: randomUUID(), values: { ...trackValues('Forbidden device field'), volume: 0.5 } })).status).toBe(400);
    const deletion = { id: firstId, baseRevision: 2, operationId: randomUUID() };
    expect((await test.request(`/api/music/tracks/${firstId}`, 'DELETE', deletion)).status).toBe(200);
    expect((await test.request(`/api/music/tracks/${firstId}`, 'DELETE', deletion)).status).toBe(200);
    expect((await test.request('/api/music/tracks', 'POST', { ...first, operationId: randomUUID() })).status).toBe(409);
    expect(await (await test.request('/api/music/tracks')).json()).toMatchObject({ total: 1 });
  });

  it('rolls back track/library/receipt together when linked-media reconciliation rejects', async () => {
    const test = await fixture({ failMusic: true });
    const input = { id: randomUUID(), operationId: randomUUID(), values: trackValues('Rollback') };
    expect((await test.request('/api/music/tracks', 'POST', input)).status).toBe(400);
    expect(await (await test.request('/api/music/tracks')).json()).toMatchObject({ total: 0, revision: 0 });
    expect(test.runtime.db.prepare('SELECT COUNT(*) AS count FROM music_operations').get()).toEqual({ count: 0 });
  });
});
