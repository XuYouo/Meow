import { z } from 'zod';
import { defineContract } from '../api.js';
import { MediaSchema } from '../media/index.js';

export const GetIntegrationStatus = defineContract('GET', '/api/integrations/status', z.object({}).strict(), z.object({
  aiConfigured: z.boolean(), aiModel: z.string().nullable(), musicConfigured: z.boolean(), backgroundConfigured: z.boolean(), hitokotoConfigured: z.boolean(),
}).strict());
export const SongSchema = z.object({
  sourceId: z.string().min(1).max(100), title: z.string().max(300), artist: z.string().max(300), album: z.string().max(300),
  coverUrl: z.string().url().nullable(), audioUrl: z.string().url().nullable(), lyrics: z.string().max(500_000),
}).strict();
export type SongDTO = z.infer<typeof SongSchema>;
export const SearchMusic = defineContract('GET', '/api/integrations/music/search', z.object({ query: z.string().trim().min(1).max(200), limit: z.coerce.number().int().min(1).max(50).default(10) }).strict(), z.object({ items: z.array(SongSchema).max(50) }).strict());
export const ResolveMusic = defineContract('GET', '/api/integrations/music/resolve', z.object({ sourceId: z.string().regex(/^\d{1,20}$/) }).strict(), SongSchema);
export const GetHitokoto = defineContract('GET', '/api/integrations/hitokoto', z.object({ types: z.string().regex(/^[a-l](,[a-l])*$/).max(23).optional() }).strict(), z.object({ text: z.string().max(1000), source: z.string().max(300) }).strict());
export const FetchBackground = defineContract('POST', '/api/integrations/background', z.object({ id: z.string().uuid(), operationId: z.string().uuid() }).strict(), MediaSchema);
export const ImportImageURL = defineContract('POST', '/api/integrations/images/import', z.object({ id: z.string().uuid(), operationId: z.string().uuid(), url: z.string().url().max(4096) }).strict(), MediaSchema);
export const GetRepositoryStats = defineContract('GET', '/api/integrations/repository', z.object({}).strict(), z.object({ stars: z.number().int().nonnegative(), url: z.literal('https://github.com/y-shi23/MeowNocode') }).strict());
export const ChatInputSchema = z.object({
  mode: z.enum(['continue', 'optimize', 'chat']),
  prompt: z.string().min(1).max(50_000),
  model: z.string().min(1).max(200).optional(),
  contextMemoIds: z.array(z.string().uuid()).max(100).default([]),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(50_000) }).strict()).max(40).default([]),
}).strict();
/** Normalized SSE: {delta:string}, {done:true}, or {error:string}. */
export const Chat = defineContract('POST', '/api/integrations/chat', ChatInputSchema, z.null());
