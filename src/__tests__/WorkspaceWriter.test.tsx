// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspace } from '../pages/Index/hooks/useWorkspace';
import { createWorkspaceCache, readWorkspaceCache, workspaceCacheKey, writeWorkspaceCache } from '../system/storage/WorkspaceCache';

const api = vi.hoisted(() => ({ changes: vi.fn(), create: vi.fn() }));
vi.mock('../apis/memos/GetMemoChangesAPI', () => ({ GetMemoChangesAPI: api.changes }));
vi.mock('../apis/memos/CreateMemoAPI', () => ({ CreateMemoAPI: api.create }));
vi.mock('../features/media/pendingMedia', () => ({ ensurePendingMediaUploaded: vi.fn().mockResolvedValue(undefined), releasePendingMedia: vi.fn().mockResolvedValue(undefined) }));

// Deterministic implementation of Web Locks exclusivity and waiting/abort
// semantics. Two hook lifetimes share this origin's single manager.
class TestLocks {
  private held = new Set<string>();
  private waiting: { name: string; signal: AbortSignal; run: () => void; reject: (error: Error) => void }[] = [];
  request(name: string, options: { signal: AbortSignal }, callback: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const signal = options.signal;
      const run = () => {
        if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
        this.held.add(name);
        void callback().then(resolve, reject).finally(() => {
          this.held.delete(name);
          const next = this.waiting.find((entry) => entry.name === name && !entry.signal.aborted);
          if (next) { this.waiting = this.waiting.filter((entry) => entry !== next); next.run(); }
        });
      };
      signal.addEventListener('abort', () => { this.waiting = this.waiting.filter((entry) => entry.signal !== signal); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      if (this.held.has(name)) this.waiting.push({ name, signal, run, reject }); else run();
    });
  }
}
const session = { authenticated: true, principal: 'owner' as const, instanceId: '84c8ff35-fe4a-470f-9bac-dfb2a68af76b' };
const key = workspaceCacheKey(session.instanceId, 'owner');
const draft = { content: '离线未提交正文', tags: [], links: [], attachments: [], isPublic: false };
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); Object.defineProperty(navigator, 'locks', { configurable: true, value: new TestLocks() });
  api.changes.mockResolvedValue({ changes: [], hasMore: false, nextCursor: 0 });
});
afterEach(() => { cleanup(); });

describe('one durable workspace writer per origin and principal', () => {
  it('rejects a second tab writing drafts or outbox and hands off the latest persisted state after close', async () => {
    const first = renderHook(() => useWorkspace(session, vi.fn(), true));
    await waitFor(() => expect(first.result.current.canWrite).toBe(true));
    const second = renderHook(() => useWorkspace(session, vi.fn(), true));
    await waitFor(() => expect(second.result.current.writerPhase).toBe('waiting'));
    act(() => first.result.current.saveDraft('new', draft));
    expect(() => second.result.current.saveDraft('new', { ...draft, content: '不应覆盖' })).toThrow('只读');
    expect(() => second.result.current.save({ ...draft, id: crypto.randomUUID(), isPinned: false })).toThrow('只读');
    expect(readWorkspaceCache(localStorage, key).drafts.new?.content).toBe(draft.content);
    first.unmount();
    await waitFor(() => expect(second.result.current.canWrite).toBe(true));
    expect(second.result.current.cache.drafts.new?.content).toBe(draft.content);
    act(() => second.result.current.saveDraft('new', { ...draft, content: '接管后编辑' }));
    expect(readWorkspaceCache(localStorage, key).drafts.new?.content).toBe('接管后编辑');
    expect(api.changes).not.toHaveBeenCalled();
  });

  it('retains pending operation identity across offline reload and does not submit from a reader', async () => {
    const first = renderHook(() => useWorkspace(session, vi.fn(), true));
    await waitFor(() => expect(first.result.current.canWrite).toBe(true));
    const memoId = crypto.randomUUID(); act(() => first.result.current.save({ ...draft, id: memoId, isPinned: false }));
    const operationId = readWorkspaceCache(localStorage, key).outbox[0]?.operationId;
    const onlineReader = renderHook(() => useWorkspace(session, vi.fn(), false));
    await act(async () => {});
    expect(onlineReader.result.current.canWrite).toBe(false); expect(api.create).not.toHaveBeenCalled();
    first.unmount();
    api.create.mockImplementation(async () => { throw new Error('合成断网'); });
    await waitFor(() => expect(onlineReader.result.current.canWrite).toBe(true));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0]?.[0].operationId).toBe(operationId);
    expect(readWorkspaceCache(localStorage, key).outbox[0]?.operationId).toBe(operationId);
  });

  it('preserves an open edit as an explicitly recoverable draft only after a deletion tombstone', async () => {
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    const memo = { ...draft, id, backlinks: [], isPinned: false, revision: 4, createdAt: now, updatedAt: now };
    writeWorkspaceCache(localStorage, key, { ...createWorkspaceCache(), cursor: 4, memos: [memo], drafts: { [id]: { ...draft, content: '远端删除期间的本机编辑', baseRevision: 4 } } });
    api.changes.mockResolvedValue({ changes: [{ kind: 'deleted', sequence: 5, tombstone: { id, revision: 5, deletedAt: now } }], nextCursor: 5, hasMore: false });
    const hook = renderHook(() => useWorkspace(session, vi.fn(), false));
    await waitFor(() => expect(hook.result.current.cache.deletedDraftIds).toEqual([id]));
    expect(hook.result.current.memos).toEqual([]); expect(hook.result.current.cache.drafts[id]?.content).toBe('远端删除期间的本机编辑');
    hook.unmount();
    const offline = renderHook(() => useWorkspace(session, vi.fn(), true));
    await waitFor(() => expect(offline.result.current.canWrite).toBe(true));
    act(() => offline.result.current.recoverDraft(id));
    expect(offline.result.current.cache.drafts.new?.content).toBe('远端删除期间的本机编辑');
    expect(offline.result.current.cache.outbox).toEqual([]); expect(api.create).not.toHaveBeenCalled();
  });

  it('reads storage events without taking write ownership and fails closed when Web Locks is absent', async () => {
    const first = renderHook(() => useWorkspace(session, vi.fn(), true));
    await waitFor(() => expect(first.result.current.canWrite).toBe(true));
    const reader = renderHook(() => useWorkspace(session, vi.fn(), true));
    const updated = { ...createWorkspaceCache(), drafts: { new: draft } };
    act(() => { writeWorkspaceCache(localStorage, key, updated); window.dispatchEvent(new StorageEvent('storage', { key })); });
    expect(reader.result.current.cache.drafts.new?.content).toBe(draft.content);
    reader.unmount(); first.unmount();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    const unsupported = renderHook(() => useWorkspace(session, vi.fn(), true));
    await waitFor(() => expect(unsupported.result.current.writerPhase).toBe('unavailable'));
    expect(() => unsupported.result.current.saveDraft('new', draft)).toThrow('只读');
    expect(readWorkspaceCache(localStorage, key).drafts.new?.content).toBe(draft.content);
  });
});
