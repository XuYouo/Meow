import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../server/system/database/openDatabase.js';
import { memosMigrations } from '../server/services/memos/tables/migrations.js';
import { canvasMigrations } from '../server/services/canvas/tables/migrations.js';
import { plan as createMemo } from '../server/services/memos/api/CreateMemoAPIMessage.js';
import { plan as deleteMemo } from '../server/services/memos/api/DeleteMemoAPIMessage.js';
import { plan as setPin } from '../server/services/memos/api/SetMemoPinAPIMessage.js';
import { plan as exportMemos } from '../server/services/memos/api/ExportMemosAPIMessage.js';
import { plan as importMemos } from '../server/services/memos/api/ImportMemosAPIMessage.js';
import { plan as restoreMemos } from '../server/services/memos/api/RestoreMemosAPIMessage.js';
import { plan as exportCanvas } from '../server/services/canvas/api/ExportCanvasAPIMessage.js';
import { plan as restoreCanvas } from '../server/services/canvas/api/RestoreCanvasAPIMessage.js';
import { plan as saveCanvas } from '../server/services/canvas/api/SaveCanvasAPIMessage.js';
import { CreateMemoInputSchema, MemosSnapshotSchema } from '../shared/contracts/memos/index.js';
import type { MemoDependencies } from '../server/services/memos/utils/MemoDependencies.js';

let directory: string,source: ReturnType<typeof openDatabase>,target: ReturnType<typeof openDatabase>;
const now=() => '2026-10-24T06:00:00.000Z';
const principal: MemoDependencies['principal']={ kind: 'owner',id: 'owner',sessionId: 'synthetic-session' };
beforeEach(() => { directory=mkdtempSync(path.join(os.tmpdir(),'meow-domain-snapshot-'));source=openDatabase(path.join(directory,'source'),[...memosMigrations,...canvasMigrations],now);target=openDatabase(path.join(directory,'target'),[...memosMigrations,...canvasMigrations],now); });
afterEach(() => { source.db.close();target.db.close();rmSync(directory,{ recursive: true,force: true }); });
function seed() {
  const deps={ ...source,principal,now };
  return source.unitOfWork.run(() => {
    const first=createMemo(CreateMemoInputSchema.parse({ id: randomUUID(),operationId: randomUUID(),content: '私密目标 #层级/标签',isPinned: true }),deps);
    const second=createMemo(CreateMemoInputSchema.parse({ id: randomUUID(),operationId: randomUUID(),content: '公开来源',isPublic: true,isPinned: true,links: [first.id] }),deps);
    const removed=createMemo(CreateMemoInputSchema.parse({ id: randomUUID(),operationId: randomUUID(),content: '待删除' }),deps);
    deleteMemo({ id: removed.id,operationId: randomUUID(),baseRevision: 1 },deps);
    setPin({ id: first.id,operationId: randomUUID(),baseRevision: 1,isPinned: false },deps);
    setPin({ id: first.id,operationId: randomUUID(),baseRevision: 2,isPinned: true },deps);
    saveCanvas({ operationId: randomUUID(),baseRevision: 0,document: { schemaVersion: 1,viewport: { x: 0,y: -10,scale: 0.7 },memoPositions: [{ memoId: first.id,x: 0,y: 0,z: 2 }],shapes: [] } },deps);
    return { first,second,removed };
  });
}
describe('bounded internal memo/canvas snapshots',() => {
  it('restores IDs, revisions, time, graph, exact pin order and deletion barriers into a fresh instance',() => {
    const seeded=seed(),memos=source.unitOfWork.run(() => exportMemos(source)),canvas=source.unitOfWork.run(() => exportCanvas(source));
    expect(memos.pinOrder).toEqual([seeded.second.id,seeded.first.id]);
    expect(memos.memos.find((memo) => memo.id===seeded.first.id)?.revision).toBe(3);
    target.unitOfWork.run(() => { restoreMemos(memos,target);restoreCanvas(canvas,target); });
    expect(exportMemos(target)).toEqual(memos);expect(exportCanvas(target)).toEqual(canvas);
    expect(() => target.unitOfWork.run(() => createMemo(CreateMemoInputSchema.parse({ id: seeded.removed.id,operationId: randomUUID(),content: '尝试复活' }),{ ...target,now,principal }))).toThrow('该笔记标识已删除');
  });
  it('rejects overwriting an existing target without modifying any domain',() => {
    seed();const snapshot=exportMemos(source),canvas=exportCanvas(source);
    target.unitOfWork.run(() => { restoreMemos(snapshot,target);restoreCanvas(canvas,target); });
    expect(() => target.unitOfWork.run(() => restoreMemos(snapshot,target))).toThrow('空实例');
    expect(() => target.unitOfWork.run(() => restoreCanvas(canvas,target))).toThrow('必须为空');
    expect(exportMemos(target)).toEqual(snapshot);expect(exportCanvas(target)).toEqual(canvas);
  });
  it('rolls back the entire restore when backlink projections or cross-domain references are inconsistent',() => {
    const seeded=seed(),snapshot=exportMemos(source),canvas=exportCanvas(source);
    const corrupt={ ...snapshot,memos: snapshot.memos.map((memo) => memo.id===seeded.first.id?{ ...memo,backlinks: [] }:memo) };
    expect(() => target.unitOfWork.run(() => restoreMemos(corrupt,target))).toThrow('双链投影不一致');
    expect(exportMemos(target)).toEqual({ memos: [],tombstones: [],pinOrder: [] });
    const invalidCanvas={ ...canvas,document: { ...canvas.document,memoPositions: [{ memoId: randomUUID(),x: 0,y: 0,z: 0 }] } };
    expect(() => target.unitOfWork.run(() => { restoreMemos(snapshot,target);restoreCanvas(invalidCanvas,target); })).toThrow('引用的笔记不存在');
    expect(exportMemos(target)).toEqual({ memos: [],tombstones: [],pinOrder: [] });
    expect(exportCanvas(target).revision).toBe(0);
  });
  it('detects duplicate identities and inconsistent pin order before table mutation',() => {
    seed();const snapshot=exportMemos(source),first=snapshot.memos[0];if (!first) throw new Error('Missing synthetic data');
    expect(MemosSnapshotSchema.safeParse({ ...snapshot,memos: [first,first] }).success).toBe(false);
    expect(MemosSnapshotSchema.safeParse({ ...snapshot,pinOrder: [] }).success).toBe(false);
    expect(exportMemos(target).memos).toEqual([]);
  });
});


describe('append import into an existing new workspace',() => {
  it('preserves mapped IDs and source times without requiring an empty workspace',() => {
    seed();const before=exportMemos(source);
    const original=before.memos[0];if (!original) throw new Error('Missing synthetic source');
    const imported={ ...original,id: randomUUID(),revision: 1,isPinned: false,backlinks: [],links: [],createdAt: '2020-01-02T03:04:05.000Z',updatedAt: '2020-01-03T03:04:05.000Z' };
    source.unitOfWork.run(() => importMemos({ memos: [imported] },source));
    const after=exportMemos(source);expect(after.memos).toHaveLength(before.memos.length+1);
    expect(after.memos.find((memo) => memo.id===imported.id)).toEqual(imported);
    expect(after.tombstones).toEqual(before.tombstones);
  });
  it('rejects live and deleted ID collisions before appending and rolls back unresolved batch relations',() => {
    seed();const before=exportMemos(source),original=before.memos[0],deleted=before.tombstones[0];
    if (!original||!deleted) throw new Error('Missing synthetic source');
    expect(() => source.unitOfWork.run(() => importMemos({ memos: [{ ...original,revision: 1 }] },source))).toThrow('冲突');
    expect(() => source.unitOfWork.run(() => importMemos({ memos: [{ ...original,id: deleted.id,revision: 1,isPinned: false,backlinks: [],links: [] }] },source))).toThrow('冲突');
    expect(() => source.unitOfWork.run(() => importMemos({ memos: [{ ...original,id: randomUUID(),revision: 1,isPinned: false,backlinks: [],links: [randomUUID()] }] },source))).toThrow('双链目标不存在');
    expect(exportMemos(source)).toEqual(before);
  });
});
