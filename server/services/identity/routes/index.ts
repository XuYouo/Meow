import type Database from 'better-sqlite3';
import type { Request } from 'express';
import { sessionContract, loginContract, logoutContract } from '../../../../shared/contracts/identity/index.js';
import type { ServerConfig } from '../../../system/config.js';
import type { RouteRegistry } from '../../../system/http/RouteRegistry.js';
import { plan as getSession } from '../api/GetSessionAPIMessage.js';
import { plan as login } from '../api/LoginAPIMessage.js';
import { plan as logout } from '../api/LogoutAPIMessage.js';
import { plan as resolveSession } from '../api/ResolveSessionAPIMessage.js';
import { AttemptLimiter } from '../utils/AttemptLimiter.js';

export const SESSION_COOKIE = 'meow_v2_session';

function tokenFromRequest(request: Request): string | undefined {
  const cookie = request.get('cookie');
  if (!cookie) return undefined;
  const entry = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return entry?.slice(SESSION_COOKIE.length + 1);
}

export function createIdentity(dependencies: { db: Database.Database; config: Omit<ServerConfig, 'ownerPassword'>; enabled: boolean; instanceId: string; now: () => string }) {
  const enabled = dependencies.enabled;
  const limiter = new AttemptLimiter(() => Date.parse(dependencies.now()));
  const resolvePrincipal = (request: Request) => resolveSession(tokenFromRequest(request), { ...dependencies, enabled });
  const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, secure: dependencies.config.production, path: '/api' };
  return {
    resolvePrincipal,
    register(registry: RouteRegistry) {
      registry.register({
        contract: sessionContract,
        access: 'public',
        handler: (_input, context) => getSession({ principal: context.principal, instanceId: dependencies.instanceId }),
      });
      registry.register({
        contract: loginContract,
        access: 'public',
        handler: (input, context) => {
          const result = login(input, {
            ...dependencies,
            enabled,
            ttlMs: dependencies.config.sessionTtlMs,
            address: context.request.ip || 'unknown',
            limiter,
            principal: context.principal,
          });
          context.response.cookie(SESSION_COOKIE, result.token, { ...cookieOptions, expires: new Date(result.expiresAt) });
          return { authenticated: true, principal: 'owner' as const, instanceId: dependencies.instanceId };
        },
      });
      registry.register({
        contract: logoutContract,
        access: 'public',
        handler: (_input, context) => {
          logout({ ...dependencies, principal: context.principal });
          context.response.clearCookie(SESSION_COOKIE, cookieOptions);
          return { authenticated: false, principal: 'anonymous' as const, instanceId: dependencies.instanceId };
        },
      });
    },
  };
}
