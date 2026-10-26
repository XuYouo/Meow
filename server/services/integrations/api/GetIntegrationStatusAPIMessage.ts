import type { IntegrationDependencies } from '../utils/IntegrationDependencies.js';

export function plan(dependencies: Pick<IntegrationDependencies, 'config'>) {
  const config = dependencies.config;
  return { aiConfigured: config.ai !== null, aiModel: config.ai?.model ?? null, musicConfigured: Boolean(config.musicSearchUrl && config.musicResolveUrl), backgroundConfigured: Boolean(config.backgroundUrl), hitokotoConfigured: Boolean(config.hitokotoUrl) };
}
