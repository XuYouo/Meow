import type { MemoListProps } from './OriginalViewProps';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Card, CardContent } from './OriginalPrimitives';
import { Clock, MoreVertical, ArrowUp, X, Image, Globe, Lock } from 'lucide-react';
import MemoEditor from './MemoEditor';
import ContentRenderer from './ContentRenderer';
import { useTheme } from '../../../features/presentation/PresentationContext';
import { usePresentationActions } from '../../../features/presentation/PresentationContext';
import { getPendingMediaBlob, getMediaContentURL } from '../../../features/media/pendingMedia';

const MemoList = ({
  memos,
  pinnedMemos,
  activeMenuId,
  editingId,
  editContent,
  activeTag,
  activeDate, // 新增日期筛选状态
  showScrollToTop,
  menuRefs,
  memosContainerRef,
  onMenuAction,
  onMenuContainerEnter,
  onMenuContainerLeave,
  onMenuButtonClick,
  onEditContentChange,
  onSaveEdit,
  onCancelEdit: _onCancelEdit,
  onTagClick,
  onScrollToTop,
  clearFilters, // 新增清除筛选函数
  // backlinks
  allMemos = [],
  onAddBacklink,
  onPreviewMemo,
  onRemoveBacklink,
  onAddAudioClip,
  onRemoveAudioClip,
  // 公开状态控制
  isAuthenticated = true
}: MemoListProps) => {
  const { themeColor } = useTheme();
  const { instanceId, notify } = usePresentationActions();
  const memosForBacklinks = (allMemos && allMemos.length) ? allMemos : [...pinnedMemos, ...memos];
  const editingWrapperRef = useRef<HTMLDivElement | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string,string>>({});
  const audioRefs = useRef<Record<string,HTMLAudioElement>>({});
  const [playing, setPlaying] = useState<Record<string,boolean>>({});

  const formatMs = (ms: number) => {
    if (!ms && ms !== 0) return '';
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    void Promise.all(memos.flatMap((memo) => memo.audioClips.map(async (clip, index) => {
      const blob = await getPendingMediaBlob(instanceId, clip.mediaId);
      if (!active) return [`${memo.id}:${index}`, ''] as const;
      const url = blob ? URL.createObjectURL(blob) : getMediaContentURL(clip.mediaId);
      if (blob) urls.push(url);
      return [`${memo.id}:${index}`, url] as const;
    }))).then((entries) => { if (active) setAudioUrls(Object.fromEntries(entries)); }).catch((error: unknown) => {
      if (active) notify(error instanceof Error ? error.message : '录音读取失败。');
    });
    return () => { active = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [memos, instanceId, notify]);

  // 计算菜单位置
  const getMenuPosition = (memoId: string) => {
    const menuElement = menuRefs.current[memoId];
    if (!menuElement) return { style: { opacity: 0 } };

    const buttonRect = menuElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const menuWidth = 192; // w-48 = 192px
    const rightSpace = viewportWidth - buttonRect.right;

    const style: CSSProperties = {
      top: buttonRect.bottom + 5,
      opacity: 1,
    };

    if (rightSpace < menuWidth) {
      // 如果右侧空间不足，将菜单对齐到按钮左侧
      style.right = 'auto';
      style.left = buttonRect.left - menuWidth + buttonRect.width;
    } else {
      // 否则对齐到按钮右侧
      style.right = viewportWidth - buttonRect.right;
      style.left = 'auto';
    }

    return { style };
  };

  // 当列表中有正在编辑的 memo 时，点击编辑器外自动保存并退出编辑
  useEffect(() => {
    if (!editingId) return;
    const handleOutside = (e: globalThis.MouseEvent | TouchEvent) => {
      const el = editingWrapperRef.current;
      if (!el) return;
      const target = e.target;
      if (target instanceof Node && el.contains(target)) return; // 点击在编辑器内，忽略
      // 在编辑器外点击，自动保存并退出
      try {
        onSaveEdit?.(editingId);
      } catch (error) { notify(error instanceof Error ? error.message : '保存未完成，草稿已保留。'); }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [editingId, onSaveEdit, notify]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 标题区域 */}
      <div className="p-3 sm:p-4 lg:p-6 pb-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 flex items-center flex-shrink-0">
            <Clock
              className="h-4 w-4 sm:h-5 sm:w-5 mr-2 transition-colors duration-300"
              style={{ color: themeColor }}
            />
            {isAuthenticated ? '近期想法' : 'Memos'}
          </h2>
          
          {/* 筛选条件显示区域 */}
          {(activeTag || activeDate) && (
            <div className="flex items-center mb-3 sm:mb-4">
              <div 
                className="flex items-center px-3 py-1 rounded-full text-sm"
                style={{ 
                  backgroundColor: `${themeColor}20`,
                  color: themeColor,
                  border: `1px solid ${themeColor}`
                }}
              >
                <span className="mr-2">
                  {activeTag ? `#${activeTag}` : activeDate}
                </span>
                <button 
                  onClick={clearFilters}
                  className="flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
                  style={{ color: themeColor }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 滚动容器 */}
  <div
        ref={memosContainerRef}
        className="flex-1 overflow-y-auto mobile-memos-container lg:mobile-memos-container-disabled px-3 sm:px-4 lg:px-6 pb-3 sm:pb-4 lg:pb-6 min-h-[250px]"
      >
    {memos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p>还没有记录任何想法</p>
              <p className="text-sm mt-2">在顶部输入框写下你的第一个想法吧</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-hidden">
            <div className="space-y-4 pb-4">
      {memos.map(memo => (
                <Card
                  key={memo.id}
                  className={`group hover:shadow-md transition-shadow rounded-xl shadow-sm relative bg-white dark:bg-gray-800 ${
                    pinnedMemos.some(p => p.id === memo.id) ? 'border-l-4' : ''
                  }`}
                  style={pinnedMemos.some(p => p.id === memo.id) ? { borderLeftColor: themeColor } : {}}
                >
                  <CardContent className="p-3 sm:p-4">

                    {/* 菜单按钮 - 只有登录用户才能看到 */}
                    {isAuthenticated && (
                    <div
                      className="absolute top-3 right-3 sm:top-4 sm:right-4"
                      ref={(el) => { menuRefs.current[memo.id] = el; }}
                      onMouseEnter={() => onMenuContainerEnter(memo.id)}
                      onMouseLeave={onMenuContainerLeave}
                    >
                      <button
                        onClick={() => onMenuButtonClick(memo.id)}
                        className="p-1 rounded-full hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 touch:opacity-100"
                        aria-label="操作菜单"
                      >
                        <MoreVertical className="h-4 w-4 text-gray-500" />
                      </button>

                      {/* 菜单面板 */}
                      {activeMenuId === memo.id && (
                        <div
                          className="fixed w-40 sm:w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-200 dark:border-gray-700 transition-opacity duration-150"
                          onClick={(e) => e.stopPropagation()}
                          style={getMenuPosition(memo.id).style}
                        >
                          {/* 公开/私有切换按钮 */}
                          {isAuthenticated && (
                            <button
                              onClick={(e) => onMenuAction(e, memo.id, 'toggle-public')}
                              className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                            >
                              {memo.is_public ? (
                                <>
                                  <Lock className="h-4 w-4 mr-2 flex-shrink-0" />
                                  <span className="truncate">设为私有</span>
                                </>
                              ) : (
                                <>
                                  <Globe className="h-4 w-4 mr-2 flex-shrink-0" />
                                  <span className="truncate">设为公开</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* 置顶/取消置顶按钮 */}
                          {pinnedMemos.some(p => p.id === memo.id) ? (
                            <button
                              onClick={(e) => onMenuAction(e, memo.id, 'unpin')}
                              className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 12l3-3 3 3M8 21l4-7 4 7M16 3h5v5M21 3l-7.5 7.5" />
                              </svg>
                              <span className="truncate">取消置顶</span>
                            </button>
                          ) : (
                            <button
                              onClick={(e) => onMenuAction(e, memo.id, 'pin')}
                              className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 12l2 2 4-4M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
                              </svg>
                              <span className="truncate">置顶</span>
                            </button>
                          )}

                          {/* 编辑按钮 */}
                          <button
                            onClick={(e) => onMenuAction(e, memo.id, 'edit')}
                            className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            <span className="truncate">编辑</span>
                          </button>

                          {/* 分享图按钮 */}
                          <button
                            onClick={(e) => onMenuAction(e, memo.id, 'share')}
                            className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          >
                            <Image className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">分享图</span>
                          </button>

                          {/* 删除按钮 */}
                          <button
                            onClick={(e) => onMenuAction(e, memo.id, 'delete')}
                            className="block w-full text-left px-3 py-2 sm:px-4 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            <span className="truncate">删除</span>
                          </button>
                          
                          {/* memo信息 */}
                          <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1 px-3 py-2 sm:px-4 text-xs text-gray-500 dark:text-gray-400">
                            <div className="truncate">字数: {memo.content.length}字</div>
                            <div className="truncate">创建: {new Date(memo.createdAt).toLocaleString('zh-CN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</div>
                            <div className="truncate">修改: {new Date(memo.updatedAt).toLocaleString('zh-CN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                    
        {editingId === memo.id && isAuthenticated ? (
                      <div className="mb-4" ref={editingWrapperRef}>
                        <div className="relative">
                          <MemoEditor
                            value={editContent}
                            onChange={onEditContentChange}
                            placeholder="编辑想法..."
                            maxLength={5000}
                            showCharCount={true}
                            autoFocus={true}
                            memosList={memosForBacklinks}
                            currentMemoId={memo.id}
                            backlinks={Array.isArray(memo.backlinks) ? memo.backlinks : []}
                            onAddBacklink={onAddBacklink}
                            onPreviewMemo={onPreviewMemo}
                            onRemoveBacklink={onRemoveBacklink}
                            audioClips={Array.isArray(memo.audioClips) ? memo.audioClips : []}
                            onRemoveAudioClip={onRemoveAudioClip}
                            onAddAudioClip={onAddAudioClip}
                            onSubmit={() => onSaveEdit(memo.id)}
                          />
                        </div>
                      </div>
                    ) : (
                      <ContentRenderer
                        content={memo.content}
                        activeTag={activeTag}
                        onTagClick={onTagClick}
                      />
                    )}

                    {/* 反链 chips（展示在每条 memo 下面） */}
        {Array.isArray(memo.backlinks) && memo.backlinks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {memo.backlinks.map((bid) => {
          const m = memosForBacklinks.find(x => x.id === bid);
                          if (!m) return null;
                          return (
                            <span key={`${memo.id}-bk-${bid}`} className="inline-flex items-center group">
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPreviewMemo?.(bid); }}
                                className="max-w-full inline-flex items-center gap-1 pl-2 pr-2 py-0.5 rounded-md bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                              >
                                <span className="truncate inline-block max-w-[200px]">{m.content?.replace(/\n/g, ' ').slice(0, 60) || '（无内容）'}</span>
                                {/* 小箭头图标 */}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-70">
                                  <path d="M7 17L17 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                  <path d="M9 7H17V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                              </button>
                              {/* hover 才出现的小 × */}
                              <button
                                type="button"
                                className="ml-1 w-4 h-4 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveBacklink?.(memo.id, bid); }}
                                aria-label="移除反链"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* 音频录音（展示在每条 memo 底部，芯片风格） */}
                    {Array.isArray(memo.audioClips) && memo.audioClips.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {memo.audioClips.map((clip, idx) => {
                          const key = `${memo.id}:${idx}`;
                          const src = audioUrls[key] || clip.url || '';
                          const isPlaying = !!playing[key];
                          return (
                            <span key={key} className="inline-flex items-center group">
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); const el = audioRefs.current[key]; if (!el) return; if (el.paused) { el.play(); setPlaying(p=>({...p,[key]:true})); } else { el.pause(); setPlaying(p=>({...p,[key]:false})); } }}
                                className="max-w-full inline-flex items-center gap-1 pl-2 pr-2 py-0.5 rounded-md bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                title="播放录音"
                              >
                                {isPlaying ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                                    <path d="M8 6h3v12H8zM13 6h3v12h-3z" fill="currentColor" />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                                    <path d="M8 5l12 7-12 7V5z" fill="currentColor" />
                                  </svg>
                                )}
                                <span className="truncate inline-block max-w-[200px]">录音{clip?.durationMs ? ` · ${formatMs(clip.durationMs)}` : ''}</span>
                              </button>
                              <audio
                                ref={(el) => { if (el) audioRefs.current[key] = el; }}
                                src={src}
                                style={{ display: 'none' }}
                                onEnded={() => setPlaying((p) => ({ ...p, [key]: false }))}
                              />
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-end space-x-2">
                      {/* 公开状态图标 - 仅登录用户可见 */}
                      {isAuthenticated && (
                        <div className="flex items-center">
                          {memo.is_public ? (
                            <Globe className="h-4 w-4 text-green-600 dark:text-green-400" aria-label="公开" />
                          ) : (
                            <Lock className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-label="私有" />
                          )}
                        </div>
                      )}

                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(memo.updatedAt).toLocaleString('zh-CN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* 回到顶部按钮 */}
        {showScrollToTop && (
          <button
            onClick={onScrollToTop}
            className="absolute bottom-6 right-6 z-30 flex items-center justify-center w-12 h-12 rounded-full bg-gray-200/90 dark:bg-gray-700/90 text-gray-700 dark:text-gray-300 transition-all duration-300 hover:bg-gray-300/90 dark:hover:bg-gray-600/90 hover:scale-110 shadow-lg backdrop-blur-sm border border-gray-300/20 dark:border-gray-600/20"
            aria-label="回到顶部"
            title="回到顶部"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MemoList;
