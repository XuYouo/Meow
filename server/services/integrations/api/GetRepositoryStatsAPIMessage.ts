import { z } from 'zod';
import { readExternalJson } from '../../../system/network/SafeHttp.js';
import type { IntegrationDependencies } from '../utils/IntegrationDependencies.js';
import { parseExternal } from '../utils/parseExternal.js';

export async function plan(signal: AbortSignal, deps: IntegrationDependencies) {
  const result = parseExternal(z.object({ stargazers_count: z.number().int().nonnegative() }), await readExternalJson(await deps.request('https://api.github.com/repos/y-shi23/MeowNocode', { signal, headers: { Accept: 'application/vnd.github+json' } })));
  return { stars: result.stargazers_count, url: 'https://github.com/y-shi23/MeowNocode' as const };
}
