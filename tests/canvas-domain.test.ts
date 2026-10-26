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
import { canvasMigrations } from '../server/services/canvas/tables/migrations.js';
import { registerCanvasRoutes } from '../server/services/canvas/routes/index.js';
import { plan as removeReferences } from '../server/services/canvas/api/RemoveMemoReferencesAPIMessage.js';
import { CanvasSchema, type CanvasDocument } from '../shared/contracts/canvas/index.js';

const write={ 'X-Meow-Request': '1' };
let directory: string,application: ReturnType<typeof createApplication>,client: ReturnType<typeof request.agent>,failSave=false,failDelete=false;
function document(): CanvasDocument { return { schemaVersion: 1,viewport: { x: 0,y: 0,scale: 1 },memoPositions: [],shapes: [{ id: randomUUID(),type: 'rectangle',x: 0,y: 0,width: 200,height: 80,z: 1,style: { stroke: '#576a4d',fill: 'transparent',strokeWidth: 2,dash: 'dashed',opacity: 0.7,fontSize: 20,textAlign: 'left' },cornerRadius: 12,erasures: [{ x: 20,y: 20,radius: 8 }] }] }; }
beforeEach(async () => {
  directory=mkdtempSync(path.join(os.tmpdir(),'meow-canvas-test-'));failSave=false;failDelete=false;
  application=createApplication({ config: readConfig({ MEOW_DATA_DIR: directory,MEOW_OWNER_PASSWORD: 'synthetic-password-only' }),migrations: [...memosMigrations,...canvasMigrations],logError() {},registerDomains(registry,runtime) {
    registerMemosRoutes(registry,runtime,{ onMemoChanged(before,after) { if (before&&!after) { removeReferences({ memoId: before.id },runtime);if (failDelete) throw new Error('synthetic follow-up failure'); } } });
    registerCanvasRoutes(registry,runtime,{ onCanvasChanged() { if (failSave) throw new Error('synthetic media validation failure'); } });
  } });
  client=request.agent(application.app);await client.post('/api/session/login').set(write).send({ password: 'synthetic-password-only' }).expect(200);
});
afterEach(() => { application.close();rmSync(directory,{ recursive: true,force: true }); });

describe('canvas persistence and graph integrity',() => {
  it('persists zero coordinates, styles, erasure masks, viewport and exact shape types across reload',async () => {
    const value=document();value.viewport={ x: -22,y: 0,scale: 0.5 };
    const saved=await client.patch('/api/canvas').set(write).send({ operationId: randomUUID(),baseRevision: 0,document: value }).expect(200);
    expect(CanvasSchema.parse(saved.body).document).toEqual(value);
    const reloaded=await client.get('/api/canvas').expect(200);
    expect(reloaded.body).toEqual(saved.body);
    expect(reloaded.body.revision).toBe(1);
    expect(application.runtime.db.prepare('SELECT COUNT(*) AS count FROM canvases').get()).toEqual({ count: 1 });
  });
  it('retains one stable operation identity and rejects concurrent full-document writes with explicit current content',async () => {
    const input={ operationId: randomUUID(),baseRevision: 0,document: document() };
    const first=await client.patch('/api/canvas').set(write).send(input).expect(200);
    expect((await client.patch('/api/canvas').set(write).send(input).expect(200)).body).toEqual(first.body);
    await client.patch('/api/canvas').set(write).send({ ...input,document: { ...input.document,shapes: [] } }).expect(409);
    const conflict=await client.patch('/api/canvas').set(write).send({ operationId: randomUUID(),baseRevision: 0,document: document() }).expect(409);
    expect(conflict.body.error.code).toBe('CANVAS_CONFLICT');
    expect(CanvasSchema.parse(conflict.body.error.details.current)).toEqual(first.body);
  });
  it('authorizes the entire private canvas document and rejects unsupported or malformed shape data',async () => {
    await request(application.app).get('/api/canvas').expect(401);
    await request(application.app).patch('/api/canvas').set(write).send({ operationId: randomUUID(),baseRevision: 0,document: document() }).expect(401);
    const value=document();
    await client.patch('/api/canvas').set(write).send({ operationId: randomUUID(),baseRevision: 0,document: { ...value,schemaVersion: 99 } }).expect(400);
    await client.patch('/api/canvas').set(write).send({ operationId: randomUUID(),baseRevision: 0,document: { ...value,memoPositions: [{ memoId: randomUUID(),x: 0,y: 0,z: 1 }] } }).expect(404);
    const shape=value.shapes[0];if (!shape) throw new Error('Missing synthetic shape');
    await client.patch('/api/canvas').set(write).send({ operationId: randomUUID(),baseRevision: 0,document: { ...value,shapes: [shape,shape] } }).expect(400);
    await client.patch('/api/canvas').set(write).send({ operationId: randomUUID(),baseRevision: 0,document: { ...value,viewport: { x: 0,y: 0,scale: 0 } } }).expect(400);
    expect((await client.get('/api/canvas')).body.revision).toBe(0);
  });
  it('rolls back document, revision and idempotency record when a media/reference step fails',async () => {
    const input={ operationId: randomUUID(),baseRevision: 0,document: document() };
    failSave=true;await client.patch('/api/canvas').set(write).send(input).expect(500);
    expect((await client.get('/api/canvas')).body.revision).toBe(0);
    expect(application.runtime.db.prepare('SELECT COUNT(*) AS count FROM canvas_operations').get()).toEqual({ count: 0 });
    failSave=false;await client.patch('/api/canvas').set(write).send(input).expect(200);
  });
  it('removes deleted memo positions in the same work unit and rolls back both domains if cleanup fails',async () => {
    const memoId=randomUUID();
    await client.post('/api/memos').set(write).send({ id: memoId,operationId: randomUUID(),content: '画布笔记' }).expect(200);
    const value=document();value.memoPositions=[{ memoId,x: 0,y: 0,z: 0 }];
    await client.patch('/api/canvas').set(write).send({ operationId: randomUUID(),baseRevision: 0,document: value }).expect(200);
    failDelete=true;const removal={ operationId: randomUUID(),baseRevision: 1 };
    await client.delete(`/api/memos/${memoId}`).set(write).send(removal).expect(500);
    await client.get(`/api/memos/${memoId}`).expect(200);
    expect((await client.get('/api/canvas')).body.document.memoPositions).toEqual(value.memoPositions);
    failDelete=false;await client.delete(`/api/memos/${memoId}`).set(write).send(removal).expect(200);
    const current=(await client.get('/api/canvas')).body;
    expect(current.document.memoPositions).toEqual([]);expect(current.revision).toBe(2);
    expect(current.document.shapes).toEqual(value.shapes);
    await client.patch('/api/canvas').set(write).send({ operationId: randomUUID(),baseRevision: 1,document: value }).expect(409);
  });
});
