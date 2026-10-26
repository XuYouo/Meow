import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { AppError } from '../../../system/errors/AppError.js';
import type { MediaDependencies } from '../utils/MediaDependencies.js';
import { readableAsset } from '../utils/access.js';
import { plan as assertActiveSession } from '../../identity/api/AssertActiveSessionAPIMessage.js';

export async function plan(input: { id: string }, range: string | undefined, response: Response, deps: Pick<MediaDependencies, 'db' | 'principal' | 'uploadsDir' | 'now'>): Promise<null> {
  const asset = readableAsset(input.id, deps);
  const file = path.join(deps.uploadsDir, `${asset.id}.bin`);
  const details = await stat(file).catch(() => { throw new AppError(503, 'MEDIA_UNAVAILABLE', '附件暂时不可用。'); });
  if (details.size !== asset.size) throw new AppError(503, 'MEDIA_UNAVAILABLE', '附件完整性检查失败。');
  // Recheck after asynchronous filesystem access: public access may have been revoked.
  readableAsset(input.id, deps);
  if (deps.principal.kind === 'owner') assertActiveSession(deps);
  let start = 0;
  let end = asset.size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) throw new AppError(416, 'INVALID_RANGE', '无效的文件范围。');
    if (!match[1]) start = Math.max(0, asset.size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= asset.size) {
      response.setHeader('Content-Range', `bytes */${asset.size}`);
      throw new AppError(416, 'INVALID_RANGE', '文件范围超出长度。');
    }
    response.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${asset.size}`);
  }
  response.setHeader('Content-Type', asset.mimeType);
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Length', end - start + 1);
  const inline = /^(image|audio)\//.test(asset.mimeType);
  response.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`);
  response.setHeader('Cache-Control', 'private, no-store');
  await pipeline(createReadStream(file, { start, end }), response);
  return null;
}
