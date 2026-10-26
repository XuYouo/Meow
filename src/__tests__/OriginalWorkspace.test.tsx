// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreferencesDTO } from '../../shared/contracts/preferences';
import { FeatureBoundary } from '../features/workspace/FeatureBoundary';
import Index, { type WorkspaceExtension } from '../pages/Index/index';
import { createWorkspaceCache } from '../system/storage/WorkspaceCache';
import { defaultDevicePreferences, readDevicePreferences, saveDevicePreferences } from '../system/storage/DevicePreferences';

const state = vi.hoisted(() => ({ update: vi.fn(), integration: vi.fn(), workspace: vi.fn(), reviewList: vi.fn(), reviewReset: vi.fn(), generate: vi.fn(), preferences: null as PreferencesDTO | null }));
vi.mock('../apis/review/ListReviewResultsAPI', () => ({ ListReviewResultsAPI: state.reviewList }));
vi.mock('../apis/review/ResetReviewGroupAPI', () => ({ ResetReviewGroupAPI: state.reviewReset }));
vi.mock('../features/settings/PreferencesProvider', () => ({ usePreferences: () => ({ preferences: state.preferences, update: state.update }) }));
vi.mock('../pages/Index/hooks/useWorkspace', () => ({ useWorkspace: state.workspace }));
vi.mock('../apis/integrations/GetIntegrationStatusAPI', () => ({ GetIntegrationStatusAPI: state.integration }));
vi.mock('../features/ai/AIButton', () => ({ default: ({ onContinue, onOptimize }: { onContinue: () => void; onOptimize: () => void }) => <><button onClick={onContinue}>测试续写</button><button onClick={onOptimize}>测试优化</button></> }));
vi.mock('../features/ai/AIDialog', () => ({ default: function MockAIDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) { const [draft, setDraft] = useState(''); return isOpen ? <div role='dialog' aria-label='延迟AI对话'><input aria-label='对话草稿' value={draft} onChange={(event) => setDraft(event.target.value)} /><button onClick={onClose}>关闭测试对话</button></div> : null; } }));
vi.mock('../features/ai/useEditorAI', () => ({ useEditorAI: () => ({ running: false, error: '', cancel() {}, generate: state.generate }) }));
vi.mock('../features/review/ReviewPanel', () => ({ businessDay: (date: Date) => date.toISOString().slice(0, 10) }));
const session = { authenticated: true, principal: 'owner' as const, instanceId: '84c8ff35-fe4a-470f-9bac-dfb2a68af76b' };
const prefs: PreferencesDTO = { title: 'Meow', theme: 'light', accentColor: '#818CF8', font: { family: 'system', size: 16, lineHeight: 1.5 }, background: { mode: 'image', color: '#f9fafb', mediaId: 'f1dc9b1d-4bbf-4a21-8206-4176ce47e83f', fit: 'cover', opacity: 1, brightness: 50, blur: 10, useRandom: true }, avatarMediaId: null, hitokotoEnabled: false, hitokotoTypes: ['a'], aiEnabled: true, aiModel: 'configured-model', musicEnabled: false, reviewTimezone: 'Asia/Shanghai', revision: 2, updatedAt: '2026-10-24T00:00:00.000Z' };
const extensions: WorkspaceExtension[] = [
  { id: 'canvas', label: '画布', icon: null, ownerOnly: true, render: () => <div>画布已打开</div> },
  { id: 'settings', label: '设置', icon: null, ownerOnly: true, render: () => <div>设置已打开</div> },
];
function open(principal: 'owner' | 'anonymous' = 'owner'): ReactNode { return <Index session={{ ...session, principal, authenticated: principal === 'owner' }} onLogin={vi.fn()} onLogout={vi.fn()} onSessionExpired={vi.fn()} extensions={extensions} />; }
beforeEach(() => {
  localStorage.clear(); localStorage.setItem(`meow:v2:${session.instanceId}:tutorial`, 'seen'); vi.clearAllMocks();
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  state.preferences = prefs; state.integration.mockResolvedValue({ aiConfigured: true }); state.update.mockResolvedValue(undefined);
  state.workspace.mockReturnValue({ canWrite: true, writerPhase: 'writer', memos: [], cache: createWorkspaceCache(), status: 'ready', error: '', save: vi.fn(), saveDraft: vi.fn(), remove: vi.fn(), synchronize: vi.fn(), discard: vi.fn(), retry: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('original workspace actions use the new state and authority', () => {
  it('uses the recorded shortcuts and restores sidebar pins after remount', async () => {
    saveDevicePreferences(session.instanceId, { ...defaultDevicePreferences, shortcuts: { ...defaultDevicePreferences.shortcuts, toggleSidebar: 'Ctrl+B', toggleCanvasMode: 'Ctrl+Shift+Y', openSettings: 'Ctrl+Alt+O', openAIDialog: null } });
    const first = render(open());
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(readDevicePreferences(session.instanceId).sidebarPins).toEqual({ left: true, right: true });
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(readDevicePreferences(session.instanceId).sidebarPins).toEqual({ left: false, right: false });
    first.unmount(); render(open());
    expect(screen.getByLabelText('固定左侧栏')).toBeTruthy(); expect(screen.getByLabelText('固定右侧栏')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Y', ctrlKey: true, shiftKey: true });
    expect(screen.getByText('画布已打开')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'o', ctrlKey: true, altKey: true });
    await screen.findByText('设置已打开');
  });

  it('keeps anonymous shortcuts from opening owner features', () => {
    render(open('anonymous'));
    fireEvent.keyDown(window, { key: ',', ctrlKey: true }); fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(screen.queryByText('设置已打开')).toBeNull(); expect(screen.queryByText('画布已打开')).toBeNull();
    expect(screen.queryByPlaceholderText('现在的想法是……')).toBeNull();
  });

  it('keeps the existing workspace and audio mounted while the first canvas chunk is pending', async () => {
    let resolveModule: (value: { default: () => ReactNode }) => void = () => { throw new Error('not initialized'); };
    const pending = new Promise<{ default: () => ReactNode }>((resolve) => { resolveModule = resolve; });
    const Canvas = lazy(() => pending);
    render(<FeatureBoundary><Suspense fallback={<p>功能加载占位</p>}><Index session={session} onLogin={vi.fn()} onLogout={vi.fn()} onSessionExpired={vi.fn()} extensions={[{ id: 'canvas', label: '画布', icon: null, render: () => <Canvas /> }]} persistentTools={() => <audio data-testid='stable-audio' />} /></Suspense></FeatureBoundary>);
    const audio = screen.getByTestId('stable-audio');
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(screen.getByPlaceholderText('现在的想法是……')).toBeTruthy();
    expect(screen.queryByText('功能加载占位')).toBeNull(); expect(screen.getByTestId('stable-audio')).toBe(audio);
    resolveModule({ default: () => <div>独立画布模块</div> });
    await screen.findByText('独立画布模块'); expect(screen.getByTestId('stable-audio')).toBe(audio);
  });

  it('keeps an AI dialog mounted after its first load so closing does not discard conversation state', async () => {
    render(<Suspense fallback={<p>功能加载占位</p>}>{open()}</Suspense>);
    fireEvent.keyDown(window, { key: ' ', ctrlKey: true });
    const draft = await screen.findByRole('textbox', { name: '对话草稿' });
    fireEvent.change(draft, { target: { value: '关闭后继续的对话' } });
    fireEvent.click(screen.getByText('关闭测试对话'));
    expect(screen.queryByRole('dialog', { name: '延迟AI对话' })).toBeNull();
    fireEvent.keyDown(window, { key: ' ', ctrlKey: true });
    expect((await screen.findByRole('textbox', { name: '对话草稿' })).getAttribute('value')).toBe('关闭后继续的对话');
  });

  it('shows a remotely deleted edit and provides an explicit recovery action without auto-creating a note', () => {
    const id = crypto.randomUUID(); const recoverDraft = vi.fn();
    state.workspace.mockReturnValue({ ...state.workspace(), recoverDraft, discardDraft: vi.fn(), cache: { ...createWorkspaceCache(), deletedDraftIds: [id], drafts: { [id]: { content: '远端删除后保留的草稿', tags: [], links: [], attachments: [], isPublic: false, baseRevision: 4 } } } });
    render(open());
    expect(screen.getByText('原笔记已删除，编辑草稿仍保存在本机')).toBeTruthy();
    fireEvent.click(screen.getByText('转存新草稿'));
    expect(recoverDraft).toHaveBeenCalledWith(id); expect(state.workspace().save).not.toHaveBeenCalled();
  });

  it('rejects owner business writes from a reader while keeping the original controls visible', () => {
    state.workspace.mockReturnValue({ ...state.workspace(), canWrite: false, writerPhase: 'waiting' });
    render(open());
    fireEvent.click(screen.getByLabelText('重置今日卡片为FAIL'));
    fireEvent.click(screen.getByLabelText('收藏当前背景'));
    fireEvent.click(screen.getByLabelText('切换到黑夜模式'));
    fireEvent.click(screen.getByText('测试续写')); fireEvent.click(screen.getByText('测试优化'));
    expect(state.reviewList).not.toHaveBeenCalled(); expect(state.reviewReset).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled(); expect(state.generate).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('现在的想法是……').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByText('此标签页只读，请在正在编辑的标签页使用AI编辑草稿。')).toBeTruthy();
  });

  it('resets the group atomically after loading every review page, including revisions beyond the first 500', async () => {
    const firstId = crypto.randomUUID(); const lastId = crypto.randomUUID(); const now = new Date().toISOString();
    const memo = { content: '合成回顾笔记', tags: [], links: [], backlinks: [], attachments: [], isPublic: false, isPinned: false, revision: 1, createdAt: now, updatedAt: now };
    state.workspace.mockReturnValue({ ...state.workspace(), memos: [{ ...memo, id: firstId }, { ...memo, id: lastId }] });
    state.reviewList.mockResolvedValueOnce({ items: [{ memoId: firstId, revision: 3 }, ...Array.from({ length: 499 }, () => ({ memoId: crypto.randomUUID(), revision: 1 }))], nextOffset: 500 }).mockResolvedValueOnce({ items: [{ memoId: lastId, revision: 7 }], nextOffset: null });
    state.reviewReset.mockResolvedValue({ items: [] });
    render(open()); fireEvent.click(screen.getByLabelText('重置今日卡片为FAIL'));
    await waitFor(() => expect(state.reviewReset).toHaveBeenCalledTimes(1));
    expect(state.reviewList.mock.calls.map((call) => call[0].offset)).toEqual([0, 500]);
    expect(state.reviewReset.mock.calls[0]?.[0].entries).toEqual([expect.objectContaining({ memoId: firstId, baseRevision: 3 }), expect.objectContaining({ memoId: lastId, baseRevision: 7 })]);
    await screen.findByText('已重置今日 2 条为 FAIL');
  });

  it('lets guests toggle their device theme without writing shared owner preferences', () => {
    render(open('anonymous'));
    fireEvent.click(screen.getByLabelText('切换到黑夜模式'));
    expect(readDevicePreferences(session.instanceId).guestTheme).toBe('dark');
    expect(state.update).not.toHaveBeenCalled();
  });

  it('favorites the image currently displayed and keeps all other settings', async () => {
    render(open()); fireEvent.click(screen.getByLabelText('收藏当前背景'));
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    expect(state.update.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ aiEnabled: true, aiModel: 'configured-model', musicEnabled: false, hitokotoTypes: ['a'], background: { ...prefs.background, useRandom: false } }));
    expect(state.update.mock.calls[0]?.[0]).not.toHaveProperty('revision');
  });
});
