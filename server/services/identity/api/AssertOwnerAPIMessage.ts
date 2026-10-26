import type { Principal } from '../../../system/auth/Principal.js';
import { AppError } from '../../../system/errors/AppError.js';

export function plan({ principal }: { readonly principal: Principal }): void {
  if (principal.kind !== 'owner') throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required.');
}
