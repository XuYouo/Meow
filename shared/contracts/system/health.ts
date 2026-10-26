import { z } from 'zod';
import { defineContract } from '../api.js';

export const healthContract = defineContract('GET', '/api/health', z.object({}).strict(), z.object({
  status: z.literal('ready'),
  instanceId: z.string().uuid(),
  schemaVersion: z.literal(1),
}).strict());
