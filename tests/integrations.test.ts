import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mediaAssetsMigration } from '../server/services/media/tables/assets/migration.js';
import { mediaReferencesMigration } from '../server/services/media/tables/references/migration.js';
import { createApplication } from '../server/app.js';
import { readConfig } from '../server/system/config.js';
import { memosMigrations } from '../server/services/memos/tables/migrations.js';
import { registerMemosRoutes } from '../server/services/memos/routes/index.js';
import { registerIntegrationRoutes } from '../server/services/integrations/routes/index.js';
import { readIntegrationConfig } from '../server/services/integrations/utils/IntegrationDependencies.js';
import { isPublicAddress, readLimited, resolvePublicTarget, type ExternalRequest, type ExternalResponse } from '../server/system/network/SafeHttp.js';
import { chatDeltas } from '../server/services/integrations/utils/chatStream.js';

const write = { 'X-Meow-Request': '1' };
let directory: string;
let application: ReturnType<typeof createApplication>;
let server: Server;
let origin: string;
let client: ReturnType<typeof request.agent>;
let external: ExternalRequest;
let captures: { url: string; body?: string; authorization?: string }[];
function externalResponse(body: unknown, contentType = 'application/json'): ExternalResponse {
  return { status: 200, headers: { 'content-type': contentType }, body: Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]), url: 'https://93.184.216.34/' };
}

beforeEach(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'meow-integrations-'));
  captures = [];
  external = async (url, options) => { captures.push({ url, body: options?.body, authorization: options?.headers?.Authorization }); return externalResponse({ code: 200, data: [{ id: 123, name: '合成歌曲', artists: [{ name: '测试作者' }] }] }); };
  application = createApplication({
    config: readConfig({ MEOW_DATA_DIR: directory, MEOW_OWNER_PASSWORD: 'synthetic-password-only' }),
    migrations: [...memosMigrations, mediaAssetsMigration, mediaReferencesMigration],
    registerDomains(registry, runtime) {
      registerMemosRoutes(registry, runtime);
      registerIntegrationRoutes(registry, runtime, readIntegrationConfig({ MEOW_AI_BASE_URL: 'https://synthetic.example/v1', MEOW_AI_API_KEY: 'synthetic-server-only-key', MEOW_AI_MODEL: 'configured-test-model' }), (...args) => external(...args));
    },
    logError() {},
  });
  server = createServer(application.app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  origin = `http://127.0.0.1:${address.port}`;
  client = request.agent(server);
  await client.post('/api/session/login').set(write).send({ password: 'synthetic-password-only' }).expect(200);
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); application.close(); rmSync(directory, { recursive: true, force: true }); });

describe('controlled external integrations', () => {
  it('stores imported images once, binds retries to the original URL, and forwards validated quote categories', async () => {
    const bytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
    let requests = 0;
    external = async () => { requests++; return { ...externalResponse('', 'image/png'), body: Readable.from([bytes]) }; };
    const input = { id: randomUUID(), operationId: randomUUID(), url: 'https://synthetic.example/image.png' };
    const imported = await client.post('/api/integrations/images/import').set(write).send(input).expect(200);
    const retry = await client.post('/api/integrations/images/import').set(write).send(input).expect(200);
    expect(retry.body).toEqual(imported.body); expect(requests).toBe(1);
    await client.post('/api/integrations/images/import').set(write).send({ ...input, url: 'https://synthetic.example/different.png' }).expect(409);
    expect(requests).toBe(1);
    external = async (url) => { captures.push({ url }); return externalResponse({ hitokoto: '合成一言', from: '测试' }); };
    await client.get('/api/integrations/hitokoto').query({ types: 'a,b,a' }).expect(200);
    expect(new URL(captures[0]?.url ?? '').searchParams.getAll('c')).toEqual(['a', 'b']);
    await client.get('/api/integrations/hitokoto').query({ types: 'private-endpoint' }).expect(400);
  });

  it('exposes configuration status without keys and denies private integration operations to guests', async () => {
    const response = await client.get('/api/integrations/status').expect(200);
    expect(response.body.aiConfigured).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('synthetic-server-only-key');
    expect(JSON.stringify(response.body)).not.toContain('synthetic.example');
    await request(server).get('/api/integrations/status').expect(401);
    await request(server).post('/api/integrations/chat').set(write).send({ mode: 'chat', prompt: 'private' }).expect(401);
  });

  it('normalizes music searches and isolates malformed or failing external responses', async () => {
    const result = await client.get('/api/integrations/music/search').query({ query: '中文歌曲', limit: 1 }).expect(200);
    expect(result.body.items[0]).toMatchObject({ sourceId: '123', title: '合成歌曲', artist: '测试作者' });
    expect(new URL(captures[0]?.url ?? '').searchParams.get('name')).toBe('中文歌曲');
    external = async () => externalResponse({ code: 200, data: 'invalid-array' });
    await client.get('/api/integrations/music/search').query({ query: 'bad' }).expect(502);
    external = async () => ({ ...externalResponse('private upstream diagnostic'), status: 500 });
    const failed = await client.get('/api/integrations/music/search').query({ query: 'bad' }).expect(502);
    expect(JSON.stringify(failed.body)).not.toContain('upstream diagnostic');
    await client.get('/api/memos').expect(200);
  });

  it('streams normalized AI deltas, keeps credentials server-side, and includes only selected authorized notes', async () => {
    const note = await client.post('/api/memos').set(write).send({ id: randomUUID(), operationId: randomUUID(), content: '明确选中的私密资料' }).expect(200);
    external = async (url, options) => {
      captures.push({ url, body: options?.body, authorization: options?.headers?.Authorization });
      const bytes = Buffer.from('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: {"choices":[{"delta":{"content":"，世界"}}]}\n\ndata: [DONE]\n\n');
      return { ...externalResponse('', 'text/event-stream'), body: Readable.from([bytes.subarray(0, 43), bytes.subarray(43, 44), bytes.subarray(44)]) };
    };
    const result = await client.post('/api/integrations/chat').set(write).send({ mode: 'chat', prompt: '总结', contextMemoIds: [note.body.id] }).expect(200);
    expect(result.text).toContain('"delta":"你好"');
    expect(result.text).toContain('"delta":"，世界"');
    expect(result.text).toContain('"done":true');
    expect(result.text).not.toContain('synthetic-server-only-key');
    expect(captures[0]?.authorization).toBe('Bearer synthetic-server-only-key');
    expect(captures[0]?.body).toContain('明确选中的私密资料');
    const calls = captures.length;
    await client.post('/api/integrations/chat').set(write).send({ mode: 'chat', prompt: 'bad', contextMemoIds: [randomUUID()] }).expect(404);
    expect(captures.length).toBe(calls);
  });

  it('aborts upstream work when the browser cancels a streaming response', async () => {
    let cancelled: (() => void) | undefined;
    const upstreamCancelled = new Promise<void>((resolve) => { cancelled = resolve; });
    external = async (_url, options) => {
      const body = new Readable({ read() {} });
      options?.signal?.addEventListener('abort', () => { body.destroy(); cancelled?.(); }, { once: true });
      body.push('data: {"choices":[{"delta":{"content":"开始"}}]}\n\n');
      return { ...externalResponse('', 'text/event-stream'), body };
    };
    const cookie = (await request(server).post('/api/session/login').set(write).send({ password: 'synthetic-password-only' })).headers['set-cookie']?.[0];
    if (!cookie) throw new Error('Missing synthetic session');
    const controller = new AbortController();
    const response = await fetch(`${origin}/api/integrations/chat`, { method: 'POST', signal: controller.signal, headers: { ...write, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ mode: 'chat', prompt: 'cancel' }) });
    const reader = response.body?.getReader();
    expect((await reader?.read())?.done).toBe(false);
    controller.abort();
    await upstreamCancelled;
    await reader?.cancel().catch(() => undefined);
  });
});

describe('external network and stream boundaries', () => {
  it('rejects private/reserved addresses including encoded IPv4 and mapped IPv6, and rejects mixed DNS answers', async () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', '2001:db8::1']) expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress('93.184.216.34')).toBe(true);
    for (const url of ['https://2130706433/', 'https://[::1]/', 'http://example.com/', 'https://user:password@example.com/']) await expect(resolvePublicTarget(url)).rejects.toThrow();
    await expect(resolvePublicTarget('https://example.com/', async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }])).rejects.toThrow();
    const resolved = await resolvePublicTarget('https://example.com/path', async () => [{ address: '93.184.216.34', family: 4 }]);
    expect(resolved.address).toBe('93.184.216.34');
    expect(resolved.hostname).toBe('example.com');
  });

  it('bounds external content and rejects broken SSE without reporting successful completion', async () => {
    await expect(readLimited(externalResponse('too large'), 3)).rejects.toThrow();
    const stream = Readable.from(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']);
    const iterator = chatDeltas(stream);
    expect((await iterator.next()).value).toBe('partial');
    await expect(iterator.next()).rejects.toThrow('中断');
    expect(stream.destroyed).toBe(true);
  });
});
