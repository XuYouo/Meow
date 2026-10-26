import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../system/errors/AppError.js';
import { findAsset, removeAsset, setAssetDeleting } from '../tables/assets/table.js';
import { referenceCount } from '../tables/references/table.js';
import type { MediaDependencies } from '../utils/MediaDependencies.js';
import { requireOwner } from '../utils/access.js';
import { plan as assertActiveSession } from '../../identity/api/AssertActiveSessionAPIMessage.js';

export async function plan(input: { id: string }, deps: MediaDependencies): Promise<{ deleted: true }> {
  requireOwner(deps);
  return deps.filePublication.run(async () => {
    deps.unitOfWork.run(() => {
      assertActiveSession(deps);
      const asset = findAsset(deps.db, input.id);
      if (!asset) throw new AppError(404, 'NOT_FOUND', '附件不存在。');
      if (referenceCount(deps.db, input.id) > 0) throw new AppError(409, 'MEDIA_REFERENCED', '附件仍在使用中。');
      setAssetDeleting(deps.db, input.id);
    });
    // The deleting state prevents a new reference while filesystem work is pending.
    await unlink(path.join(deps.uploadsDir, `${input.id}.bin`)).catch((error: unknown) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw new AppError(503, 'CLEANUP_FAILED', '附件清理失败，可以重试。');
    });
    deps.unitOfWork.run(() => removeAsset(deps.db, input.id));
    return { deleted: true };
  });
}
