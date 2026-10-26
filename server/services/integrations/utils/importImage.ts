import { Readable } from 'node:stream';
import { AppError } from '../../../system/errors/AppError.js';
import { readLimited } from '../../../system/network/SafeHttp.js';
import { plan as uploadMedia } from '../../media/api/UploadMediaAPIMessage.js';
import { plan as findUploadedMedia } from '../../media/api/FindUploadedMediaAPIMessage.js';
import type { MediaDependencies } from '../../media/utils/MediaDependencies.js';
import type { IntegrationDependencies } from './IntegrationDependencies.js';

export async function importImage(input: { id: string; operationId: string; fileName: string; url: string }, signal: AbortSignal, deps: IntegrationDependencies & { media: MediaDependencies }) {
  const existing = await findUploadedMedia(input, deps.media);
  if (existing) return existing;
  const response = await deps.request(input.url, { signal });
  const mimeType = response.headers['content-type']?.split(';')[0]?.trim();
  const supported = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'] as const;
  if (response.status !== 200 || !supported.some((type) => type === mimeType)) {
    response.body.destroy();
    throw new AppError(502, 'INVALID_IMAGE', '外部服务没有返回支持的图片。');
  }
  const bytes = await readLimited(response, 10 * 1024 * 1024);
  return uploadMedia({ id: input.id, operationId: input.operationId, fileName: input.fileName, mimeType: mimeType as typeof supported[number] }, Readable.from([bytes]), deps.media);
}
