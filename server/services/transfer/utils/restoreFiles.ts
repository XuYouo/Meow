import { link, lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AppError } from '../../../system/errors/AppError.js';
import type { TransferDependencies } from './TransferDependencies.js';
import { keepLease } from './lease.js';

const JournalSchema = z.object({ backupId: z.string().uuid(), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/), leaseId: z.string().uuid(), ids: z.array(z.string().uuid()).max(5000) }).strict();
export interface RestoreFiles { readonly directory: string; readonly journal: z.infer<typeof JournalSchema> }
const journalTemporaryName = 'journal.json.tmp';
const recoveryRequired = () => new AppError(503, 'RESTORE_RECOVERY_REQUIRED', 'Restore staging contains unsafe or unrecognized files. Preserve it for storage inspection.');

/** Before a complete journal is published, no asset files may be created. */
async function readPreviousJournal(directory: string): Promise<z.infer<typeof JournalSchema> | null> {
  const journalPath = path.join(directory, 'journal.json');
  let details;
  try { details = await lstat(journalPath); }
  catch (cause) { if (!(typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT')) throw recoveryRequired(); }
  if (details && (!details.isFile() || details.isSymbolicLink())) throw recoveryRequired();
  if (details) {
    let raw: unknown;
    try { raw = JSON.parse(await readFile(journalPath, 'utf8')) as unknown; }
    catch (cause) { if (!(cause instanceof SyntaxError)) throw recoveryRequired(); }
    const parsed = JournalSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  // A process can stop between mkdir, the temporary journal write, and rename.
  // Only this metadata-only state is safe to discard without a valid journal.
  const names = await readdir(directory);
  if (names.some((name) => name !== 'journal.json' && name !== journalTemporaryName)) throw recoveryRequired();
  for (const name of names) {
    const file = await lstat(path.join(directory, name));
    if (!file.isFile() || file.isSymbolicLink()) throw recoveryRequired();
  }
  for (const name of names) await unlink(path.join(directory, name));
  await rmdir(directory);
  return null;
}

/** A failed batch retains a journal so a retry can distinguish its hard links from unknown files. */
export async function cleanupRestore(files: RestoreFiles, dependencies: TransferDependencies, keepDestinations: boolean): Promise<void> {
  const expected = new Set(['journal.json', ...files.journal.ids.map((id) => `${id}.bin`)]);
  const names = await readdir(files.directory);
  if (names.some((name) => !expected.has(name))) throw new AppError(503, 'RESTORE_RECOVERY_REQUIRED', 'Unexpected staging files require storage inspection.');
  for (const [index, id] of files.journal.ids.entries()) {
    dependencies.fault?.('cleanup', index);
    const temporary = path.join(files.directory, `${id}.bin`);
    const source = await lstat(temporary).catch(() => undefined);
    if (source?.isSymbolicLink()) throw new AppError(503, 'RESTORE_RECOVERY_REQUIRED', 'Unsafe staging entry.');
    if (!keepDestinations && source) {
      const destination = path.join(dependencies.uploadsDir, `${id}.bin`);
      const target = await lstat(destination).catch(() => undefined);
      // Only a hard link owned by this batch is eligible for removal.
      if (target && !target.isSymbolicLink() && target.ino === source.ino && target.dev === source.dev) await unlink(destination);
    }
    if (source) await unlink(temporary);
  }
  await unlink(path.join(files.directory, 'journal.json'));
  await rmdir(files.directory);
}

export async function prepareRestoreFiles(backupId: string, sourceDigest: string, leaseId: string, contents: ReadonlyMap<string, Buffer>, dependencies: TransferDependencies): Promise<RestoreFiles> {
  const root = path.join(dependencies.uploadsDir, '.restore');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = path.join(root, `${backupId}.${leaseId}`);
  const journal = { backupId, sourceDigest, leaseId, ids: [...contents.keys()].sort() };
  for (const name of await readdir(root)) {
    if (!name.startsWith(`${backupId}.`)) continue;
    keepLease(dependencies, leaseId);
    const previousDirectory = path.join(root, name);
    const details = await lstat(previousDirectory);
    if (!details.isDirectory() || details.isSymbolicLink()) throw new AppError(503, 'RESTORE_RECOVERY_REQUIRED', 'Unsafe restore staging directory.');
    if (!z.string().uuid().safeParse(name.slice(backupId.length + 1)).success) throw recoveryRequired();
    const old = await readPreviousJournal(previousDirectory);
    if (!old) continue;
    if (old.backupId !== backupId || old.sourceDigest !== sourceDigest || JSON.stringify(old.ids) !== JSON.stringify(journal.ids)) throw new AppError(409, 'RESTORE_BATCH_CONFLICT', 'A different restore batch uses this backup identifier.');
    await cleanupRestore({ directory: previousDirectory, journal: old }, dependencies, false);
  }
  await mkdir(directory, { mode: 0o700 });
  try {
    await writeFile(path.join(directory, journalTemporaryName), JSON.stringify(journal), { flag: 'wx', mode: 0o600 });
    await rename(path.join(directory, journalTemporaryName), path.join(directory, 'journal.json'));
  } catch (error) {
    await unlink(path.join(directory, journalTemporaryName)).catch(() => undefined);
    await unlink(path.join(directory, 'journal.json')).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
    throw error;
  }
  return { directory, journal };
}

export async function stageRestoreFiles(files: RestoreFiles, contents: ReadonlyMap<string, Buffer>, dependencies: TransferDependencies): Promise<void> {
  for (const [index, id] of files.journal.ids.entries()) {
    keepLease(dependencies, files.journal.leaseId);
    dependencies.fault?.('stage-file', index);
    const content = contents.get(id);
    if (!content) throw new Error('Missing validated restore content.');
    await writeFile(path.join(files.directory, `${id}.bin`), content, { flag: 'wx', mode: 0o600 });
  }
  for (const [index, id] of files.journal.ids.entries()) {
    keepLease(dependencies, files.journal.leaseId);
    dependencies.fault?.('link-file', index);
    await link(path.join(files.directory, `${id}.bin`), path.join(dependencies.uploadsDir, `${id}.bin`)).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') throw new AppError(409, 'RESTORE_FILE_EXISTS', 'Restore would overwrite an existing file. The file was preserved.');
      throw error;
    });
  }
}

export async function cleanupCompletedRestore(backupId: string, sourceDigest: string, dependencies: TransferDependencies): Promise<boolean> {
  const root = path.join(dependencies.uploadsDir, '.restore');
  const names = await readdir(root).catch(() => []);
  let pending = false;
  for (const name of names.filter((entry) => entry.startsWith(`${backupId}.`))) {
    const directory = path.join(root, name);
    try {
      const details = await lstat(directory);
      if (!details.isDirectory() || details.isSymbolicLink() || !z.string().uuid().safeParse(name.slice(backupId.length + 1)).success) { pending = true; continue; }
      const journal = await readPreviousJournal(directory);
      if (!journal) continue;
      if (journal.backupId !== backupId || journal.sourceDigest !== sourceDigest) { pending = true; continue; }
      await cleanupRestore({ directory, journal }, dependencies, true);
    } catch { pending = true; }
  }
  return pending;
}
