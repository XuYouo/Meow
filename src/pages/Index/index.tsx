import { lazy, startTransition, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { GetIntegrationStatusAPI } from '../../apis/integrations/GetIntegrationStatusAPI';
import { ListReviewResultsAPI } from '../../apis/review/ListReviewResultsAPI';
import { ResetReviewGroupAPI } from '../../apis/review/ResetReviewGroupAPI';
import AIButton from '../../features/ai/AIButton';
import { useEditorAI } from '../../features/ai/useEditorAI';
import { businessDay } from '../../features/review/functions/businessDay';
import { PresentationProvider } from '../../features/presentation/PresentationContext';
import { memoView, type AudioClipView } from '../../features/presentation/objects/MemoView';
import { usePreferences } from '../../features/settings/PreferencesProvider';
import { PreferenceValuesSchema } from '../../../shared/contracts/preferences';
import { ReadMediaAPI } from '../../apis/media/ReadMediaAPI';
import type { Session } from '../../objects/identity/Session';
import type { Memo, MemoInput } from '../../objects/memos/Memo';
import { readDevicePreferences, saveDevicePreferences, subscribeDevicePreferences } from '../../system/storage/DevicePreferences';
import type { MemoDraft } from '../../system/storage/WorkspaceCache';
import { matchesShortcut } from '../../system/storage/KeyboardShortcut';
import { contributionDays, selectMemos } from './functions/selectMemos';
import { useWorkspace } from './hooks/useWorkspace';
import LeftSidebar from './presentation/LeftSidebar';
import MainContent from './presentation/MainContent';
import RightSidebar from './presentation/RightSidebar';
import MobileSidebar from './presentation/MobileSidebar';
import ShareDialog from './presentation/ShareDialog';
import MemoPreviewDialog from './presentation/MemoPreviewDialog';
import TutorialDialog from './presentation/TutorialDialog';

const AIDialog = lazy(() => import('../../features/ai/AIDialog'));

export interface WorkspaceExtensionProps {
  session: Session; localOnly: boolean; canWrite: boolean; memos: Memo[];
  drafts: Readonly<Record<string, MemoDraft>>; saveDraft: (id: string, draft: MemoDraft) => void; recoverExternalDraft: (draft: MemoDraft) => void;
  save: (input: MemoInput, kind?: 'pin' | 'visibility') => void; remove: (memo: Memo) => void;
  refresh: () => Promise<void>; notify: (message: string) => void; select: (id: string) => void;
  isOpen?: boolean; onClose?: () => void; onOpenTutorial?: () => void;
  onToolPanelVisibleChange?: (visible: boolean) => void; isCanvasMode?: boolean;
  onOpenMusic?: () => void; musicSearchQuery?: string | null; onCloseMusicSearch?: () => void;
}
export interface WorkspaceExtension { id: string; label: string; icon: ReactNode; ownerOnly?: boolean; render: (props: WorkspaceExtensionProps) => ReactNode }
interface IndexProps {
  session: Session; onLogin: () => void; onLogout: () => void; onSessionExpired: () => void;
  localOnly?: boolean; onReconnect?: () => void; extensions?: WorkspaceExtension[];
  persistentTools?: (props: WorkspaceExtensionProps) => ReactNode;
}
const emptyDraft: MemoDraft = { content: '', tags: [], links: [], attachments: [], isPublic: false, baseRevision: 0 };
const tagsFromContent = (content: string) => [...new Set([...content.matchAll(/(?:^|\s)#([\u4e00-\u9fa5a-zA-Z0-9_/]+)/g)].map((match) => match[1]).filter((tag): tag is string => Boolean(tag)))];
function draftFromMemo(memo: Memo): MemoDraft { return { content: memo.content, tags: memo.tags, links: memo.links, attachments: memo.attachments, isPublic: memo.isPublic, baseRevision: memo.revision }; }
function initialFilter() { const params = new URLSearchParams(location.search); return { query: params.get('q') ?? '', tag: params.get('tag') ?? '', date: params.get('date') ?? '' }; }

export default function Index({ session, onLogin, onLogout, onSessionExpired, localOnly = false, onReconnect, extensions = [], persistentTools }: IndexProps) {
  const workspace = useWorkspace(session, onSessionExpired, localOnly);
  const workspaceRef = useRef(workspace); workspaceRef.current = workspace;
  const { preferences, update: updatePreferences } = usePreferences();
  const [filter, setFilter] = useState(initialFilter);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  const [isLeftSidebarHovered, setIsLeftSidebarHovered] = useState(false);
  const [isRightSidebarHovered, setIsRightSidebarHovered] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCanvasMode, setIsCanvasMode] = useState(false);
  const [canvasToolPanelVisible, setCanvasToolPanelVisible] = useState(false);
  const [auxiliary, setAuxiliary] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [aiDialogState, setAIDialogState] = useState<'unopened' | 'open' | 'closed'>('unopened');
  const isAIDialogOpen = aiDialogState === 'open';
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [musicSearchQuery, setMusicSearchQuery] = useState<string | null>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [notice, setNotice] = useState('');
  const [integrationConfigured, setIntegrationConfigured] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(() => session.principal === 'owner' && localStorage.getItem(`meow:v2:${session.instanceId}:tutorial`) !== 'seen');
  const [device, setDevice] = useState(() => readDevicePreferences(session.instanceId));
  const isLeftSidebarPinned = device.sidebarPins.left;
  const isRightSidebarPinned = device.sidebarPins.right;
  const setSidebarPinned = useCallback((side: 'left' | 'right', value: boolean) => {
    try { const current = readDevicePreferences(session.instanceId); saveDevicePreferences(session.instanceId, { ...current, sidebarPins: { ...current.sidebarPins, [side]: value } }); }
    catch { setNotice('设备设置未能保存，请重试。'); }
  }, [session.instanceId]);
  const setIsLeftSidebarPinned = (value: boolean) => setSidebarPinned('left', value);
  const setIsRightSidebarPinned = (value: boolean) => setSidebarPinned('right', value);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const memosContainerRef = useRef<HTMLDivElement>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ai = useEditorAI();
  const isAuthenticated = session.principal === 'owner';
  const newDraft = workspace.cache.drafts.new ?? emptyDraft;
  const editingMemo = workspace.memos.find((memo) => memo.id === editingId);
  const editDraft = editingId ? workspace.cache.drafts[editingId] ?? (editingMemo ? draftFromMemo(editingMemo) : emptyDraft) : emptyDraft;
  const memos = workspace.memos.map((memo) => memoView(memo.id === editingId ? { ...memo, links: editDraft.links, attachments: editDraft.attachments } : memo));
  const pinnedMemos = memos.filter((memo) => memo.isPinned);
  const ordinaryMemos = memos.filter((memo) => !memo.isPinned);
  const selectedIds = new Set(selectMemos(workspace.memos, { ...filter, pinned: false }).map((memo) => memo.id));
  const filteredMemos = [...pinnedMemos, ...ordinaryMemos].filter((memo) => selectedIds.has(memo.id));
  const heatmapData = contributionDays(workspace.memos, new Date());
  const audioClips = (draft: MemoDraft): AudioClipView[] => draft.attachments.filter((attachment) => attachment.kind === 'audio').map((attachment) => ({ id: attachment.mediaId, mediaId: attachment.mediaId, url: ReadMediaAPI(attachment.mediaId) }));
  const notify = useCallback((message: string) => setNotice(message), []);
  const openSettings = useCallback(() => startTransition(() => setAuxiliary('settings')), []);
  const openReview = useCallback(() => startTransition(() => setAuxiliary('review')), []);
  const openAI = useCallback(() => startTransition(() => setAIDialogState('open')), []);
  const changeCanvasMode = useCallback((value: boolean) => startTransition(() => setIsCanvasMode(value)), []);
  const openMusicSearch = useCallback((query: string) => startTransition(() => setMusicSearchQuery(query)), []);
  const changeFilter = useCallback((patch: Partial<typeof filter>) => setFilter((previous) => ({ ...previous, ...patch })), []);

  const updateDraft = useCallback((id: string, patch: Partial<MemoDraft>) => {
    const current = workspaceRef.current;
    const memo = current.memos.find((entry) => entry.id === id);
    const draft = current.cache.drafts[id] ?? (memo ? draftFromMemo(memo) : emptyDraft);
    current.saveDraft(id, { ...draft, ...patch });
  }, []);
  function safely(action: () => void) { try { action(); } catch (error) { notify(error instanceof Error ? error.message : '操作未完成，请重试。'); } }
  function saveEdit(id: string) {
    const current = workspaceRef.current; const memo = current.memos.find((entry) => entry.id === id); if (!memo) return;
    const draft = current.cache.drafts[id]; if (!draft) { setEditingId(null); return; }
    if (!draft.content.trim()) { notify('笔记内容不能为空，草稿已保留。'); return; }
    current.save({ ...draft, id, tags: tagsFromContent(draft.content), isPinned: memo.isPinned });
    setEditingId(null);
  }
  function startEditing(id: string) {
    const current = workspaceRef.current; const memo = current.memos.find((entry) => entry.id === id); if (!memo) return;
    if (!current.cache.drafts[id]) current.saveDraft(id, draftFromMemo(memo));
    setEditingId(id);
  }
  function addMemo() {
    const draft = workspaceRef.current.cache.drafts.new ?? emptyDraft;
    if (!draft.content.trim()) return;
    workspaceRef.current.save({ ...draft, id: crypto.randomUUID(), tags: tagsFromContent(draft.content), isPinned: false });
    workspaceRef.current.saveDraft('new', emptyDraft);
  }
  function changeLinks(source: string | null, target: string, remove = false) {
    const id = source ?? 'new'; const current = workspaceRef.current; const memo = current.memos.find((entry) => entry.id === id);
    const draft = current.cache.drafts[id] ?? (memo ? draftFromMemo(memo) : emptyDraft);
    if (!remove && id === target) return;
    const links = remove ? draft.links.filter((value) => value !== target) : [...new Set([...draft.links, target])];
    if (source && source !== editingId && memo) {
      if (remove && !memo.links.includes(target)) {
        const linked = current.memos.find((entry) => entry.id === target);
        if (linked) current.save({ ...draftFromMemo(linked), id: linked.id, links: linked.links.filter((value) => value !== source), isPinned: linked.isPinned });
      } else current.save({ ...draft, id, links, isPinned: memo.isPinned });
    } else updateDraft(id, { links });
  }
  function changeAudio(source: string | null, clip: AudioClipView | number) {
    const id = source ?? 'new'; const current = workspaceRef.current; const memo = current.memos.find((entry) => entry.id === id);
    const draft = current.cache.drafts[id] ?? (memo ? draftFromMemo(memo) : emptyDraft);
    let attachments = draft.attachments;
    if (typeof clip === 'number') { const audio = attachments.filter((entry) => entry.kind === 'audio')[clip]; attachments = attachments.filter((entry) => entry.mediaId !== audio?.mediaId); }
    else attachments = [...attachments, { mediaId: clip.mediaId, kind: 'audio' }];
    updateDraft(id, { attachments });
  }
  function menuAction(event: MouseEvent, id: string, action: 'toggle-public' | 'pin' | 'unpin' | 'edit' | 'share' | 'delete') {
    event.stopPropagation(); setActiveMenuId(null);
    const memo = workspaceRef.current.memos.find((entry) => entry.id === id); if (!memo) return;
    safely(() => {
      if (action === 'edit') startEditing(id);
      else if (action === 'share') setShareId(id);
      else if (action === 'delete') workspace.remove(memo);
      else workspace.save({ ...draftFromMemo(memo), id, isPinned: action === 'pin' ? true : action === 'unpin' ? false : memo.isPinned, isPublic: action === 'toggle-public' ? !memo.isPublic : memo.isPublic }, action === 'toggle-public' ? 'visibility' : 'pin');
    });
  }
  async function resetTodayReview() {
    if (!workspace.canWrite) { notify('此标签页只读，请在正在编辑的标签页重置回顾。'); return; }
    if (!isAuthenticated || localOnly) { notify('请连接并登录后重置回顾。'); return; }
    const timezone = preferences && 'reviewTimezone' in preferences ? preferences.reviewTimezone : 'Asia/Shanghai';
    const day = businessDay(new Date(), timezone);
    const today = workspace.memos.filter((memo) => businessDay(new Date(memo.createdAt), timezone) === day);
    if (!today.length) { notify('今日无可重置的卡片'); return; }
    try {
      const results = new Map<string, { revision: number }>();
      let offset: number | null = 0;
      while (offset !== null) {
        const response = await ListReviewResultsAPI({ day, timezone, limit: 500, offset });
        for (const result of response.items) results.set(result.memoId, result);
        offset = response.nextOffset;
      }
      await ResetReviewGroupAPI({ day, timezone, entries: today.map((memo) => ({ memoId: memo.id, operationId: crypto.randomUUID(), baseRevision: results.get(memo.id)?.revision ?? 0 })) });
      notify(`已重置今日 ${today.length} 条为 FAIL`);
    } catch (error) { notify(error instanceof Error ? error.message : '重置未完成，请重试。'); }
  }
  async function favoriteBackground() {
    if (!workspace.canWrite) { notify('此标签页只读，请在正在编辑的标签页收藏背景。'); return; }
    if (!preferences || !('reviewTimezone' in preferences) || localOnly || !preferences.background.mediaId) return;
    try { await updatePreferences({ ...PreferenceValuesSchema.strip().parse(preferences), background: { ...preferences.background, mode: 'image', useRandom: false } }); notify('已收藏当前背景'); }
    catch (error) { notify(error instanceof Error ? error.message : '背景收藏未完成，请重试。'); }
  }
  function generate(mode: 'continue' | 'optimize') {
    if (!workspace.canWrite) { notify('此标签页只读，请在正在编辑的标签页使用AI编辑草稿。'); return; }
    if (localOnly) { notify('请重新连接后使用AI。'); return; }
    const id = editingId ?? 'new'; const original = workspaceRef.current.cache.drafts[id]?.content ?? (editingId ? editingMemo?.content ?? '' : '');
    if (!original.trim()) { notify('请先在编辑框输入一些内容。'); return; }
    let generated = mode === 'continue' ? original : '';
    void ai.generate(mode, original, (chunk) => { generated += chunk; updateDraft(id, { content: generated }); });
  }

  useEffect(() => subscribeDevicePreferences(session.instanceId, () => setDevice(readDevicePreferences(session.instanceId))), [session.instanceId]);
  useEffect(() => {
    if (localOnly || !isAuthenticated) return;
    const controller = new AbortController(); void GetIntegrationStatusAPI({}, controller.signal).then((result) => setIntegrationConfigured(result.aiConfigured)).catch(() => {});
    return () => controller.abort();
  }, [isAuthenticated, localOnly]);
  useEffect(() => {
    const params = new URLSearchParams(); if (filter.query) params.set('q', filter.query); if (filter.tag) params.set('tag', filter.tag); if (filter.date) params.set('date', filter.date);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
  }, [filter]);
  useEffect(() => {
    const scroll = () => setShowScrollToTop((memosContainerRef.current?.scrollTop ?? window.scrollY) > 300);
    const element = memosContainerRef.current; element?.addEventListener('scroll', scroll); window.addEventListener('scroll', scroll);
    return () => { element?.removeEventListener('scroll', scroll); window.removeEventListener('scroll', scroll); };
  }, [isCanvasMode]);
  useEffect(() => {
    if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => () => { if (menuTimer.current) clearTimeout(menuTimer.current); }, []);
  useEffect(() => { document.body.style.overflow = isMobileSidebarOpen ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [isMobileSidebarOpen]);
  useEffect(() => {
    const move = (event: globalThis.MouseEvent) => {
      if (canvasToolPanelVisible || auxiliary || isAIDialogOpen || shareId) return;
      if (!isLeftSidebarPinned) setIsLeftSidebarHovered(event.clientX < (isLeftSidebarHovered ? 350 : 50));
      if (!isRightSidebarPinned) setIsRightSidebarHovered(event.clientX > window.innerWidth - (isRightSidebarHovered ? 350 : 50));
    };
    document.addEventListener('mousemove', move); return () => document.removeEventListener('mousemove', move);
  }, [auxiliary, canvasToolPanelVisible, isAIDialogOpen, isLeftSidebarHovered, isLeftSidebarPinned, isRightSidebarHovered, isRightSidebarPinned, shareId]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target; const typing = target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (event.key === 'Escape') { setIsMobileSidebarOpen(false); setActiveMenuId(null); return; }
      if (!isAuthenticated) { if (matchesShortcut(event, 'Ctrl+K')) { event.preventDefault(); searchInputRef.current?.focus(); } return; }
      const shortcuts = readDevicePreferences(session.instanceId).shortcuts;
      if (matchesShortcut(event, shortcuts.openSettings)) { event.preventDefault(); openSettings(); }
      else if (matchesShortcut(event, shortcuts.openDailyReview)) { event.preventDefault(); openReview(); }
      else if (matchesShortcut(event, shortcuts.openAIDialog)) { event.preventDefault(); openAI(); }
      else if (!typing && matchesShortcut(event, shortcuts.toggleCanvasMode)) { event.preventDefault(); startTransition(() => setIsCanvasMode((value) => !value)); }
      else if (!typing && matchesShortcut(event, shortcuts.toggleSidebar)) { event.preventDefault(); const current = readDevicePreferences(session.instanceId);
        try { saveDevicePreferences(session.instanceId, { ...current, sidebarPins: { left: !current.sidebarPins.left, right: !current.sidebarPins.right } }); }
        catch { setNotice('设备设置未能保存，请重试。'); } }
      else if (!typing && device.newMemoKey && event.key.toLowerCase() === device.newMemoKey) document.querySelector<HTMLTextAreaElement>('textarea.theme-selection')?.focus();
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [device.newMemoKey, isAuthenticated, openSettings, openReview, openAI, session.instanceId]);

  const extensionProps: WorkspaceExtensionProps = { session, localOnly, canWrite: workspace.canWrite, memos: workspace.memos, drafts: workspace.cache.drafts, saveDraft: workspace.saveDraft, recoverExternalDraft: workspace.recoverExternalDraft, save: workspace.save, remove: workspace.remove, refresh: workspace.synchronize, notify, select: setPreviewId, onToolPanelVisibleChange: setCanvasToolPanelVisible, isCanvasMode, onOpenTutorial: () => setIsTutorialOpen(true), musicSearchQuery, onCloseMusicSearch: () => setMusicSearchQuery(null) };
  const canvas = extensions.find((extension) => extension.id === 'canvas');
  const auxiliaryExtension = extensions.find((extension) => extension.id === auxiliary && (!extension.ownerOnly || isAuthenticated));
  const effectiveBgUrl = preferences?.background.mediaId ? ReadMediaAPI(preferences.background.mediaId) : '';
  const backgroundStyle = effectiveBgUrl ? { backgroundImage: `url(${effectiveBgUrl})`, backgroundSize: preferences?.background.fit ?? 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', filter: `brightness(${preferences?.background.brightness ?? 50}%)` } : {};
  const overlayStyle = effectiveBgUrl ? { backdropFilter: `blur(${preferences?.background.blur ?? 10}px)`, backgroundColor: 'rgba(255, 255, 255, 0.1)' } : {};
  const privateAI = preferences && 'aiEnabled' in preferences && preferences.aiEnabled;
  const conflicts = workspace.cache.outbox.filter((operation) => operation.status !== 'pending');

  return <PresentationProvider instanceId={session.instanceId} isAuthenticated={isAuthenticated} localOnly={localOnly} canWrite={workspace.canWrite} onLogin={onLogin} onLogout={onLogout} onSettings={openSettings} onRefresh={workspace.synchronize} notify={notify}>
    <div className={`bg-gray-50 dark:bg-gray-900 flex flex-col lg:flex-row relative ${isCanvasMode ? 'h-dvh min-h-0 overflow-hidden' : 'min-h-screen lg:overflow-hidden lg:h-screen'}`}>
      {effectiveBgUrl && <div className='absolute inset-0 z-0' style={backgroundStyle} />}{effectiveBgUrl && <div className='absolute inset-0 z-0' style={overlayStyle} />}
      <div className={`relative z-10 w-full flex flex-col lg:flex-row ${isCanvasMode ? 'h-full min-h-0' : 'min-h-screen lg:h-full'}`}>
        <LeftSidebar heatmapData={heatmapData} memos={ordinaryMemos} pinnedMemos={pinnedMemos} isLeftSidebarPinned={isLeftSidebarPinned} setIsLeftSidebarPinned={setIsLeftSidebarPinned} isLeftSidebarHovered={isLeftSidebarHovered} isAppLoaded isInitialLoad={false} isCanvasMode={isCanvasMode} setIsCanvasMode={changeCanvasMode} onSettingsOpen={openSettings} onDateClick={(date) => changeFilter({ date, tag: '' })} onOpenDailyReview={openReview} showFavoriteRandomButton={isAuthenticated && Boolean(preferences?.background.useRandom)} onFavoriteRandomBackground={() => void favoriteBackground()} isAuthenticated={isAuthenticated} onResetTodayReview={() => void resetTodayReview()} />
        <div className='flex-1 min-w-0 min-h-0 flex flex-col h-full'>
          {!workspace.canWrite && <div className='status-banner' role='status'>{workspace.writerPhase === 'unavailable' ? '浏览器无法建立本机写入锁。本页只读，请使用支持 Web Locks 的浏览器。' : '本页只读，正在等待其他标签页结束编辑。接管后会自动读取并恢复本机草稿与待提交内容。'}</div>}
          {(localOnly || workspace.error) && <div className='status-banner' role='status'>{localOnly ? '离线 · 会话尚未重新验证。内容保存在本机，所有提交已暂停。' : workspace.error}<button className='text-button ml-2' onClick={localOnly ? onReconnect : () => void workspace.synchronize()}>重试</button></div>}
          {workspace.cache.outbox.length > 0 && <div className='px-3 py-1 text-xs text-gray-500' aria-live='polite'>{workspace.cache.outbox.length} 项更改已保存在本机，{workspace.status === 'syncing' ? '正在提交…' : '等待提交。'}</div>}
          {workspace.cache.deletedDraftIds.map((id) => { const draft = workspace.cache.drafts[id]; return draft && <section className='conflict-card' role='alert' key={`deleted-draft-${id}`}><h2>原笔记已删除，编辑草稿仍保存在本机</h2><p>这份草稿不会自动重建已删除笔记。可转到新笔记编辑框，检查后再保存。</p><details><summary>查看保留的草稿</summary><pre>{draft.content}</pre></details><div className='dialog-actions'><button className='button' disabled={!workspace.canWrite} onClick={() => safely(() => { workspace.recoverDraft(id); setEditingId(null); if (isCanvasMode) changeCanvasMode(false); notify('草稿已恢复到新笔记编辑框，尚未提交。'); })}>转存新草稿</button><button className='button' disabled={!workspace.canWrite} onClick={() => safely(() => workspace.discardDraft(id))}>放弃这份草稿</button></div></section>; })}
          {conflicts.map((operation) => <section className='conflict-card' key={operation.operationId} role='alert'><h2>{operation.status === 'invalid' ? '这条更改需要修正' : '这条笔记有更新冲突'}</h2><p>{operation.message}</p>{operation.input && <details><summary>查看本地保留内容</summary><pre>{operation.input.content}</pre></details>}<div className='dialog-actions'>{operation.status === 'invalid' && <button className='button' onClick={() => safely(() => startEditing(operation.memoId))}>编辑并修正</button>}<button className='button' onClick={() => safely(() => workspace.discard(operation.memoId))}>{operation.status === 'invalid' ? '放弃未提交更改' : '采用远端版本'}</button>{operation.remote && <button className='button' onClick={() => safely(() => workspace.retry(operation.memoId))}>确认保留本地修改</button>}{!operation.remote && operation.input && <button className='button' onClick={() => safely(() => { updateDraft('new', { ...operation.input, baseRevision: 0 }); workspace.discard(operation.memoId); })}>转存新草稿</button>}</div></section>)}
          {ai.running && <div className='status-banner'>AI正在生成，已收到的文字会保存在草稿。<button className='text-button ml-2' onClick={ai.cancel}>停止</button></div>}{ai.error && <div className='status-banner' role='alert'>{ai.error}</div>}
          {isCanvasMode && isAuthenticated && canvas ? canvas.render(extensionProps) : <MainContent memoWriteDisabled={!workspace.canWrite} isLeftSidebarHidden={false} isRightSidebarHidden={false} setIsLeftSidebarHidden={() => {}} setIsRightSidebarHidden={() => {}} isLeftSidebarPinned={isLeftSidebarPinned} isRightSidebarPinned={isRightSidebarPinned} searchQuery={filter.query} setSearchQuery={(query) => changeFilter({ query })} newMemo={newDraft.content} setNewMemo={(content) => safely(() => updateDraft('new', { content }))} filteredMemos={filteredMemos} pinnedMemos={pinnedMemos} activeMenuId={activeMenuId} editingId={editingId} editContent={editDraft.content} activeTag={filter.tag || null} activeDate={filter.date || null} showScrollToTop={showScrollToTop} searchInputRef={searchInputRef} memosContainerRef={memosContainerRef} menuRefs={menuRefs} onMobileMenuOpen={() => setIsMobileSidebarOpen(true)} onAddMemo={() => safely(addMemo)} onMenuAction={menuAction} onMenuContainerEnter={(id) => { if (menuTimer.current) clearTimeout(menuTimer.current); setActiveMenuId(id); }} onMenuContainerLeave={() => { menuTimer.current = setTimeout(() => setActiveMenuId(null), 180); }} onMenuButtonClick={(id) => setActiveMenuId((value) => value === id ? null : id)} onEditContentChange={(content) => safely(() => { if (editingId) updateDraft(editingId, { content }); })} onSaveEdit={(id) => safely(() => saveEdit(id))} onCancelEdit={() => setEditingId(null)} onTagClick={(tag) => changeFilter({ tag: tag ?? '', date: '' })} onScrollToTop={() => memosContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} clearFilters={() => changeFilter({ query: '', tag: '', date: '' })} onEditorFocus={() => setIsEditorFocused(true)} onEditorBlur={() => setIsEditorFocused(false)} allMemos={memos} onAddBacklink={(source, target) => safely(() => changeLinks(source, target))} onPreviewMemo={setPreviewId} pendingNewBacklinks={newDraft.links} onRemoveBacklink={(source, target) => safely(() => changeLinks(source, target, true))} pendingNewAudioClips={audioClips(newDraft)} onAddAudioClip={(source, clip) => safely(() => changeAudio(source, clip))} onRemoveAudioClip={(source, index) => safely(() => changeAudio(source, index))} isAuthenticated={isAuthenticated} onOpenMusicSearch={openMusicSearch} />}
        </div>
        <RightSidebar memos={memos} activeTag={filter.tag || null} setActiveTag={(tag) => changeFilter({ tag: tag ?? '', date: '' })} isRightSidebarPinned={isRightSidebarPinned} setIsRightSidebarPinned={setIsRightSidebarPinned} isRightSidebarHovered={isRightSidebarHovered} isAppLoaded isInitialLoad={false} isCanvasMode={isCanvasMode} />
      </div>
      <MobileSidebar isOpen={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)} heatmapData={heatmapData} memos={memos} activeTag={filter.tag || null} setActiveTag={(tag) => { changeFilter({ tag: tag ?? '', date: '' }); setIsMobileSidebarOpen(false); }} onSettingsOpen={openSettings} onDateClick={(date) => { changeFilter({ date, tag: '' }); setIsMobileSidebarOpen(false); }} isAuthenticated={isAuthenticated} />
      {auxiliaryExtension?.render({ ...extensionProps, isOpen: true, onClose: () => setAuxiliary(null) })}
      <ShareDialog isOpen={Boolean(shareId)} onClose={() => setShareId(null)} memo={memos.find((memo) => memo.id === shareId) ?? null} />
      <MemoPreviewDialog open={Boolean(previewId)} onClose={() => setPreviewId(null)} memo={memos.find((memo) => memo.id === previewId) ?? null} />
      <TutorialDialog isOpen={isTutorialOpen} onClose={() => setIsTutorialOpen(false)} />
      {aiDialogState !== 'unopened' && <AIDialog isOpen={isAIDialogOpen} onClose={() => setAIDialogState('closed')} memos={workspace.memos} localOnly={localOnly} canWrite={workspace.canWrite} />}
      {persistentTools?.(extensionProps)}
      {!isCanvasMode && isAuthenticated && <AIButton isSettingsOpen={auxiliary === 'settings'} isShareDialogOpen={Boolean(shareId)} isEditorFocused={isEditorFocused} enabled={Boolean(privateAI && integrationConfigured)} onContinue={() => generate('continue')} onOptimize={() => generate('optimize')} onChat={openAI} />}
      {notice && <div className='workspace-notice' role='status'>{notice}<button className='text-button' onClick={() => setNotice('')}>关闭</button></div>}
    </div>
  </PresentationProvider>;
}
