import { z } from 'zod';

import { defineContract } from '../api.js';

export const SessionSchema = z.object({
  authenticated: z.boolean(),
  principal: z.enum(['owner', 'anonymous']),
  instanceId: z.string().uuid(),
}).strict();

export type Session = z.infer<typeof SessionSchema>;

export const sessionContract = defineContract('GET', '/api/session', z.object({}).strict(), SessionSchema);
export const loginContract = defineContract(
  'POST',
  '/api/session/login',
  z.object({ password: z.string().min(1).max(1024) }).strict(),
  SessionSchema,
);
export const logoutContract = defineContract('POST', '/api/session/logout', z.object({}).strict(), SessionSchema);
