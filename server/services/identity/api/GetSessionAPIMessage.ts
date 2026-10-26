import type { Principal } from '../../../system/auth/Principal.js';

export function plan(dependencies: { principal: Principal; instanceId: string }) {
  return { authenticated: dependencies.principal.kind === 'owner', principal: dependencies.principal.kind, instanceId: dependencies.instanceId };
}
