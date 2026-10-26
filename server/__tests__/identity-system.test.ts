import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineContract } from '../../shared/contracts/api.js';
import { SessionSchema } from '../../shared/contracts/identity/index.js';
import { createApplication, type ApplicationOptions } from '../app.js';
import { openDatabase } from '../system/database/openDatabase.js';
import { readConfig } from '../system/config.js';
import { AppError } from '../system/errors/AppError.js';

const password = 'a synthetic owner password';
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function temporaryDir() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'meow-system-test-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

async function fixture(overrides: ApplicationOptions = {}) {
  const config = readConfig({ MEOW_DATA_DIR: temporaryDir(), MEOW_OWNER_PASSWORD: password });
  const application = createApplication({ config, logError: () => {}, ...overrides });
  const server: Server = createServer(application.app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    application.close();
  });
  const base = `http://127.0.0.1:${address.port}`;
  const request = (url: string, options?: RequestInit) => fetch(`${base}${url}`, options);
  const login = async () => {
    const response = await request('/api/session/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Meow-Request': '1' }, body: JSON.stringify({ password }) });
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) throw new Error('Missing session cookie');
    return { response, cookie: setCookie.split(';')[0] || '', setCookie };
  };
  return { ...application, request, login, base };
}

const ownerContract = defineContract('POST', '/api/test/owner', z.object({}).strict(), z.object({ accepted: z.literal(true) }).strict());

describe('new identity and HTTP trust boundaries', () => {
  it('provides anonymous session metadata and rejects direct owner calls without credentials', async () => {
    const test = await fixture({ registerDomains(registry) { registry.register({ contract: ownerContract, access: 'owner', handler: () => ({ accepted: true as const }) }); } });
    expect(SessionSchema.parse(await (await test.request('/api/session')).json())).toMatchObject({ authenticated: false, principal: 'anonymous' });
    const rejected = await test.request('/api/test/owner', { method: 'POST', headers: { 'X-Meow-Request': '1' } });
    expect(rejected.status).toBe(401);
  });

  it('authenticates only with a server session; stores hashes, rotates login, and revokes logout', async () => {
    const test = await fixture();
    const first = await test.login();
    expect(first.response.status).toBe(200);
    expect(first.setCookie).toContain('HttpOnly');
    expect(first.setCookie).toContain('SameSite=Strict');
    expect(first.setCookie).toContain('Path=/api');
    expect(SessionSchema.parse(await first.response.json()).principal).toBe('owner');
    expect(SessionSchema.parse(await (await test.request('/api/session', { headers: { Cookie: first.cookie } })).json()).authenticated).toBe(true);
    const rows = test.runtime.db.prepare('SELECT token_hash FROM identity_sessions').all();
    expect(JSON.stringify(rows)).not.toContain(first.cookie.split('=')[1]);
    expect(JSON.stringify(test.runtime.config)).not.toContain(password);
    const logout = await test.request('/api/session/logout', { method: 'POST', headers: { Cookie: first.cookie, 'X-Meow-Request': '1' } });
    expect(logout.status).toBe(200);
    expect(SessionSchema.parse(await (await test.request('/api/session', { headers: { Cookie: first.cookie } })).json()).principal).toBe('anonymous');
    expect(JSON.stringify(test.runtime.db.prepare('SELECT password_hash FROM identity_credentials').get())).not.toContain(password);
  });

  it('expires sessions and never turns an identity lookup failure into authentication', async () => {
    let time = '2026-10-24T00:00:00.000Z';
    const test = await fixture({ now: () => time });
    const { cookie } = await test.login();
    time = '2026-11-24T00:00:00.000Z';
    expect(SessionSchema.parse(await (await test.request('/api/session', { headers: { Cookie: cookie } })).json()).authenticated).toBe(false);
    test.runtime.db.exec('DROP TABLE identity_sessions');
    const failure = await test.request('/api/session', { headers: { Cookie: cookie } });
    expect(failure.status).toBe(500);
    expect(await failure.text()).not.toMatch(/SQLITE|identity_sessions|stack/);
  });

  it('rejects missing request verification and foreign Origin, and limits failed logins', async () => {
    const test = await fixture();
    expect((await test.request('/api/session/login', { method: 'POST' })).status).toBe(403);
    expect((await test.request('/api/session/login', { method: 'POST', headers: { 'X-Meow-Request': '1', Origin: 'https://attacker.example' } })).status).toBe(403);
    for (let count = 0; count < 5; count += 1) {
      expect((await test.request('/api/session/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Meow-Request': '1' }, body: JSON.stringify({ password: 'incorrect' }) })).status).toBe(401);
    }
    expect((await test.request('/api/session/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Meow-Request': '1' }, body: JSON.stringify({ password }) })).status).toBe(429);
  });

  it('has no implicit owner when password is absent and uses Secure cookies in production', async () => {
    const anonymousConfig = readConfig({ MEOW_DATA_DIR: temporaryDir() });
    const anonymousTest = await fixture({ config: anonymousConfig });
    const failed = await anonymousTest.request('/api/session/login', { method: 'POST', headers: { 'X-Meow-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    expect(failed.status).toBe(401);
    const production = await fixture({ config: readConfig({ NODE_ENV: 'production', MEOW_DATA_DIR: temporaryDir(), MEOW_OWNER_PASSWORD: password }) });
    expect((await production.login()).setCookie).toContain('Secure');
  });

  it('validates malformed JSON, payload limits, strict contracts and generic internal errors', async () => {
    const test = await fixture({ registerDomains(registry) { registry.register({ contract: ownerContract, access: 'public', handler: () => { throw new Error('password=DO_NOT_LEAK SQL SELECT'); } }); } });
    const headers = { 'X-Meow-Request': '1', 'Content-Type': 'application/json' };
    expect((await test.request('/api/session/login', { method: 'POST', headers, body: '{' })).status).toBe(400);
    expect((await test.request('/api/session/login', { method: 'POST', headers, body: JSON.stringify({ password, role: 'admin' }) })).status).toBe(400);
    expect((await test.request('/api/session/login', { method: 'POST', headers, body: JSON.stringify({ password: 'x'.repeat(1024 * 1024 + 1) }) })).status).toBe(413);
    const error = await test.request('/api/test/owner', { method: 'POST', headers, body: '{}' });
    expect(error.status).toBe(500);
    const result = await error.text();
    expect(result).not.toMatch(/DO_NOT_LEAK|SELECT/);
    expect(result).toContain(error.headers.get('x-request-id'));
  });
});

describe('new schema isolation, migration history, and transaction boundaries', () => {
  it('refuses foreign databases without changing any file bytes or adding sidecars', () => {
    const dataDir = temporaryDir();
    const file = path.join(dataDir, 'meow-v2.sqlite');
    const foreign = new Database(file);
    foreign.exec('CREATE TABLE memos (content TEXT); INSERT INTO memos VALUES (\'synthetic old note\')');
    foreign.close();
    const before = readFileSync(file);
    const names = readdirSync(dataDir);
    expect(() => openDatabase(dataDir, [])).toThrow(/foreign/);
    expect(readFileSync(file)).toEqual(before);
    expect(readdirSync(dataDir)).toEqual(names);
  });

  it('rejects invalid recognized-schema metadata in read-only inspection before any migration writes',()=>{
    const dataDir=temporaryDir();const opened=openDatabase(dataDir,[]);
    opened.db.pragma('journal_mode = DELETE');opened.db.prepare('UPDATE meow_schema SET instance_id = ?').run('invalid-instance-id');opened.db.close();
    const file=path.join(dataDir,'meow-v2.sqlite'),before=readFileSync(file),names=readdirSync(dataDir);
    expect(()=>openDatabase(dataDir,[{id:'test.must-not-run',up(db){db.exec('CREATE TABLE unexpected(id TEXT)');}}])).toThrow(/safely recognize/);
    expect(readFileSync(file)).toEqual(before);expect(readdirSync(dataDir)).toEqual(names);
  });

  it('initializes once, preserves data, appends migrations atomically, and refuses newer histories', () => {
    const dataDir = temporaryDir();
    const firstMigration = { id: 'test.001.values', up(db: Database.Database) { db.exec('CREATE TABLE test_values (value TEXT NOT NULL)'); } };
    let opened = openDatabase(dataDir, [firstMigration]);
    const instanceId = opened.instanceId;
    opened.db.prepare('INSERT INTO test_values VALUES (?)').run('synthetic value');
    opened.db.close();
    expect(() => openDatabase(dataDir, [firstMigration, { id: 'test.002.fail', up(db) { db.exec('CREATE TABLE should_rollback (id TEXT)'); throw new Error('interrupt'); } }])).toThrow('interrupt');
    opened = openDatabase(dataDir, [firstMigration]);
    expect(opened.instanceId).toBe(instanceId);
    expect(opened.db.prepare('SELECT value FROM test_values').get()).toEqual({ value: 'synthetic value' });
    expect(opened.db.prepare("SELECT name FROM sqlite_master WHERE name = 'should_rollback'").get()).toBeUndefined();
    expect(opened.db.prepare('SELECT COUNT(*) AS count FROM meow_migrations').get()).toEqual({ count: 1 });
    opened.db.close();
    expect(() => openDatabase(dataDir, [])).toThrow(/newer/);
  });

  it('rolls back partial multi-table operations including an invalid response', async () => {
    const transactionContract = defineContract('POST', '/api/test/transaction', z.object({ invalidOutput: z.boolean().default(false) }).strict(), z.object({ success: z.literal(true) }));
    const test = await fixture({
      migrations: [{ id: 'test.001.transactions', up(db) { db.exec('CREATE TABLE test_one (id TEXT); CREATE TABLE test_two (id TEXT)'); } }],
      registerDomains(registry, runtime) {
        registry.register({ contract: transactionContract, access: 'public', handler(input) {
          runtime.db.prepare('INSERT INTO test_one VALUES (?)').run('one');
          runtime.db.prepare('INSERT INTO test_two VALUES (?)').run('two');
          if (!input.invalidOutput) throw new AppError(409, 'CONFLICT', 'Synthetic conflict.');
          return { success: false as true };
        } });
      },
    });
    for (const invalidOutput of [false, true]) {
      const result = await test.request('/api/test/transaction', { method: 'POST', headers: { 'X-Meow-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ invalidOutput }) });
      expect([500, 409]).toContain(result.status);
      expect(test.runtime.db.prepare('SELECT COUNT(*) AS count FROM test_one').get()).toEqual({ count: 0 });
      expect(test.runtime.db.prepare('SELECT COUNT(*) AS count FROM test_two').get()).toEqual({ count: 0 });
    }
  });

  it('detects conflicting API paths and refuses undeclared authorization', () => {
    const config = readConfig({ MEOW_DATA_DIR: temporaryDir(), MEOW_OWNER_PASSWORD: password });
    expect(() => createApplication({ config, registerDomains(registry) {
      registry.register({ contract: ownerContract, access: 'owner', handler: () => ({ accepted: true as const }) });
      registry.register({ contract: ownerContract, access: 'owner', handler: () => ({ accepted: true as const }) });
    } })).toThrow(/Duplicate/);
    expect(() => createApplication({ config, registerDomains(registry) {
      registry.register({ contract: ownerContract, access: undefined as never, handler: () => ({ accepted: true as const }) });
    } })).toThrow(/explicitly declare access/);
  });
});
