import type { Readable } from 'node:stream';
import { MAX_BACKUP_BYTES, RestoreBackup } from '../../../../shared/contracts/transfer/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as assertActiveSession } from '../../identity/api/AssertActiveSessionAPIMessage.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { plan as restoreMemos } from '../../memos/api/RestoreMemosAPIMessage.js';
import { plan as restorePreferences } from '../../preferences/api/RestorePreferencesAPIMessage.js';
import { plan as restoreCanvas } from '../../canvas/api/RestoreCanvasAPIMessage.js';
import { plan as restoreReviews } from '../../review/api/RestoreReviewsAPIMessage.js';
import { plan as restoreMusic } from '../../music/api/RestoreMusicAPIMessage.js';
import { plan as restoreMedia } from '../../media/api/RestoreMediaAPIMessage.js';
import { findBatch, recordBatch } from '../tables/batches/table.js';
import type { TransferDependencies } from '../utils/TransferDependencies.js';
import { readBounded } from '../utils/readBounded.js';
import { parsePackage } from '../utils/package.js';
import { empty, snapshot } from '../utils/snapshot.js';
import { finishLease, keepLease, startLease } from '../utils/lease.js';
import { cleanupCompletedRestore, cleanupRestore, prepareRestoreFiles, stageRestoreFiles, type RestoreFiles } from '../utils/restoreFiles.js';

export async function plan(stream: Readable, dependencies: TransferDependencies) {
  assertOwner(dependencies);
  const bytes = await readBounded(stream, MAX_BACKUP_BYTES);
  const { value, files: contents, sourceDigest } = parsePackage(bytes);
  assertActiveSession(dependencies);
  const backupId = value.manifest.backupId;
  const receipt = findBatch(dependencies.db, backupId);
  if (receipt) {
    if (receipt.kind !== 'restore' || receipt.sourceDigest !== sourceDigest) throw new AppError(409, 'RESTORE_BATCH_CONFLICT', 'The backup identifier was already used for different content.');
    return dependencies.filePublication.run(async () => {
      assertActiveSession(dependencies);
      const cleanupPending = await cleanupCompletedRestore(backupId, sourceDigest, dependencies);
      return RestoreBackup.output.parse({ ...RestoreBackup.output.parse(receipt.output), replayed: true, cleanupPending });
    });
  }
  dependencies.unitOfWork.run(() => { if (!empty(snapshot(dependencies.db))) throw new AppError(409, 'RESTORE_REQUIRES_EMPTY', 'Restore is only supported into an empty workspace.'); });
  // Acquire the durable restore lease before waiting for the file lock so another
  // restore still receives TRANSFER_BUSY rather than silently queuing behind us.
  const leaseId = startLease(dependencies);
  try {
    return await dependencies.filePublication.run(async () => {
      assertActiveSession(dependencies);
      dependencies.unitOfWork.run(() => {
        keepLease(dependencies, leaseId);
        if (!empty(snapshot(dependencies.db))) throw new AppError(409, 'RESTORE_REQUIRES_EMPTY', 'The target workspace changed while waiting. Nothing was overwritten.');
      });
      let staging: RestoreFiles | undefined;
      let committed = false;
      let cleanupPending = false;
      const result = { restored: true as const, backupId, counts: value.manifest.counts, replayed: false, cleanupPending: false };
      try {
        // Upload, delete, and restore share this publication ownership boundary.
        // A failed batch must finish compensation before anyone reuses its files.
        staging = await prepareRestoreFiles(backupId, sourceDigest, leaseId, contents, dependencies);
        await stageRestoreFiles(staging, contents, dependencies);
        dependencies.unitOfWork.run(() => {
          if (!empty(snapshot(dependencies.db))) throw new AppError(409, 'RESTORE_REQUIRES_EMPTY', 'The target workspace changed during staging. Nothing was overwritten.');
          assertActiveSession(dependencies);
          keepLease(dependencies, leaseId);
          restoreMedia(value.entities.media, dependencies);
          restoreMemos(value.entities.memos, dependencies);
          restorePreferences(value.entities.preferences, dependencies);
          restoreCanvas(value.entities.canvas, dependencies);
          restoreReviews(value.entities.reviews, dependencies);
          restoreMusic(value.entities.music, dependencies);
          dependencies.fault?.('before-commit', 0);
          recordBatch(dependencies.db, { batchId: backupId, kind: 'restore', sourceDigest, output: result }, dependencies.now());
        });
        committed = true;
        dependencies.fault?.('after-commit', 0);
      } catch (error) {
        if (!committed) {
          if (staging) {
            try { await cleanupRestore(staging, dependencies, false); }
            catch { throw new AppError(503, 'RESTORE_CLEANUP_PENDING', 'Restore was not committed. Retry this same backup to recover its staging files.'); }
          }
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOSPC') throw new AppError(507, 'STORAGE_FULL', 'Storage is full. Restore was not committed.');
          throw error;
        }
        cleanupPending = true;
      }
      if (staging) {
        try { await cleanupRestore(staging, dependencies, true); }
        catch { cleanupPending = true; }
      }
      return { ...result, cleanupPending };
    });
  } finally {
    finishLease(dependencies, leaseId);
  }
}
