import { AppError } from '../../../system/errors/AppError.js';
import type { IntegrationDependencies } from '../utils/IntegrationDependencies.js';
import type { MediaDependencies } from '../../media/utils/MediaDependencies.js';
import { importImage } from '../utils/importImage.js';

export async function plan(input: { id: string; operationId: string }, signal: AbortSignal, deps: IntegrationDependencies & { media: MediaDependencies }) {
  if (!deps.config.backgroundUrl) throw new AppError(503, 'NOT_CONFIGURED', '尚未配置背景服务。');
  return importImage({ ...input, fileName: 'background', url: deps.config.backgroundUrl }, signal, deps);
}
