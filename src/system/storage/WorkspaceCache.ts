import { z } from 'zod';

import { MemoSchema } from '../../../shared/contracts/memos';

import type { Memo, MemoInput } from '../../objects/memos/Memo';

const memoInputSchema = MemoSchema.pick({ id: true, content: true, tags: true, links: true, attachments: true, isPublic: true, isPinned: true }).extend({ baseRevision: z.number().int().nonnegative().optional() });
const memoSchema = MemoSchema;
const mutationSchema = z.object({
  operationId: z.string(), memoId: z.string(), baseRevision: z.number().int().nonnegative(),
  kind: z.enum(['create', 'update', 'pin', 'visibility', 'delete']), input: memoInputSchema.nullable(), createdAt: z.string(),
  status: z.enum(['pending', 'conflict', 'invalid']), message: z.string().nullable(), remote: memoSchema.nullable(),
});

export type PendingMemoMutation = z.infer<typeof mutationSchema>;

const draftSchema = memoInputSchema.omit({ id: true, isPinned: true });
export { draftSchema as MemoDraftSchema };
export type MemoDraft = z.infer<typeof draftSchema>;

const workspaceSchema = z.object({
  version: z.literal(1), memos: z.array(memoSchema), cursor: z.number().int().nonnegative(),
  outbox: z.array(mutationSchema), drafts: z.record(z.string(), draftSchema),
  deletedDraftIds: z.array(z.string().uuid()).default([]),
});

export type WorkspaceCache = z.infer<typeof workspaceSchema>;
export type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createWorkspaceCache(): WorkspaceCache {
  return { version: 1, memos: [], cursor: 0, outbox: [], drafts: {}, deletedDraftIds: [] };
}

export function workspaceCacheKey(instanceId: string, subject: 'owner' | 'anonymous'): string {
  return `meow:v2:${encodeURIComponent(instanceId)}:${subject}:workspace`;
}

export function readWorkspaceCache(storage: BrowserStorage, key: string): WorkspaceCache {
  const raw = storage.getItem(key);
  if (!raw) return createWorkspaceCache();
  try {
    const result = workspaceSchema.safeParse(JSON.parse(raw));
    if (!result.success) throw new Error('缓存格式不受支持，请先导出本地内容后重试。');
    return result.data;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('本地缓存无法读取，请保留浏览器数据并重试。', { cause: error });
    throw error;
  }
}

// Cache, draft and pending operations share one localStorage replacement: a failed write
// never removes the previous version or falsely acknowledges a pending operation.
export function writeWorkspaceCache(storage: BrowserStorage, key: string, cache: WorkspaceCache): void {
  storage.setItem(key, JSON.stringify(workspaceSchema.parse(cache)));
}

export function queueMemoSave(cache: WorkspaceCache, input: MemoInput, operationId: string, now: string, kind?: 'pin' | 'visibility'): WorkspaceCache {
  const current = projectMemos(cache).find((memo) => memo.id === input.id);
  const invalid = cache.outbox.find((operation) => operation.memoId === input.id && operation.status === 'invalid');
  const pending: PendingMemoMutation = {
    operationId, memoId: input.id, baseRevision: input.baseRevision ?? current?.revision ?? 0,
    kind: kind ?? (current ? 'update' : 'create'), input, createdAt: now, status: 'pending', message: null, remote: null,
  };
  const drafts = { ...cache.drafts };
  delete drafts[input.id];
  if (invalid && !kind) {
    const replacement: PendingMemoMutation = { ...pending, kind: invalid.kind === 'create' ? 'create' : 'update', baseRevision: input.baseRevision ?? invalid.baseRevision };
    return { ...cache, outbox: [...cache.outbox.filter((operation) => operation.memoId !== input.id), replacement], drafts };
  }
  return { ...cache, outbox: [...cache.outbox, pending], drafts };
}

export function queueMemoDelete(cache: WorkspaceCache, memo: Memo, operationId: string, now: string): WorkspaceCache {
  const pending: PendingMemoMutation = {
    operationId, memoId: memo.id, baseRevision: memo.revision, kind: 'delete', input: null,
    createdAt: now, status: 'pending', message: null, remote: null,
  };
  return { ...cache, outbox: [...cache.outbox, pending] };
}

export function projectMemos(cache: WorkspaceCache): Memo[] {
  const projected = new Map(cache.memos.map((memo) => [memo.id, memo]));
  for (const operation of cache.outbox) {
    if (operation.kind === 'delete') {
      projected.delete(operation.memoId);
    } else if (operation.input) {
      const previous = projected.get(operation.memoId);
      projected.set(operation.memoId, {
        ...operation.input, backlinks: previous?.backlinks ?? [], revision: previous?.revision ?? operation.baseRevision,
        createdAt: previous?.createdAt ?? operation.createdAt, updatedAt: operation.createdAt,
      });
    }
  }
  return [...projected.values()];
}

export function acknowledgeMemoMutation(cache: WorkspaceCache, operationId: string, result: Memo | null, cursor: number): WorkspaceCache {
  const operation = cache.outbox.find((entry) => entry.operationId === operationId);
  if (!operation) return cache;
  const remaining = cache.outbox.filter((entry) => entry.operationId !== operationId);
  const next = remaining.find((entry) => entry.memoId === operation.memoId);
  return {
    ...cache,
    memos: [...cache.memos.filter((memo) => memo.id !== operation.memoId), ...(result ? [result] : [])],
    cursor: Math.max(cache.cursor, cursor),
    deletedDraftIds: !result && operation.kind === 'delete' && cache.drafts[operation.memoId] ? [...new Set([...cache.deletedDraftIds, operation.memoId])] : cache.deletedDraftIds,
    outbox: remaining.map((entry) => entry === next ? { ...entry, baseRevision: result?.revision ?? 0 } : entry),
  };
}

export function markMemoConflict(cache: WorkspaceCache, operationId: string, message: string, remote: Memo | null): WorkspaceCache {
  return { ...cache, outbox: cache.outbox.map((entry) => entry.operationId === operationId ? { ...entry, status: 'conflict', message, remote } : entry) };
}

export function markMemoInvalid(cache: WorkspaceCache, operationId: string, message: string): WorkspaceCache {
  return { ...cache, outbox: cache.outbox.map((entry) => entry.operationId === operationId ? { ...entry, status: 'invalid', message } : entry) };
}

export function discardMemoChanges(cache: WorkspaceCache, memoId: string): WorkspaceCache {
  const conflict = cache.outbox.find((entry) => entry.memoId === memoId && entry.status === 'conflict');
  return {
    ...cache, outbox: cache.outbox.filter((entry) => entry.memoId !== memoId),
    memos: conflict ? [...cache.memos.filter((memo) => memo.id !== memoId), ...(conflict.remote ? [conflict.remote] : [])] : cache.memos,
  };
}

export function retryMemoConflict(cache: WorkspaceCache, memoId: string, operationId: string): WorkspaceCache {
  const conflict = cache.outbox.find((entry) => entry.memoId === memoId && entry.status === 'conflict');
  if (!conflict) return cache;
  // A server deletion is never converted into an implicit re-create. A user can
  // copy the retained text into a new memo with a new identity instead.
  if (!conflict.remote) throw new Error('这条笔记已在远端删除。请复制保留的文字并新建笔记。');
  return {
    ...cache,
    outbox: cache.outbox.map((entry) => entry === conflict ? {
      ...entry, operationId, baseRevision: conflict.remote?.revision ?? 0,
      status: 'pending', message: null, remote: null,
    } : entry),
  };
}


export function recoverDeletedDraft(cache: WorkspaceCache, memoId: string): WorkspaceCache {
  const draft = cache.drafts[memoId];
  if (!draft || !cache.deletedDraftIds.includes(memoId)) throw new Error('这份删除笔记草稿已不可用。');
  const restored = recoverExternalDraft(cache, draft);
  const drafts = { ...restored.drafts };
  delete drafts[memoId];
  return { ...restored, drafts, deletedDraftIds: cache.deletedDraftIds.filter((id) => id !== memoId) };
}

export function recoverExternalDraft(cache: WorkspaceCache, draft: MemoDraft): WorkspaceCache {
  const existing = cache.drafts.new;
  if (existing && (existing.content.length || existing.tags.length || existing.links.length || existing.attachments.length || existing.isPublic)) {
    throw new Error('新笔记编辑框已有草稿，请先保存或处理它，再恢复这份草稿。');
  }
  return { ...cache, drafts: { ...cache.drafts, new: { ...draftSchema.parse(draft), baseRevision: 0 } } };
}

export function discardDeletedDraft(cache: WorkspaceCache, memoId: string): WorkspaceCache {
  const drafts = { ...cache.drafts };
  delete drafts[memoId];
  return { ...cache, drafts, deletedDraftIds: cache.deletedDraftIds.filter((id) => id !== memoId) };
}
