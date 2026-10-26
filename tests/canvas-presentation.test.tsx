// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasFeature from '../src/features/canvas';
import { PreferencesProvider } from '../src/features/settings/PreferencesProvider';
import { PresentationProvider } from '../src/features/presentation/PresentationContext';
import type { WorkspaceExtensionProps } from '../src/pages/Index/index';
import type { Memo } from '../src/objects/memos/Memo';
import { createWorkspaceCache, recoverExternalDraft, type MemoDraft } from '../src/system/storage/WorkspaceCache';

const session={ authenticated: true,principal: 'owner' as const,instanceId: '7c2d9698-7253-409f-bf90-926e60f4345d' };
const memo: Memo={ id: '192ade9a-61c4-4f5f-afc7-39aa68b6de74',content: '合成画布笔记 #功能',tags: ['功能'],links: [],backlinks: [],attachments: [],isPinned: false,isPublic: false,revision: 3,createdAt: '2026-10-24T00:00:00.000Z',updatedAt: '2026-10-24T01:00:00.000Z' };
function props(): WorkspaceExtensionProps { return { session,localOnly: true,canWrite: true,memos: [memo],drafts: {},saveDraft: vi.fn(),recoverExternalDraft: vi.fn(),save: vi.fn(),remove: vi.fn(),refresh: vi.fn().mockResolvedValue(undefined),notify: vi.fn(),select: vi.fn() }; }
function show(value: WorkspaceExtensionProps) {
  function Harness() {
    const [drafts,setDrafts]=useState(value.drafts),current=useRef(drafts);
    function update(next: Readonly<Record<string,MemoDraft>>) { current.current=next;setDrafts(next); }
    const extension={ ...value,drafts,saveDraft: (id: string,draft: MemoDraft) => { value.saveDraft(id,draft);update({ ...current.current,[id]: draft }); },recoverExternalDraft: (draft: MemoDraft) => { value.recoverExternalDraft(draft);update(recoverExternalDraft({ ...createWorkspaceCache(),drafts: { ...current.current } },draft).drafts); } };
    return <PreferencesProvider session={session} localOnly><PresentationProvider instanceId={session.instanceId} isAuthenticated localOnly canWrite={value.canWrite} onLogin={vi.fn()} onLogout={vi.fn()} onSettings={vi.fn()} onRefresh={value.refresh} notify={value.notify}><CanvasFeature {...extension} /></PresentationProvider></PreferencesProvider>;
  }
  return render(<Harness />);
}
beforeEach(() => {
  localStorage.clear();vi.stubGlobal('fetch',vi.fn());
  vi.stubGlobal('ResizeObserver',class { observe=vi.fn();unobserve=vi.fn();disconnect=vi.fn(); });
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(850);
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(600);
  Object.defineProperty(window,'matchMedia',{ configurable: true,value: vi.fn(() => ({ matches: false,addEventListener: vi.fn(),removeEventListener: vi.fn() })) });
});
afterEach(() => { cleanup();vi.restoreAllMocks();vi.unstubAllGlobals(); });

describe('original canvas presentation with the rewritten domain',() => {
  it('waits for a nonzero measured viewport before persisting first memo positions',async () => {
    let width=0,height=0;const resized: (() => void)[]=[];
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockImplementation(() => height);
    vi.stubGlobal('ResizeObserver',class { constructor(callback: () => void) { resized.push(callback); }observe=vi.fn();unobserve=vi.fn();disconnect=vi.fn(); });
    const view=show(props()),key=`meow:v2:${session.instanceId}:owner:canvas`;
    expect(view.container.querySelector('.draggable-memo')).toBeNull();expect(localStorage.getItem(key)).toBeNull();
    width=850;height=600;act(() => resized.forEach((callback) => callback()));
    await waitFor(() => expect(view.container.querySelector('.draggable-memo')).not.toBeNull());
    const stored=JSON.parse(localStorage.getItem(key)??'{}');
    expect(stored.queue.at(-1).document.memoPositions).toEqual([{ memoId: memo.id,x: 645,y: 300,z: 1 }]);
  });
  it('keeps the original floating eight-tool toolbar, line grid, 320px memo card, bottom editor and zoom/reset control',async () => {
    const view=show(props());
    const toolbar=screen.getByRole('toolbar',{ name: '画布工具' });
    expect(within(toolbar).getAllByRole('button')).toHaveLength(8);
    expect(within(toolbar).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['矩形','圆形','文字','箭头','直线','画笔','橡皮擦','图片']);
    expect(toolbar.parentElement?.className).toContain('absolute top-3 left-1/2 -translate-x-1/2');
    expect(screen.getByPlaceholderText('输入笔记内容...（Enter 发送，Shift+Enter 换行）').className).toContain('w-80 md:w-[520px]');
    expect(screen.getByRole('button',{ name: '重置' })).toBeDefined();
    expect(view.container.querySelector('[style*="repeating-linear-gradient"]')?.getAttribute('style')).toContain('transparent 100px');
    await waitFor(() => expect(view.container.querySelector('.draggable-memo')).not.toBeNull());
    expect(view.container.querySelector<HTMLElement>('.draggable-memo')?.style.width).toBe('320px');
    expect(view.container.querySelector('.draggable-memo')?.className).toContain('-translate-x-1/2 -translate-y-1/2');
    expect(view.container.textContent).not.toContain('让想法，铺展开');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps original side tool cards and image URL/upload controls instead of horizontal replacement controls',() => {
    const view=show(props());
    fireEvent.click(screen.getByRole('button',{ name: '矩形' }));
    expect(screen.getByText('工具设置')).toBeDefined();expect(screen.getByText('边框样式')).toBeDefined();
    expect(view.container.querySelector('.w-72.canvas-ui')?.className).toContain('absolute top-20 left-3');
    expect(screen.getByRole('combobox',{ name: '边框样式' }).className).toContain('rounded-md border border-input');
    const opacity=screen.getByRole('slider',{ name: '透明度' });
    fireEvent.keyDown(opacity,{ key: 'ArrowLeft' });expect(opacity.getAttribute('aria-valuenow')).toBe('99');
    fireEvent.click(screen.getByRole('button',{ name: '图片' }));
    expect(screen.getByPlaceholderText('粘贴图片直链...')).toBeDefined();
    expect(screen.getByText('拖拽图片到此处，或点击选择文件')).toBeDefined();
    expect(view.container.querySelector('.w-80.canvas-ui')).not.toBeNull();
  });
  it('submits the bottom editor through the new memo use case and preserves original in-place menu editing with its opening revision',async () => {
    const value=props();show(value);
    const editor=screen.getByPlaceholderText('输入笔记内容...（Enter 发送，Shift+Enter 换行）');
    fireEvent.change(editor,{ target: { value: '从原画布输入框提交' } });fireEvent.keyDown(editor,{ key: 'Enter',code: 'Enter' });
    expect(value.save).toHaveBeenCalledWith(expect.objectContaining({ content: '从原画布输入框提交',isPublic: false }));
    await new Promise((resolve) => setTimeout(resolve,120));
    fireEvent.click(screen.getByRole('button',{ name: '操作菜单' }));fireEvent.click(screen.getByRole('button',{ name: '编辑' }));
    const inline=screen.getByPlaceholderText('编辑想法...');
    fireEvent.change(inline,{ target: { value: '原地编辑后的笔记' } });fireEvent.pointerDown(document.body);
    expect(value.save).toHaveBeenCalledWith(expect.objectContaining({ id: memo.id,content: '原地编辑后的笔记',baseRevision: 3 }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the shared draft collection for inline and bottom editing while preserving draft metadata',async () => {
    const value=props(),draft: MemoDraft={ content: '统一草稿',tags: ['保留'],links: [],attachments: [],isPublic: true,baseRevision: 2 };
    value.drafts={ [memo.id]: draft,new: { ...draft,content: '底部已有草稿',baseRevision: 0 } };show(value);
    const inline=await screen.findByPlaceholderText('编辑想法...');
    expect(inline).toHaveProperty('value','统一草稿');fireEvent.change(inline,{ target: { value: '统一草稿继续编辑' } });
    expect(value.saveDraft).toHaveBeenCalledWith(memo.id,{ ...draft,content: '统一草稿继续编辑' });
    fireEvent.keyDown(inline,{ key: 'Enter',ctrlKey: true });
    expect(value.save).toHaveBeenCalledWith(expect.objectContaining({ id: memo.id,content: '统一草稿继续编辑',tags: ['保留'],isPublic: true,baseRevision: 2 }));
    const bottom=screen.getByRole('textbox',{ name: '画布新笔记内容' });expect(bottom).toHaveProperty('value','底部已有草稿');
    fireEvent.change(bottom,{ target: { value: '底部改写' } });fireEvent.keyDown(bottom,{ key: 'Enter' });
    expect(value.save).toHaveBeenCalledWith(expect.objectContaining({ content: '底部改写',tags: ['保留'],isPublic: true,baseRevision: 0 }));
    expect(localStorage.getItem(`meow:v2:${session.instanceId}:owner:canvas-memo-draft:${memo.id}`)).toBeNull();
  });
  it('recovers a retained draft of a remotely deleted memo as a new UUID only after explicit submission',() => {
    const value=props();value.memos=[];
    const source=`meow:v2:${session.instanceId}:owner:canvas-memo-draft:${memo.id}`,draft: MemoDraft={ content: '远端删除仍保留正文',tags: ['恢复'],links: [],attachments: [],isPublic: false,baseRevision: 3 };
    localStorage.setItem(source,JSON.stringify(draft));const view=show(value);
    expect(screen.getByRole('region',{ name: '保留的画布草稿' })).toBeDefined();
    expect(view.container.querySelector('.draggable-memo')).toBeNull();expect(value.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{ name: '转存新草稿' }));
    expect(localStorage.getItem(source)).toBeNull();expect(value.save).not.toHaveBeenCalled();
    const editor=screen.getByRole('textbox',{ name: '画布新笔记内容' });expect(editor).toHaveProperty('value',draft.content);
    fireEvent.keyDown(editor,{ key: 'Enter' });
    expect(value.save).toHaveBeenCalledWith(expect.objectContaining({ content: draft.content,tags: draft.tags,baseRevision: 0 }));
    expect(vi.mocked(value.save).mock.calls[0]?.[0].id).not.toBe(memo.id);
  });
  it('never overwrites an existing new draft or removes the retained source when recovery is blocked',() => {
    const value=props();value.memos=[];value.drafts={ new: { content: '先前新草稿',tags: [],links: [],attachments: [],isPublic: false } };
    const source=`meow:v2:${session.instanceId}:owner:canvas-memo-draft:${memo.id}`,raw=JSON.stringify({ ...value.drafts.new,content: '待恢复正文',baseRevision: 3 });localStorage.setItem(source,raw);show(value);
    fireEvent.click(screen.getByRole('button',{ name: '转存新草稿' }));
    expect(localStorage.getItem(source)).toBe(raw);expect(screen.getByRole('textbox',{ name: '画布新笔记内容' })).toHaveProperty('value','先前新草稿');
    expect(value.notify).toHaveBeenCalledWith('新笔记编辑框已有草稿，请先保存或处理它，再恢复这份草稿。');expect(value.save).not.toHaveBeenCalled();
  });
  it('keeps the retained source if persisting the recovery fails',() => {
    const value=props();value.memos=[];value.recoverExternalDraft=vi.fn(() => { throw new Error('本地存储空间不足'); });
    const source=`meow:v2:${session.instanceId}:owner:canvas-memo-draft:${memo.id}`,raw=JSON.stringify({ content: '不能丢失正文',tags: [],links: [],attachments: [],isPublic: false,baseRevision: 3 });localStorage.setItem(source,raw);show(value);
    fireEvent.click(screen.getByRole('button',{ name: '转存新草稿' }));
    expect(localStorage.getItem(source)).toBe(raw);expect(value.notify).toHaveBeenCalledWith('本地存储空间不足');expect(value.save).not.toHaveBeenCalled();
  });
  it('disables canvas and memo mutation controls when another tab owns the workspace writer lease',() => {
    const value=props();value.canWrite=false;
    const key=`meow:v2:${session.instanceId}:owner:canvas`,raw=JSON.stringify({ remote: { revision: 1,updatedAt: memo.updatedAt,document: { schemaVersion: 1,viewport: { x: 0,y: 0,scale: 1 },memoPositions: [{ memoId: memo.id,x: 0,y: 0,z: 1 }],shapes: [] } },queue: [] });
    localStorage.setItem(key,raw);
    const source=`meow:v2:${session.instanceId}:owner:canvas-memo-draft:${memo.id}`;
    localStorage.setItem(source,JSON.stringify({ content: '其他标签页的编辑草稿',tags: [],links: [],attachments: [],isPublic: false }));
    const view=show(value);
    expect(screen.getByRole('textbox',{ name: '画布新笔记内容' })).toHaveProperty('disabled',true);
    expect(within(screen.getByRole('toolbar')).getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByRole('button',{ name: '操作菜单' })).toHaveProperty('disabled',true);
    expect(screen.getByRole('button',{ name: '转存新草稿' })).toHaveProperty('disabled',true);
    expect(screen.getByRole('button',{ name: '放弃这份草稿' })).toHaveProperty('disabled',true);
    const card=view.container.querySelector('.draggable-memo');if (!card) throw new Error('Missing synthetic card');
    fireEvent.doubleClick(card);fireEvent.keyDown(window,{ key: '1' });
    expect(screen.queryByPlaceholderText('编辑想法...')).toBeNull();expect(value.save).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(raw);expect(fetch).not.toHaveBeenCalled();
  });
});
