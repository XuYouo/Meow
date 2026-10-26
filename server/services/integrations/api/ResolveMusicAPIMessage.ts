import { AppError } from '../../../system/errors/AppError.js';
import { readExternalJson, resolvePublicTarget } from '../../../system/network/SafeHttp.js';
import type { IntegrationDependencies } from '../utils/IntegrationDependencies.js';
import { normalizeSong } from '../utils/normalizeSong.js';

export async function plan(input: { sourceId: string }, signal: AbortSignal, deps: IntegrationDependencies) {
  if (!deps.config.musicResolveUrl) throw new AppError(503, 'NOT_CONFIGURED', '尚未配置音乐解析。');
  const url = new URL(deps.config.musicResolveUrl);
  url.searchParams.set('ids', input.sourceId); url.searchParams.set('level', 'exhigh'); url.searchParams.set('type', 'json');
  const song = normalizeSong(await readExternalJson(await deps.request(url.href, { signal })), input.sourceId);
  if (!song.audioUrl) throw new AppError(502, 'NO_AUDIO_URL', '这首歌曲暂时没有可用播放地址。');
  await resolvePublicTarget(song.audioUrl);
  return song;
}
