import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { ensurePendingMediaUploaded, releasePendingMedia } from '../../../features/media/pendingMedia';
import { MemoSchema } from '../../../../shared/contracts/memos';
import { CreateMemoAPI } from '../../../apis/memos/CreateMemoAPI';
import { DeleteMemoAPI } from '../../../apis/memos/DeleteMemoAPI';
import { GetMemoChangesAPI } from '../../../apis/memos/GetMemoChangesAPI';
import { ListMemosAPI } from '../../../apis/memos/ListMemosAPI';
import { SetMemoPinAPI } from '../../../apis/memos/SetMemoPinAPI';
import { SetMemoVisibilityAPI } from '../../../apis/memos/SetMemoVisibilityAPI';
import { UpdateMemoAPI } from '../../../apis/memos/UpdateMemoAPI';
import type { Session } from '../../../objects/identity/Session';
import type { Memo, MemoInput } from '../../../objects/memos/Memo';
import { ApiError } from '../../../system/api/sendAPI';
import { useStorageWriter } from '../../../system/storage/useStorageWriter';
import {
  acknowledgeMemoMutation, createWorkspaceCache, discardDeletedDraft, discardMemoChanges, recoverDeletedDraft, recoverExternalDraft as recoverExternalDraftCache, markMemoConflict, markMemoInvalid,
  projectMemos, queueMemoDelete, queueMemoSave, readWorkspaceCache, retryMemoConflict,
  workspaceCacheKey, writeWorkspaceCache, type PendingMemoMutation, type WorkspaceCache, type MemoDraft,
} from '../../../system/storage/WorkspaceCache';

const conflictSchema = z.object({ current: MemoSchema.nullable() });
export type SyncStatus = 'loading' | 'ready' | 'syncing' | 'offline' | 'error';

async function submitMutation(operation: PendingMemoMutation, signal: AbortSignal): Promise<Memo | null> {
  const identity = { id: operation.memoId, operationId: operation.operationId, baseRevision: operation.baseRevision };
  if (operation.kind === 'delete') { await DeleteMemoAPI(identity, signal); return null; }
  const input = operation.input;
  if (!input) throw new Error('待提交内容不完整，请保留本地草稿。');
  if (operation.kind === 'create') return CreateMemoAPI({ id: input.id, content: input.content, tags: input.tags, links: input.links, attachments: input.attachments, isPublic: input.isPublic, isPinned: input.isPinned, operationId: operation.operationId }, signal);
  if (operation.kind === 'pin') return SetMemoPinAPI({ ...identity, isPinned: input.isPinned }, signal);
  if (operation.kind === 'visibility') return SetMemoVisibilityAPI({ ...identity, isPublic: input.isPublic }, signal);
  return UpdateMemoAPI({ ...identity, content: input.content, tags: input.tags, links: input.links, attachments: input.attachments }, signal);
}

export function useWorkspace(session: Session, onSessionExpired: () => void, localOnly = false) {
  const key = workspaceCacheKey(session.instanceId, session.principal);
  const writer = useStorageWriter(key);
  const { canWrite, assertWriter } = writer;
  const [initial] = useState(() => {
    try { return { cache: readWorkspaceCache(localStorage, key), error: '' }; }
    catch (error) { return { cache: createWorkspaceCache(), error: error instanceof Error ? error.message : '无法读取本地缓存。' }; }
  });
  const [cache, setCache] = useState<WorkspaceCache>(initial.cache);
  const cacheRef = useRef(cache);
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [error, setError] = useState(initial.error);
  const syncing = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const active = useRef(true);
  const onExpired = useRef(onSessionExpired);
  onExpired.current = onSessionExpired;

  const persist = useCallback((next: WorkspaceCache) => {
    assertWriter();
    if (initial.error) throw new Error(initial.error);
    try { writeWorkspaceCache(localStorage, key, next); }
    catch { throw new Error('本地存储空间不足或不可用。内容尚未保存，请复制文字后重试。'); }
    cacheRef.current = next;
    setCache(next);
  }, [initial.error, key, assertWriter]);

  const synchronize = useCallback(async () => {
    if (!canWrite) return;
    if (localOnly) { setStatus('offline'); return; }
    if (syncing.current || !active.current || initial.error) return;
    syncing.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setStatus('syncing');
    setError('');
    const stillCurrent = () => active.current && !controller.signal.aborted;
    try {
      if (session.principal === 'owner') {
        // Process sequentially. Later edits of an entity receive the confirmed
        // revision of their preceding operation, never a predicted device clock.
        while (stillCurrent()) {
          const blocked = new Set(cacheRef.current.outbox.filter((item) => item.status === 'conflict' || item.status === 'invalid').map((item) => item.memoId));
          const operation = cacheRef.current.outbox.find((item) => item.status === 'pending' && !blocked.has(item.memoId));
          if (!operation) break;
          try {
            await ensurePendingMediaUploaded(session.instanceId, operation.input?.attachments.map((attachment) => attachment.mediaId) ?? [], controller.signal);
            if (!stillCurrent()) return;
            const result = await submitMutation(operation, controller.signal);
            if (!stillCurrent()) return;
            persist(acknowledgeMemoMutation(cacheRef.current, operation.operationId, result, cacheRef.current.cursor));
            try { await releasePendingMedia(session.instanceId, operation.input?.attachments.map((attachment) => attachment.mediaId) ?? []); } catch { setError('笔记已提交，本机附件暂存清理失败，可在设置中重试清理。'); }
          } catch (cause) {
            if (cause instanceof ApiError && (cause.status === 400 || cause.status === 413)) {
              persist(markMemoInvalid(cacheRef.current, operation.operationId, cause.message));
              continue;
            }
            if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) {
              const details = conflictSchema.safeParse(cause.details);
              persist(markMemoConflict(cacheRef.current, operation.operationId, cause.message, details.success ? details.data.current : null));
              continue;
            }
            throw cause;
          }
        }
        let more = true;
        while (more && stillCurrent()) {
          const response = await GetMemoChangesAPI(cacheRef.current.cursor, controller.signal);
          const memos = new Map(cacheRef.current.memos.map((memo) => [memo.id, memo]));
          const deletedDraftIds = new Set(cacheRef.current.deletedDraftIds);
          for (const change of response.changes) {
            if (change.kind === 'deleted') {
              memos.delete(change.tombstone.id);
              if (cacheRef.current.drafts[change.tombstone.id]) deletedDraftIds.add(change.tombstone.id);
            }
            else memos.set(change.memo.id, change.memo);
          }
          if (!stillCurrent()) return;
          persist({ ...cacheRef.current, memos: [...memos.values()], deletedDraftIds: [...deletedDraftIds], cursor: response.nextCursor });
          more = response.hasMore;
        }
      } else {
        const memos: Memo[] = [];
        let offset: number | null = 0;
        while (offset !== null && stillCurrent()) {
          const response = await ListMemosAPI({ offset, limit: 100 }, controller.signal);
          memos.push(...response.items.filter((memo) => memo.isPublic));
          offset = response.nextOffset;
        }
        if (!stillCurrent()) return;
        persist({ ...createWorkspaceCache(), memos });
      }
      setStatus('ready');
    } catch (cause) {
      if (!active.current || controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) {
        setStatus('error'); setError('会话已失效。本地待提交内容已隔离保存，重新登录后可继续。');
        onExpired.current();
      } else {
        setStatus(cause instanceof ApiError && cause.status === 0 ? 'offline' : 'error');
        setError(cause instanceof Error ? cause.message : '同步未完成，待提交内容已保留。');
      }
    } finally {
      if (abort.current === controller) syncing.current = false;
    }
  }, [initial.error, persist, session.principal, session.instanceId, localOnly, canWrite]);

  useEffect(() => {
    active.current = true;
    if (canWrite && !initial.error) {
      try { const restored = readWorkspaceCache(localStorage, key); cacheRef.current = restored; setCache(restored); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取本地缓存。'); return; }
    }
    void synchronize();
    const online = () => void synchronize();
    const offline = () => setStatus('offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const interval = window.setInterval(online, 15_000);
    return () => {
      active.current = false; abort.current?.abort(); syncing.current = false;
      window.removeEventListener('online', online); window.removeEventListener('offline', offline);
      window.clearInterval(interval);
    };
  }, [synchronize, canWrite, initial.error, key]);

  useEffect(() => {
    if (canWrite) return;
    const reload = (event: StorageEvent) => {
      if (event.key !== key) return;
      try { const current = readWorkspaceCache(localStorage, key); cacheRef.current = current; setCache(current); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取本地缓存。'); }
    };
    window.addEventListener('storage', reload);
    return () => window.removeEventListener('storage', reload);
  }, [canWrite, key]);

  const save = useCallback((input: MemoInput, kind?: 'pin' | 'visibility') => {
    if (session.principal !== 'owner') throw new Error('请先登录。');
    const previous = projectMemos(cacheRef.current).find((memo) => memo.id === input.id);
    let next = queueMemoSave(cacheRef.current, input, crypto.randomUUID(), new Date().toISOString(), kind);
    if (!kind && previous && previous.isPublic !== input.isPublic) next = queueMemoSave(next, input, crypto.randomUUID(), new Date().toISOString(), 'visibility');
    persist(next);
    void synchronize();
  }, [persist, session.principal, synchronize]);

  const remove = useCallback((memo: Memo) => {
    if (session.principal !== 'owner') throw new Error('请先登录。');
    persist(queueMemoDelete(cacheRef.current, memo, crypto.randomUUID(), new Date().toISOString()));
    void synchronize();
  }, [persist, session.principal, synchronize]);

  const saveDraft = useCallback((id: string, draft: MemoDraft | string) => {
    if (session.principal !== 'owner') return;
    persist({ ...cacheRef.current, drafts: { ...cacheRef.current.drafts, [id]: typeof draft === 'string' ? { content: draft, tags: [], links: [], attachments: [], isPublic: false } : draft } });
  }, [persist, session.principal]);

  const discard = useCallback((memoId: string) => persist(discardMemoChanges(cacheRef.current, memoId)), [persist]);
  const retry = useCallback((memoId: string) => {
    persist(retryMemoConflict(cacheRef.current, memoId, crypto.randomUUID()));
    void synchronize();
  }, [persist, synchronize]);

  const recoverDraft = useCallback((memoId: string) => persist(recoverDeletedDraft(cacheRef.current, memoId)), [persist]);
  const recoverExternalDraft = useCallback((draft: MemoDraft) => persist(recoverExternalDraftCache(cacheRef.current, draft)), [persist]);
  const discardDraft = useCallback((memoId: string) => persist(discardDeletedDraft(cacheRef.current, memoId)), [persist]);

  return { recoverDraft, recoverExternalDraft, discardDraft, canWrite, writerPhase: writer.phase, memos: projectMemos(cache), cache, status, error, save, remove, saveDraft, synchronize, discard, retry };
}
