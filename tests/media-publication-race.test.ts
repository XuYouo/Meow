import fs from 'node:fs';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceApplication } from '../server/bootstrap';
import { readConfig } from '../server/system/config';
import type { AsyncMutex } from '../server/system/concurrency/AsyncMutex';
import { insertSession } from '../server/services/identity/tables/sessions/table';
import { plan as upload } from '../server/services/media/api/UploadMediaAPIMessage';
import { findAsset } from '../server/services/media/tables/assets/table';
import { plan as createMemo } from '../server/services/memos/api/CreateMemoAPIMessage';
import { plan as exportBackup } from '../server/services/transfer/api/ExportBackupAPIMessage';
import { plan as restoreBackup } from '../server/services/transfer/api/RestoreBackupAPIMessage';

const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
const fixtures: { directory: string;app: ReturnType<typeof createWorkspaceApplication> }[]=[];
function fixture() {
  const directory=mkdtempSync(path.join(os.tmpdir(),'meow-publication-'));
  const app=createWorkspaceApplication({ config: readConfig({ MEOW_DATA_DIR: directory,MEOW_OWNER_PASSWORD: 'synthetic-publication-password' }) });
  fixtures.push({ directory,app });
  const sessionId=randomUUID(),createdAt=new Date().toISOString();
  insertSession(app.runtime.db,{ id: sessionId,tokenHash: randomUUID(),createdAt,expiresAt: new Date(Date.now()+3_600_000).toISOString() });
  return { ...app.runtime,principal: { kind: 'owner' as const,id: 'owner' as const,sessionId } };
}
function deferred() {
  let resolve: () => void=() => {};
  const promise=new Promise<void>((complete) => { resolve=complete; });
  return { promise,resolve };
}
function observeSecondEntry(mutex: AsyncMutex) {
  const waiting=deferred();let entries=0,secondStarted=false;
  const observed: AsyncMutex={ run<T>(work: () => Promise<T>): Promise<T> { const entry=++entries;if (entry===2) waiting.resolve();return mutex.run(async () => { if (entry===2) secondStarted=true;return work(); }); } };
  return { mutex: observed,waiting: waiting.promise,secondStarted: () => secondStarted };
}
async function backupFixture() {
  const source=fixture(),input={ id: randomUUID(),operationId: randomUUID(),fileName: 'synthetic.png',mimeType: 'image/png' as const };
  await upload(input,Readable.from(png),source);
  source.unitOfWork.run(() => createMemo({ id: randomUUID(),operationId: randomUUID(),content: '合成跨域恢复笔记',tags: [],links: [],attachments: [],isPublic: false,isPinned: false },source));
  return { input,backup: await exportBackup(source) };
}
afterEach(() => {
  vi.restoreAllMocks();syncBuiltinESMExports();
  for (const { directory,app } of fixtures.splice(0)) { app.close();rmSync(directory,{ recursive: true,force: true }); }
});

describe('publication ownership across upload, retry and restore',() => {
  it('finishes a failed upload compensation before an identical retry can acknowledge ownership of its bytes',async () => {
    const dependencies=fixture(),observed=observeSecondEntry(dependencies.filePublication);
    const deps={ ...dependencies,filePublication: observed.mutex };
    const input={ id: randomUUID(),operationId: randomUUID(),fileName: 'synthetic.png',mimeType: 'image/png' as const };
    const atCleanup=deferred(),resumeCleanup=deferred();let intercepted=false;
    const originalUnlink=fs.promises.unlink;
    vi.spyOn(fs.promises,'unlink').mockImplementation(async (file) => {
      if (!intercepted&&String(file)===path.join(deps.uploadsDir,`${input.id}.bin`)) { intercepted=true;atCleanup.resolve();await resumeCleanup.promise; }
      return originalUnlink(file);
    });syncBuiltinESMExports();
    deps.db.exec("CREATE TRIGGER synthetic_upload_failure BEFORE INSERT ON media_assets BEGIN SELECT RAISE(ABORT,'synthetic metadata commit failure'); END");
    const first=upload(input,Readable.from(png),deps).then(() => null,(cause: unknown) => cause);
    await atCleanup.promise;
    deps.db.exec('DROP TRIGGER synthetic_upload_failure');
    let secondAcknowledged=false;
    const second=upload(input,Readable.from(png),deps).then((result) => { secondAcknowledged=true;return result; });
    try {
      await observed.waiting;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(observed.secondStarted()).toBe(false);expect(secondAcknowledged).toBe(false);expect(findAsset(deps.db,input.id)).toBeUndefined();
    } finally { resumeCleanup.resolve(); }
    expect(await first).toBeInstanceOf(Error);
    expect((await second).id).toBe(input.id);
    expect(findAsset(deps.db,input.id)?.state).toBe('ready');
    expect(readFileSync(path.join(deps.uploadsDir,`${input.id}.bin`))).toEqual(png);
  });

  it('prevents an upload from adopting restore files until the failed cross-domain restore has finished removing its own links',async () => {
    const { input,backup }=await backupFixture();
    const target=fixture(),observed=observeSecondEntry(target.filePublication),deps={ ...target,filePublication: observed.mutex };
    const published=deferred(),resumeRestore=deferred();let intercepted=false;
    const originalLink=fs.promises.link;
    vi.spyOn(fs.promises,'link').mockImplementation(async (from,to) => {
      await originalLink(from,to);
      if (!intercepted&&String(from).includes('/.restore/')) { intercepted=true;published.resolve();await resumeRestore.promise; }
    });syncBuiltinESMExports();
    const restoring=restoreBackup(Readable.from(backup.bytes),{ ...deps,fault(stage) { if (stage==='before-commit') throw new Error('synthetic restore rollback'); } }).then(() => null,(cause: unknown) => cause);
    await published.promise;
    let uploaded=false;
    const pendingUpload=upload(input,Readable.from(png),deps).then((result) => { uploaded=true;return result; });
    try {
      await observed.waiting;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(observed.secondStarted()).toBe(false);expect(uploaded).toBe(false);expect(findAsset(deps.db,input.id)).toBeUndefined();
      expect(existsSync(path.join(deps.uploadsDir,`${input.id}.bin`))).toBe(true);
    } finally { resumeRestore.resolve(); }
    expect(await restoring).toBeInstanceOf(Error);
    expect((await pendingUpload).id).toBe(input.id);
    expect(findAsset(deps.db,input.id)?.state).toBe('ready');
    expect(readFileSync(path.join(deps.uploadsDir,`${input.id}.bin`))).toEqual(png);
    expect(deps.db.prepare('SELECT COUNT(*) AS count FROM memos').get()).toEqual({ count: 0 });
    expect(deps.db.prepare('SELECT COUNT(*) AS count FROM transfer_batches').get()).toEqual({ count: 0 });
    expect(deps.db.prepare('SELECT COUNT(*) AS count FROM transfer_leases').get()).toEqual({ count: 0 });
  });
});

describe('interrupted restore journal publication',() => {
  it.each(['empty-directory','partial-temporary','partial-journal'])('recovers %s left before journal publication and makes a repeated package idempotent',async (interruption) => {
    const { input,backup }=await backupFixture(),target=fixture();
    const old=path.join(target.uploadsDir,'.restore',`${backup.backupId}.${randomUUID()}`);
    mkdirSync(old,{ recursive: true });
    if (interruption!=='empty-directory') writeFileSync(path.join(old,interruption==='partial-temporary'?'journal.json.tmp':'journal.json'),'{"backupId":');
    const restored=await restoreBackup(Readable.from(backup.bytes),target);
    expect(restored).toMatchObject({ restored: true,replayed: false,cleanupPending: false });
    expect(existsSync(old)).toBe(false);expect(readFileSync(path.join(target.uploadsDir,`${input.id}.bin`))).toEqual(png);
    expect(target.db.prepare('SELECT COUNT(*) AS count FROM memos').get()).toEqual({ count: 1 });
    // A committed batch can also stop after unlinking its journal but before rmdir.
    mkdirSync(old,{ recursive: true });
    if (interruption!=='empty-directory') writeFileSync(path.join(old,interruption==='partial-temporary'?'journal.json.tmp':'journal.json'),'{"backupId":');
    expect(await restoreBackup(Readable.from(backup.bytes),target)).toMatchObject({ restored: true,replayed: true,cleanupPending: false });
    expect(existsSync(old)).toBe(false);expect(readFileSync(path.join(target.uploadsDir,`${input.id}.bin`))).toEqual(png);
  });

  it('rolls back a failed atomic journal rename and restores successfully on the same-package retry',async () => {
    const { input,backup }=await backupFixture(),target=fixture();
    const rename=vi.spyOn(fs.promises,'rename').mockRejectedValueOnce(Object.assign(new Error('synthetic journal storage full'),{ code: 'ENOSPC' }));
    syncBuiltinESMExports();
    await expect(restoreBackup(Readable.from(backup.bytes),target)).rejects.toMatchObject({ status: 507,code: 'STORAGE_FULL' });
    expect(target.db.prepare('SELECT COUNT(*) AS count FROM memos').get()).toEqual({ count: 0 });
    expect(target.db.prepare('SELECT COUNT(*) AS count FROM transfer_leases').get()).toEqual({ count: 0 });
    expect(readdirSync(path.join(target.uploadsDir,'.restore'))).toEqual([]);
    rename.mockRestore();syncBuiltinESMExports();
    expect(await restoreBackup(Readable.from(backup.bytes),target)).toMatchObject({ restored: true,replayed: false });
    expect(readFileSync(path.join(target.uploadsDir,`${input.id}.bin`))).toEqual(png);
    expect(await restoreBackup(Readable.from(backup.bytes),target)).toMatchObject({ restored: true,replayed: true });
  });

  it('preserves published bytes when their staging directory has no valid journal and reports explicit recovery required',async () => {
    const { input,backup }=await backupFixture(),target=fixture();
    const old=path.join(target.uploadsDir,'.restore',`${backup.backupId}.${randomUUID()}`),staged=path.join(old,`${input.id}.bin`),destination=path.join(target.uploadsDir,`${input.id}.bin`);
    mkdirSync(old,{ recursive: true });writeFileSync(path.join(old,'journal.json'),'{');writeFileSync(staged,png);linkSync(staged,destination);
    for (let attempt=0;attempt<2;attempt++) await expect(restoreBackup(Readable.from(backup.bytes),target)).rejects.toMatchObject({ status: 503,code: 'RESTORE_RECOVERY_REQUIRED' });
    expect(readFileSync(staged)).toEqual(png);expect(readFileSync(destination)).toEqual(png);expect(readFileSync(path.join(old,'journal.json'),'utf8')).toBe('{');
    expect(target.db.prepare('SELECT COUNT(*) AS count FROM media_assets').get()).toEqual({ count: 0 });
    expect(target.db.prepare('SELECT COUNT(*) AS count FROM transfer_batches').get()).toEqual({ count: 0 });
  });

  it('does not follow or remove a journal symlink while attempting metadata-only recovery',async () => {
    const { backup }=await backupFixture(),target=fixture();
    const old=path.join(target.uploadsDir,'.restore',`${backup.backupId}.${randomUUID()}`),sentinel=path.join(target.uploadsDir,'synthetic-sentinel.txt');
    mkdirSync(old,{ recursive: true });writeFileSync(sentinel,'preserve synthetic unrelated file');symlinkSync(sentinel,path.join(old,'journal.json'));
    await expect(restoreBackup(Readable.from(backup.bytes),target)).rejects.toMatchObject({ status: 503,code: 'RESTORE_RECOVERY_REQUIRED' });
    expect(readFileSync(sentinel,'utf8')).toBe('preserve synthetic unrelated file');expect(fs.lstatSync(path.join(old,'journal.json')).isSymbolicLink()).toBe(true);
  });
});
