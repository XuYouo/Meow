import { z } from 'zod';
import { AppError } from '../../../system/errors/AppError.js';
import { readExternalJson } from '../../../system/network/SafeHttp.js';
import type { IntegrationDependencies } from '../utils/IntegrationDependencies.js';
import { parseExternal } from '../utils/parseExternal.js';

export async function plan(input: { types?: string }, signal: AbortSignal, deps: IntegrationDependencies) {
  if (!deps.config.hitokotoUrl) throw new AppError(503, 'NOT_CONFIGURED', '尚未配置一言服务。');
  const url = new URL(deps.config.hitokotoUrl);
  if (input.types) { url.searchParams.delete('c'); for (const type of new Set(input.types.split(','))) url.searchParams.append('c', type); }
  const result = parseExternal(z.object({ hitokoto: z.string().max(1000), from: z.string().max(300).nullable().optional() }), await readExternalJson(await deps.request(url.href, { signal })));
  return { text: result.hitokoto, source: result.from ?? '' };
}
