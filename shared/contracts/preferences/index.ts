import { z } from 'zod';
import { defineContract } from '../api.js';

export const TimezoneSchema = z.string().min(1).max(100).refine((timezone) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); return true; } catch { return false; }
}, 'Invalid IANA timezone');

export const PreferenceValuesSchema = z.object({
  title: z.string().trim().min(1).max(60),
  theme: z.enum(['system', 'light', 'dark']),
  accentColor: z.union([z.string().regex(/^#[a-fA-F0-9]{6}$/), z.enum(['pink', 'blue', 'green', 'purple', 'orange'])]),
  font: z.object({ family: z.enum(['system', 'serif', 'mono', 'jinghua', 'lxgw', 'kongshan']), size: z.number().int().min(10).max(32), lineHeight: z.number().min(1).max(2.5) }).strict(),
  background: z.object({ mode: z.enum(['none', 'color', 'image']), color: z.string().regex(/^#[a-fA-F0-9]{6}$/), mediaId: z.string().uuid().nullable(), fit: z.enum(['cover', 'contain']), opacity: z.number().min(0).max(1), brightness: z.number().int().min(0).max(100).default(50), blur: z.number().int().min(0).max(50).default(10), useRandom: z.boolean().default(false) }).strict()
    .refine((background) => background.mode === 'image' ? background.mediaId !== null : background.mediaId === null, 'An image background requires exactly one media reference'),
  avatarMediaId: z.string().uuid().nullable(),
  hitokotoEnabled: z.boolean(),
  hitokotoTypes: z.array(z.enum(['a', 'b', 'c', 'd', 'i', 'j', 'k'])).min(1).max(7).refine((values) => new Set(values).size === values.length, 'Duplicate quote categories').default(['a', 'b', 'c', 'd', 'i', 'j', 'k']),
  aiEnabled: z.boolean().default(false),
  aiModel: z.string().trim().max(200).default(''),
  musicEnabled: z.boolean().default(true),
  reviewTimezone: TimezoneSchema,
}).strict();
export const PreferencesSchema = PreferenceValuesSchema.extend({ revision: z.number().int().nonnegative(), updatedAt: z.string().datetime() });
export const PublicPreferencesSchema = PreferencesSchema.omit({ reviewTimezone: true, aiEnabled: true, aiModel: true, musicEnabled: true });
export type PreferencesDTO = z.infer<typeof PreferencesSchema>;
export type PreferenceValues = z.infer<typeof PreferenceValuesSchema>;
export type PublicPreferencesDTO = z.infer<typeof PublicPreferencesSchema>;

export const GetPreferences = defineContract('GET', '/api/preferences', z.object({}).strict(), PreferencesSchema);
export const GetPublicPreferences = defineContract('GET', '/api/preferences/public', z.object({}).strict(), PublicPreferencesSchema);
export const UpdatePreferences = defineContract('PATCH', '/api/preferences', z.object({ values: PreferenceValuesSchema, baseRevision: z.number().int().nonnegative(), operationId: z.string().uuid() }).strict(), PreferencesSchema);
