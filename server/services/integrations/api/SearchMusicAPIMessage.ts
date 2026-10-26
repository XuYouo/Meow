import { z } from 'zod';
import { AppError } from '../../../system/errors/AppError.js';
import { readExternalJson } from '../../../system/network/SafeHttp.js';
import type { IntegrationDependencies } from '../utils/IntegrationDependencies.js';
import { normalizeSong } from '../utils/normalizeSong.js';
import { parseExternal } from '../utils/parseExternal.js';

export async function plan(input: { query: string; limit: number }, signal: AbortSignal, deps: IntegrationDependencies) {
  if (!deps.config.musicSearchUrl) throw new AppError(503, 'NOT_CONFIGURED', '尚未配置音乐搜索。');
  const url = new URL(deps.config.musicSearchUrl);
  url.searchParams.set('name', input.query);
  url.searchParams.set('limit', String(input.limit));
  const data = parseExternal(z.object({ code: z.coerce.number(), data: z.array(z.unknown()).max(1000) }), await readExternalJson(await deps.request(url.href, { signal })));
  if (data.code !== 200) throw new AppError(502, 'INVALID_EXTERNAL_RESPONSE', '音乐搜索失败。');
  return { items: data.data.slice(0, input.limit).map((song) => normalizeSong(song)) };
}
