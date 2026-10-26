import { z } from 'zod';
import { defineContract } from '../api.js';

export const MemoIdSchema = z.string().uuid();
export const OperationIdSchema = z.string().uuid();
export const MemoAttachmentSchema = z.object({
  mediaId: z.string().uuid(),
  kind: z.enum(['image', 'audio', 'file']),
}).strict();
export const MemoSchema = z.object({
  id: MemoIdSchema,
  content: z.string().max(200_000),
  tags: z.array(z.string().min(1).max(80)).max(100),
  links: z.array(MemoIdSchema).max(100),
  backlinks: z.array(MemoIdSchema),
  attachments: z.array(MemoAttachmentSchema).max(100),
  isPublic: z.boolean(),
  isPinned: z.boolean(),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type MemoDTO = z.infer<typeof MemoSchema>;
export type MemoAttachmentDTO = z.infer<typeof MemoAttachmentSchema>;

const writable = {
  content: z.string().min(1).max(200_000).refine((value) => value.trim().length > 0, 'Content is required'),
  tags: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  links: z.array(MemoIdSchema).max(100).optional(),
  attachments: z.array(MemoAttachmentSchema).max(100).default([]),
};
const writeIdentity = { id: MemoIdSchema, operationId: OperationIdSchema };
const updateIdentity = { ...writeIdentity, baseRevision: z.number().int().positive() };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
export const CreateMemoInputSchema = z.object({
  ...writeIdentity, ...writable, isPublic: z.boolean().default(false), isPinned: z.boolean().default(false),
}).strict();
export const UpdateMemoInputSchema = z.object({ ...updateIdentity, ...writable }).strict();
export const DeleteMemoInputSchema = z.object(updateIdentity).strict();
export const SetMemoPinInputSchema = z.object({ ...updateIdentity, isPinned: z.boolean() }).strict();
export const SetMemoVisibilityInputSchema = z.object({ ...updateIdentity, isPublic: z.boolean() }).strict();
export const ListMemosInputSchema = z.object({
  offset: z.coerce.number().int().min(0).max(10_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().max(500).optional(),
  tag: z.string().min(1).max(80).optional(),
  from: day.optional(),
  to: day.optional(),
}).strict().refine((input) => !input.from || !input.to || input.from <= input.to, 'Invalid date range');
export const ListMemosOutputSchema = z.object({
  items: z.array(MemoSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  nextOffset: z.number().int().nonnegative().nullable(),
}).strict();
export const MemoTombstoneSchema = z.object({ id: MemoIdSchema, revision: z.number().int().positive(), deletedAt: z.string().datetime() }).strict();
export const GetMemoChangesInputSchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(100),
}).strict();
export const GetMemoChangesOutputSchema = z.object({
  changes: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('updated'), sequence: z.number().int().positive(), memo: MemoSchema }).strict(),
    z.object({ kind: z.literal('deleted'), sequence: z.number().int().positive(), tombstone: MemoTombstoneSchema }).strict(),
  ])),
  nextCursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
}).strict();
export const CreateMemo = defineContract('POST', '/api/memos', CreateMemoInputSchema, MemoSchema);
export const ListMemos = defineContract('GET', '/api/memos', ListMemosInputSchema, ListMemosOutputSchema);
export const GetMemo = defineContract('GET', '/api/memos/:id', z.object({ id: MemoIdSchema }).strict(), MemoSchema);
export const UpdateMemo = defineContract('PATCH', '/api/memos/:id', UpdateMemoInputSchema, MemoSchema);
export const DeleteMemo = defineContract('DELETE', '/api/memos/:id', DeleteMemoInputSchema, MemoTombstoneSchema);
export const SetMemoPin = defineContract('PATCH', '/api/memos/:id/pin', SetMemoPinInputSchema, MemoSchema);
export const SetMemoVisibility = defineContract('PATCH', '/api/memos/:id/visibility', SetMemoVisibilityInputSchema, MemoSchema);
export const GetMemoChanges = defineContract('GET', '/api/memos/changes', GetMemoChangesInputSchema, GetMemoChangesOutputSchema);

export const MemosSnapshotSchema = z.object({
  memos: z.array(MemoSchema).max(5000),
  tombstones: z.array(MemoTombstoneSchema).max(5000),
  pinOrder: z.array(MemoIdSchema).max(5000),
}).strict().superRefine((snapshot,context) => {
  const ids=new Set(snapshot.memos.map((memo) => memo.id));
  const deleted=new Set(snapshot.tombstones.map((tombstone) => tombstone.id));
  const pinned=new Set(snapshot.pinOrder);
  if (ids.size!==snapshot.memos.length || deleted.size!==snapshot.tombstones.length || pinned.size!==snapshot.pinOrder.length) context.addIssue({ code: 'custom',message: 'Duplicate memo identity' });
  if ([...deleted].some((id) => ids.has(id))) context.addIssue({ code: 'custom',message: 'Live and deleted memo identities overlap' });
  if (snapshot.pinOrder.some((id) => !ids.has(id)) || snapshot.memos.some((memo) => memo.isPinned!==pinned.has(memo.id))) context.addIssue({ code: 'custom',message: 'Inconsistent pin order' });
  for (const memo of snapshot.memos) {
    if (memo.updatedAt<memo.createdAt) context.addIssue({ code: 'custom',message: 'Invalid memo chronology' });
    if (memo.links.some((id) => !ids.has(id)||id===memo.id) || new Set(memo.links).size!==memo.links.length || new Set(memo.tags).size!==memo.tags.length || new Set(memo.attachments.map((attachment) => attachment.mediaId)).size!==memo.attachments.length) context.addIssue({ code: 'custom',message: 'Invalid memo relations' });
  }
});
export type MemosSnapshot = z.infer<typeof MemosSnapshotSchema>;
