import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { ImportImageURL } from '../../../../shared/contracts/integrations/index.js';
import type { IntegrationDependencies } from '../utils/IntegrationDependencies.js';
import type { MediaDependencies } from '../../media/utils/MediaDependencies.js';
import { importImage } from '../utils/importImage.js';

export async function plan(input: z.infer<typeof ImportImageURL.input>, signal: AbortSignal, deps: IntegrationDependencies & { media: MediaDependencies }) {
  const fileName = `image-${createHash('sha256').update(input.url).digest('hex').slice(0, 32)}`;
  return importImage({ ...input, fileName }, signal, deps);
}
