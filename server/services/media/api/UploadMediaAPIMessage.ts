import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { link, lstat, mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { z } from 'zod';
import type { UploadMediaInputSchema, MediaDTO } from '../../../../shared/contracts/media/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { findAsset, findAssetOperation, insertAsset } from '../tables/assets/table.js';
import type { MediaDependencies } from '../utils/MediaDependencies.js';
import { mediaDTO, requireOwner } from '../utils/access.js';
import { validateFileType } from '../utils/fileType.js';
import { plan as assertActiveSession } from '../../identity/api/AssertActiveSessionAPIMessage.js';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function plan(input: z.infer<typeof UploadMediaInputSchema>, stream: Readable, deps: MediaDependencies): Promise<MediaDTO> {
  requireOwner(deps);
  await mkdir(path.join(deps.uploadsDir, '.staging'), { recursive: true });
  const temporary = path.join(deps.uploadsDir, '.staging', randomUUID());
  const destination = path.join(deps.uploadsDir, `${input.id}.bin`);
  const hash = createHash('sha256');
  let size = 0;
  let prefix = Buffer.alloc(0);
  let tooLarge = false;
  const inspect = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) { tooLarge = true; return callback(); }
      hash.update(chunk);
      if (prefix.length < 512) prefix = Buffer.concat([prefix, chunk]).subarray(0, 512);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(stream, inspect, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    if (tooLarge) throw new AppError(413, 'PAYLOAD_TOO_LARGE', '附件最大为25MB。');
    if (size === 0) throw new AppError(400, 'EMPTY_MEDIA', '不能上传空文件。');
    validateFileType(prefix, input.mimeType);
    const sha256 = hash.digest('hex');
    return await deps.filePublication.run(async () => {
      let moved = false;
      let committed = false;
      assertActiveSession(deps);
      const matches = (asset: NonNullable<ReturnType<typeof findAsset>>) => asset.operationId === input.operationId && asset.id === input.id && asset.sha256 === sha256 && asset.fileName === input.fileName && asset.mimeType === input.mimeType && asset.state === 'ready';
      const existing = findAssetOperation(deps.db, input.operationId) ?? findAsset(deps.db, input.id);
      if (existing && !matches(existing)) throw new AppError(409, 'OPERATION_CONFLICT', '上传标识已用于不同内容。');
      try {
        try { await link(temporary, destination); moved = true; }
        catch (cause) {
          if (!(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST')) throw cause;
          // A process may stop after publishing bytes but before metadata commits.
          // Reuse only an exact regular-file match; never overwrite unknown bytes.
          const file = await lstat(destination);
          if (!file.isFile() || file.size !== size || createHash('sha256').update(await readFile(destination)).digest('hex') !== sha256) {
            throw new AppError(409, 'UPLOAD_IN_PROGRESS', '同名附件文件不匹配，未覆盖任何文件。');
          }
        }
        const result = deps.unitOfWork.run(() => {
          assertActiveSession(deps);
          const current = findAssetOperation(deps.db, input.operationId) ?? findAsset(deps.db, input.id);
          if (current) {
            if (!matches(current)) throw new AppError(409, 'OPERATION_CONFLICT', '上传标识已用于不同内容。');
            return mediaDTO(current);
          }
          const asset = { ...input, size, sha256, state: 'ready' as const, createdAt: deps.now() };
          insertAsset(deps.db, asset);
          return mediaDTO(asset);
        });
        committed = true;
        return result;
      } finally {
        // Compensation must finish before another request can adopt this path.
        if (moved && !committed) await unlink(destination).catch(() => undefined);
      }
    });
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
