import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApplication } from '../server/app.js';
import { readConfig } from '../server/system/config.js';
import { memosMigrations } from '../server/services/memos/tables/migrations.js';
import { registerMemosRoutes } from '../server/services/memos/routes/index.js';
import { MemoSchema, GetMemoChangesOutputSchema, CreateMemoInputSchema } from '../shared/contracts/memos/index.js';
import { plan as createMemo } from '../server/services/memos/api/CreateMemoAPIMessage.js';
import type { MemoDependencies } from '../server/services/memos/utils/MemoDependencies.js';

let directory: string;
let application: ReturnType<typeof createApplication>;
let client: ReturnType<typeof request.agent>;
let failChange = false;
const write = { 'X-Meow-Request': '1' };
function memoInput(content = '合成笔记 #课程/工程') { return { id: randomUUID(),operationId: randomUUID(),content }; }

beforeEach(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(),'meow-memos-test-'));
  failChange = false;
  application = createApplication({
    config: readConfig({ MEOW_DATA_DIR: directory,MEOW_OWNER_PASSWORD: 'synthetic-password-only' }),
    migrations: memosMigrations,
    registerDomains: (registry,runtime) => registerMemosRoutes(registry,runtime,{ onMemoChanged() { if (failChange) throw new Error('synthetic injected failure'); } }),
    logError() {},
  });
  client = request.agent(application.app);
  await client.post('/api/session/login').set(write).send({ password: 'synthetic-password-only' }).expect(200);
});
afterEach(() => { application.close(); rmSync(directory,{ recursive: true,force: true }); });

async function create(content?: string, extras: Record<string,unknown> = {}) {
  const input = { ...memoInput(content),...extras };
  const response = await client.post('/api/memos').set(write).send(input).expect(200);
  return { input,memo: MemoSchema.parse(response.body) };
}

describe('memos HTTP contracts and isolated SQLite work units',() => {
  it('creates one canonical memo with normalized hierarchical tags, explicit pin state and pagination',async () => {
    const { memo } = await create('中文内容 #课程/工程',{ tags: ['手动','手动'],isPinned: true });
    expect(memo.tags).toEqual(['手动','课程/工程']);
    expect(memo.revision).toBe(1);
    expect(memo.isPinned).toBe(true);
    expect(Object.keys(memo)).not.toContain('sequence');
    await create('第二条');
    const first = await client.get('/api/memos?limit=1').expect(200);
    expect(first.body.items[0].id).toBe(memo.id);
    expect(first.body.total).toBe(2);
    expect(first.body.nextOffset).toBe(1);
    const second = await client.get('/api/memos?limit=1&offset=1').expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextOffset).toBeNull();
    const filtered = await client.get('/api/memos').query({ tag: '课程' }).expect(200);
    expect(filtered.body.items.map((value: { id: string }) => value.id)).toEqual([memo.id]);
  });

  it('uses stable operation IDs for all writes and rejects a changed payload reusing an ID',async () => {
    const input = memoInput();
    const first = await client.post('/api/memos').set(write).send(input).expect(200);
    const duplicate = await client.post('/api/memos').set(write).send(input).expect(200);
    expect(duplicate.body).toEqual(first.body);
    await client.post('/api/memos').set(write).send({ ...input,content: '不同内容' }).expect(409);
    expect((await client.get('/api/memos')).body.total).toBe(1);
    const update = { operationId: randomUUID(),baseRevision: 1,content: '已编辑' };
    const saved = await client.patch(`/api/memos/${input.id}`).set(write).send(update).expect(200);
    const replay = await client.patch(`/api/memos/${input.id}`).set(write).send(update).expect(200);
    expect(replay.body).toEqual(saved.body);
    expect(saved.body.revision).toBe(2);
  });

  it('rejects stale clients with the current validated memo instead of overwriting content',async () => {
    const { memo } = await create();
    await client.patch(`/api/memos/${memo.id}`).set(write).send({ operationId: randomUUID(),baseRevision: 1,content: '客户端 A' }).expect(200);
    const conflict = await client.patch(`/api/memos/${memo.id}`).set(write).send({ operationId: randomUUID(),baseRevision: 1,content: '客户端 B' }).expect(409);
    expect(conflict.body.error.code).toBe('REVISION_CONFLICT');
    expect(MemoSchema.parse(conflict.body.error.details.current).content).toBe('客户端 A');
    expect((await client.get(`/api/memos/${memo.id}`)).body.content).toBe('客户端 A');
  });

  it('does not expose private notes, private backlink IDs, private tag counts or owner feeds to anonymous readers',async () => {
    const hidden = await create('私密独有标签 #秘密',{ isPublic: false });
    const visible = await create('公开内容 #公开',{ isPublic: true,links: [hidden.memo.id] });
    await create('指向公开的私密内容',{ links: [visible.memo.id] });
    const publicTarget = await create('公开双链目标',{ isPublic: true,links: [visible.memo.id] });
    const anonymous = request(application.app);
    const list = await anonymous.get('/api/memos').expect(200);
    expect(list.body.total).toBe(2);
    const projected = list.body.items.find((value: { id: string }) => value.id === visible.memo.id);
    expect(projected.links).toEqual([]);
    expect(projected.backlinks).toEqual([publicTarget.memo.id]);
    expect(JSON.stringify(list.body)).not.toContain(hidden.memo.id);
    await anonymous.get(`/api/memos/${hidden.memo.id}`).expect(404);
    expect((await anonymous.get('/api/memos').query({ tag: '秘密' })).body.total).toBe(0);
    await anonymous.get('/api/memos/changes').expect(401);
    await anonymous.post('/api/memos').set(write).send(memoInput()).expect(401);
    await anonymous.patch(`/api/memos/${visible.memo.id}/pin`).set(write).send({ operationId: randomUUID(),baseRevision: 1,isPinned: true }).expect(401);
  });

  it('updates graph projections and removes references/pins atomically on deletion',async () => {
    const target = await create('双链目标',{ isPinned: true });
    const source = await create('来源',{ links: [target.memo.id],tags: ['唯一标签'] });
    expect((await client.get(`/api/memos/${target.memo.id}`)).body.backlinks).toEqual([source.memo.id]);
    const response = await client.delete(`/api/memos/${target.memo.id}`).set(write).send({ operationId: randomUUID(),baseRevision: 1 }).expect(200);
    expect(response.body.revision).toBe(2);
    expect((await client.get(`/api/memos/${source.memo.id}`)).body.links).toEqual([]);
    expect(application.runtime.db.prepare('SELECT COUNT(*) AS count FROM memo_pins').get()).toEqual({ count: 0 });
    expect(application.runtime.db.prepare('SELECT COUNT(*) AS count FROM memo_links').get()).toEqual({ count: 0 });
  });

  it('retains delete intent and prevents stale updates and new operations from resurrecting deleted IDs',async () => {
    const { memo } = await create();
    const deletion = { operationId: randomUUID(),baseRevision: 1 };
    const removed = await client.delete(`/api/memos/${memo.id}`).set(write).send(deletion).expect(200);
    expect((await client.delete(`/api/memos/${memo.id}`).set(write).send(deletion).expect(200)).body).toEqual(removed.body);
    const edit = await client.patch(`/api/memos/${memo.id}`).set(write).send({ operationId: randomUUID(),baseRevision: 1,content: '离线旧内容' }).expect(409);
    expect(edit.body.error.details).toEqual({ current: null,deleted: true });
    await client.post('/api/memos').set(write).send({ ...memoInput(),id: memo.id }).expect(409);
    const feed = GetMemoChangesOutputSchema.parse((await client.get('/api/memos/changes')).body);
    expect(feed.changes).toEqual([{ kind: 'deleted',sequence: 2,tombstone: removed.body }]);
  });

  it('rolls back memo/tag/link/pin/operation/sequence writes when a later domain step fails',async () => {
    const target = await create('原有目标');
    const beforeSequence = application.runtime.db.prepare('SELECT value FROM memo_sequence').get();
    failChange = true;
    const input = { ...memoInput('失败内容'),tags: ['不能留下'],links: [target.memo.id],isPinned: true,attachments: [{ mediaId: randomUUID(),kind: 'audio' }] };
    const result = await client.post('/api/memos').set(write).send(input).expect(500);
    expect(JSON.stringify(result.body)).not.toContain('synthetic');
    expect(application.runtime.db.prepare('SELECT COUNT(*) AS count FROM memos').get()).toEqual({ count: 1 });
    for (const table of ['tags','memo_tags','memo_links','memo_pins','memo_attachments']) expect(application.runtime.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
    expect(application.runtime.db.prepare('SELECT value FROM memo_sequence').get()).toEqual(beforeSequence);
    expect(application.runtime.db.prepare('SELECT COUNT(*) AS count FROM memo_operations').get()).toEqual({ count: 1 });
    failChange = false;
    await client.post('/api/memos').set(write).send(input).expect(200);
  });

  it('rejects malformed DTOs, invalid dates, old fields, oversized pages and unresolved/self links',async () => {
    await client.post('/api/memos').set(write).send({ ...memoInput(),tags: '[]' }).expect(400);
    await client.post('/api/memos').set(write).send({ ...memoInput(),memo_id: 'old-field' }).expect(400);
    await client.post('/api/memos').set(write).send({ ...memoInput(),isPublic: 'false' }).expect(400);
    await client.post('/api/memos').set(write).send({ ...memoInput(),links: [randomUUID()] }).expect(400);
    const self = memoInput();
    await client.post('/api/memos').set(write).send({ ...self,links: [self.id] }).expect(400);
    await client.get('/api/memos?limit=101').expect(400);
    await client.get('/api/memos?from=2026-02-30').expect(400);
    await client.get('/api/memos?from=2026-10-24&to=2026-10-01').expect(400);
    expect((await client.get('/api/memos')).body.total).toBe(0);
  });

  it('paginates all updates/tombstones without dropping changes and refreshes backlink projections',async () => {
    const principal: MemoDependencies['principal'] = { kind: 'owner',id: 'owner',sessionId: randomUUID() };
    const values = Array.from({ length: 105 },(_,index) => CreateMemoInputSchema.parse(memoInput(`合成 ${index}`)));
    application.runtime.unitOfWork.run(() => {
      for (const value of values) createMemo(value,{ ...application.runtime,principal });
    });
    const first = GetMemoChangesOutputSchema.parse((await client.get('/api/memos/changes?limit=100')).body);
    expect(first.changes).toHaveLength(100);
    expect(first.hasMore).toBe(true);
    const second = GetMemoChangesOutputSchema.parse((await client.get('/api/memos/changes').query({ since: first.nextCursor,limit: 100 })).body);
    expect(second.changes).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect(new Set([...first.changes,...second.changes].map((change) => change.sequence)).size).toBe(105);
    const target = values[0];
    if (!target) throw new Error('Missing synthetic target');
    const linked = await create('新增反链',{ links: [target.id] });
    const changed = GetMemoChangesOutputSchema.parse((await client.get('/api/memos/changes').query({ since: second.nextCursor })).body);
    const targetChange = changed.changes.find((change) => change.kind === 'updated' && change.memo.id === target.id);
    expect(targetChange?.kind === 'updated' && targetChange.memo.backlinks).toEqual([linked.memo.id]);
  });

  it('uses one revision for pin/visibility and treats search percent/underscore as literal text',async () => {
    const { memo } = await create('100% _ 内容');
    await client.patch(`/api/memos/${memo.id}/pin`).set(write).send({ operationId: randomUUID(),baseRevision: 1,isPinned: true }).expect(200);
    const publicMemo = await client.patch(`/api/memos/${memo.id}/visibility`).set(write).send({ operationId: randomUUID(),baseRevision: 2,isPublic: true }).expect(200);
    expect(publicMemo.body.revision).toBe(3);
    expect(publicMemo.body.isPinned).toBe(true);
    expect((await request(application.app).get('/api/memos')).body.total).toBe(1);
    expect((await client.get('/api/memos').query({ search: '%' })).body.total).toBe(1);
    expect((await client.get('/api/memos').query({ search: '%x' })).body.total).toBe(0);
  });
});
