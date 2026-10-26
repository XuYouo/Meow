import { z } from 'zod';
import { defineContract } from '../api.js';
import { TimezoneSchema } from '../preferences/index.js';

export const ReviewDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((day) => {
  const at = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(at.valueOf()) && at.toISOString().slice(0, 10) === day;
}, 'Invalid calendar day');
export const ReviewResultSchema = z.object({
  memoId: z.string().uuid(),
  day: ReviewDaySchema,
  timezone: TimezoneSchema,
  result: z.enum(['PASS', 'FAIL']).nullable(),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime(),
}).strict();
export type ReviewResultDTO = z.infer<typeof ReviewResultSchema>;
const identity = { memoId: z.string().uuid(), day: ReviewDaySchema, timezone: TimezoneSchema, baseRevision: z.number().int().nonnegative(), operationId: z.string().uuid() };
export const RecordReview = defineContract('POST', '/api/review/results', z.object({ ...identity, result: z.enum(['PASS', 'FAIL']) }).strict(), ReviewResultSchema);
export const ResetReview = defineContract('DELETE', '/api/review/results', z.object(identity).strict(), ReviewResultSchema);
export const ListReviewResults = defineContract('GET', '/api/review/results', z.object({
  day: ReviewDaySchema.optional(), timezone: TimezoneSchema, offset: z.coerce.number().int().nonnegative().default(0), limit: z.coerce.number().int().min(1).max(500).default(100),
}).strict(), z.object({ items: z.array(ReviewResultSchema), total: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative().nullable() }).strict());

export const ResetReviewGroup = defineContract('POST', '/api/review/reset-group', z.object({
  day: ReviewDaySchema, timezone: TimezoneSchema,
  entries: z.array(z.object({ memoId: z.string().uuid(), baseRevision: z.number().int().nonnegative(), operationId: z.string().uuid() }).strict()).min(1).max(5000).refine((items) => new Set(items.map((item) => item.memoId)).size === items.length, 'Duplicate memo'),
}).strict(), z.object({items:z.array(ReviewResultSchema)}).strict());
