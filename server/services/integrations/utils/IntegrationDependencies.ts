import type { ExternalRequest } from '../../../system/network/SafeHttp.js';

export interface IntegrationConfig {
  readonly ai: { readonly baseUrl: string; readonly apiKey: string; readonly model: string } | null;
  readonly musicSearchUrl: string;
  readonly musicResolveUrl: string;
  readonly backgroundUrl: string;
  readonly hitokotoUrl: string;
}

export function readIntegrationConfig(environment: NodeJS.ProcessEnv = process.env): IntegrationConfig {
  const baseUrl = environment.MEOW_AI_BASE_URL;
  const apiKey = environment.MEOW_AI_API_KEY;
  const model = environment.MEOW_AI_MODEL;
  return {
    ai: baseUrl && apiKey && model ? { baseUrl, apiKey, model } : null,
    musicSearchUrl: environment.MEOW_MUSIC_SEARCH_URL ?? 'https://api.kxzjoker.cn/api/163_search',
    musicResolveUrl: environment.MEOW_MUSIC_RESOLVE_URL ?? 'https://api.kxzjoker.cn/api/163_music',
    backgroundUrl: environment.MEOW_BACKGROUND_URL ?? 'https://imgapi.xl0408.top/index.php',
    hitokotoUrl: environment.MEOW_HITOKOTO_URL ?? 'https://v1.hitokoto.cn/',
  };
}

export interface IntegrationDependencies {
  readonly config: IntegrationConfig;
  readonly request: ExternalRequest;
}
