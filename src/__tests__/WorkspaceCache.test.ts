import { describe, expect, it } from 'vitest';

import type { Memo, MemoInput } from '../objects/memos/Memo';
import { acknowledgeMemoMutation, createWorkspaceCache, markMemoConflict, markMemoInvalid, recoverDeletedDraft, discardDeletedDraft, projectMemos, queueMemoDelete, queueMemoSave, readWorkspaceCache, retryMemoConflict, workspaceCacheKey, writeWorkspaceCache } from '../system/storage/WorkspaceCache';
import { contributionDays, parseTags, selectMemos } from '../pages/Index/functions/selectMemos';

const id = '6cff2d54-fb60-4e46-bfc0-23d06ef99a63';
const time = '2026-10-24T00:30:00.000Z';
const input: MemoInput = { id, content: '第一条想法', tags: ['学习/阅读'], links: [], attachments: [], isPublic: false, isPinned: false };
const confirmed: Memo = { ...input, backlinks: [], revision: 1, createdAt: time, updatedAt: time };
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};

describe('persistent owner outbox', () => {
  it('recovers unacknowledged edits and deletes after a reload without reading legacy data', () => {
    const memory = storage();
    memory.setItem('memos', JSON.stringify([{ content: '旧数据' }]));
    let cache = queueMemoSave(createWorkspaceCache(), input, 'create-operation', time);
    cache = queueMemoSave(cache, { ...input, content: '离线编辑' }, 'edit-operation', time);
    const key = workspaceCacheKey('instance', 'owner');
    writeWorkspaceCache(memory, key, cache);
    const restored = readWorkspaceCache(memory, key);
    expect(restored.outbox).toHaveLength(2);
    expect(projectMemos(restored)[0]?.content).toBe('离线编辑');
    const acknowledged = acknowledgeMemoMutation(restored, 'create-operation', confirmed, 0);
    expect(acknowledged.outbox[0]?.baseRevision).toBe(1);
    const deleted = queueMemoDelete(acknowledged, confirmed, 'delete-operation', time);
    writeWorkspaceCache(memory, key, deleted);
    expect(readWorkspaceCache(memory, key).outbox.at(-1)?.kind).toBe('delete');
    expect(projectMemos(readWorkspaceCache(memory, key))).toEqual([]);
    expect(memory.getItem('memos')).toContain('旧数据');
    expect(readWorkspaceCache(memory, workspaceCacheKey('instance', 'anonymous')).memos).toEqual([]);
  });

  it('keeps failed operations and requires an explicit conflict decision', () => {
    const cache = queueMemoSave({ ...createWorkspaceCache(), memos: [confirmed] }, { ...input, content: '本地版本' }, 'operation', time);
    const current = { ...confirmed, content: '另一台设备', revision: 3 };
    const conflict = markMemoConflict(cache, 'operation', '冲突', current);
    expect(projectMemos(conflict)[0]?.content).toBe('本地版本');
    expect(conflict.outbox[0]?.status).toBe('conflict');
    const retry = retryMemoConflict(conflict, id, 'replacement-operation');
    expect(retry.outbox[0]?.operationId).toBe('replacement-operation');
    expect(retry.outbox[0]?.baseRevision).toBe(3);
    expect(retry.outbox[0]?.status).toBe('pending');
    const deleted = markMemoConflict(cache, 'operation', '已删除', null);
    expect(() => retryMemoConflict(deleted, id, 'never-recreate')).toThrow('远端删除');
  });

  it('retains the revision observed when editing began after background updates arrive', () => {
    const cache = { ...createWorkspaceCache(), memos: [{ ...confirmed, revision: 5, content: '后台更新' }] };
    const pending = queueMemoSave(cache, { ...input, content: '从旧内容开始编辑', baseRevision: 1 }, 'edit-operation', time);
    expect(pending.outbox[0]?.baseRevision).toBe(1);
  });

  it('allows an explicitly edited invalid request to replace the blocked intent with a fresh operation', () => {
    const cache = queueMemoSave(createWorkspaceCache(), input, 'invalid-create', time);
    const invalid = markMemoInvalid(cache, 'invalid-create', '附件引用无效');
    const repaired = queueMemoSave(invalid, { ...input, content: '已修复', attachments: [] }, 'repaired-create', time);
    expect(repaired.outbox).toHaveLength(1);
    expect(repaired.outbox[0]?.kind).toBe('create');
    expect(repaired.outbox[0]?.operationId).toBe('repaired-create');
    expect(repaired.outbox[0]?.status).toBe('pending');
    expect(projectMemos(repaired)[0]?.content).toBe('已修复');
  });

  it('preserves the previous saved version when storage fails', () => {
    const memory = storage();
    const key = workspaceCacheKey('instance', 'owner');
    writeWorkspaceCache(memory, key, { ...createWorkspaceCache(), memos: [confirmed] });
    const broken = { ...memory, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(() => writeWorkspaceCache(broken, key, createWorkspaceCache())).toThrow();
    expect(readWorkspaceCache(memory, key).memos).toEqual([confirmed]);
  });
});

describe('memo projections', () => {
  it('returns an empty search, supports hierarchical tags and derives unique tags', () => {
    const memos = [confirmed];
    expect(selectMemos(memos, { query: '无结果', tag: '', date: '', pinned: false })).toEqual([]);
    expect(selectMemos(memos, { query: '', tag: '学习', date: '', pinned: false })).toHaveLength(1);
    expect(selectMemos(memos, { query: '', tag: '学', date: '', pinned: false })).toEqual([]);
    expect(parseTags('#学习/阅读, 学习/阅读，灵感')).toEqual(['学习/阅读', '灵感']);
    const days = contributionDays(memos, new Date('2026-10-24T12:00:00'));
    expect(days).toHaveLength(365);
    expect(days.at(-1)?.date).toBe('2026-10-24');
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBe(1);
  });
});


describe('drafts left by a deleted memo', () => {
  it('recovers text and attachments to a new draft without reviving the deleted identity', () => {
    const mediaId = 'eecfd4b2-fb72-4e4b-b065-105de674ccf7';
    const draft = { content: '正在编辑的本地正文', tags: ['本地'], links: [], attachments: [{ mediaId, kind: 'audio' as const }], isPublic: false, baseRevision: 7 };
    const cache = { ...createWorkspaceCache(), deletedDraftIds: [id], drafts: { [id]: draft } };
    const memory = storage(); const key = workspaceCacheKey('instance', 'owner');
    writeWorkspaceCache(memory, key, cache);
    const restored = recoverDeletedDraft(readWorkspaceCache(memory, key), id);
    expect(restored.drafts.new).toEqual({ ...draft, baseRevision: 0 });
    expect(restored.drafts[id]).toBeUndefined(); expect(restored.deletedDraftIds).toEqual([]);
    expect(restored.outbox).toEqual([]); expect(restored.memos).toEqual([]);
  });

  it('never overwrites an existing new draft and discards only the selected deleted draft', () => {
    const draft = { content: '删除后保留内容', tags: [], links: [], attachments: [], isPublic: false };
    const cache = { ...createWorkspaceCache(), deletedDraftIds: [id], drafts: { [id]: draft, new: { ...draft, content: '另一个未提交草稿' } } };
    expect(() => recoverDeletedDraft(cache, id)).toThrow('已有草稿');
    expect(cache.drafts[id].content).toBe('删除后保留内容');
    expect(discardDeletedDraft(cache, id).drafts.new?.content).toBe('另一个未提交草稿');
  });
});
