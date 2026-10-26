import type { Request, Response } from 'express';
import type { ApplicationRuntime } from '../../../app.js';
import type { RouteRegistry } from '../../../system/http/RouteRegistry.js';
import type { ExternalRequest } from '../../../system/network/SafeHttp.js';
import { safeRequest } from '../../../system/network/SafeHttp.js';
import { Chat, FetchBackground, ImportImageURL, GetHitokoto, GetRepositoryStats, GetIntegrationStatus, ResolveMusic, SearchMusic } from '../../../../shared/contracts/integrations/index.js';
import { plan as getStatus } from '../api/GetIntegrationStatusAPIMessage.js';
import { plan as searchMusic } from '../api/SearchMusicAPIMessage.js';
import { plan as resolveMusic } from '../api/ResolveMusicAPIMessage.js';
import { plan as getHitokoto } from '../api/GetHitokotoAPIMessage.js';
import { plan as fetchBackground } from '../api/FetchBackgroundAPIMessage.js';
import { plan as importImageURL } from '../api/ImportImageURLAPIMessage.js';
import { plan as getRepositoryStats } from '../api/GetRepositoryStatsAPIMessage.js';
import { plan as chat } from '../api/ChatAPIMessage.js';
import { plan as getMemo } from '../../memos/api/GetMemoAPIMessage.js';
import type { IntegrationConfig } from '../utils/IntegrationDependencies.js';

async function cancellable<T>(request: Request, response: Response, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.once('aborted', cancel); response.once('close', cancel);
  try { return await operation(controller.signal); }
  finally { request.removeListener('aborted', cancel); response.removeListener('close', cancel); }
}

export function registerIntegrationRoutes(registry: RouteRegistry, runtime: ApplicationRuntime, config: IntegrationConfig, request: ExternalRequest = safeRequest): void {
  const dependencies = { config, request };
  registry.register({ contract: GetIntegrationStatus, access: 'owner', handler: () => getStatus(dependencies) });
  registry.register({ contract: GetRepositoryStats, access: 'public', transactional: false, handler: (_input, context) => cancellable(context.request, context.response, (signal) => getRepositoryStats(signal, dependencies)) });
  registry.register({ contract: SearchMusic, access: 'owner', transactional: false, handler: (input, context) => cancellable(context.request, context.response, (signal) => searchMusic(input, signal, dependencies)) });
  registry.register({ contract: ResolveMusic, access: 'owner', transactional: false, handler: (input, context) => cancellable(context.request, context.response, (signal) => resolveMusic(input, signal, dependencies)) });
  registry.register({ contract: GetHitokoto, access: 'public', transactional: false, handler: (input, context) => cancellable(context.request, context.response, (signal) => getHitokoto(input, signal, dependencies)) });
  registry.register({ contract: FetchBackground, access: 'owner', transactional: false, handler: (input, context) => cancellable(context.request, context.response, (signal) => fetchBackground(input, signal, { ...dependencies, media: { ...runtime, principal: context.principal } })) });
  registry.register({ contract: ImportImageURL, access: 'owner', transactional: false, handler: (input, context) => cancellable(context.request, context.response, (signal) => importImageURL(input, signal, { ...dependencies, media: { ...runtime, principal: context.principal } })) });
  registry.register({ contract: Chat, access: 'owner', transactional: false, handler: (input, context) => cancellable(context.request, context.response, (signal) => chat(input, context.response, signal, {
    ...dependencies,
    readContext: (ids) => runtime.unitOfWork.run(() => ids.map((id) => getMemo({ id }, { ...runtime, principal: context.principal }).content)),
  })) });
}
