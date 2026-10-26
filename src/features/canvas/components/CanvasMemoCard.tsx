import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MoreVertical } from 'lucide-react';
import type { Memo, MemoInput } from '../../../objects/memos/Memo';
import type { MemoDraft } from '../../../system/storage/WorkspaceCache';
import ContentRenderer from '../../../pages/Index/presentation/ContentRenderer';
import { usePreferences } from '../../settings/PreferencesProvider';
import MediaAttachment from '../../media/MediaAttachment';

interface Props {
  instanceId: string;memo: Memo;style: CSSProperties;selected: boolean;dragging?: boolean;readOnly?: boolean;initialDraft?: MemoDraft;initialEditing?: boolean;
  onSave: (input: MemoInput) => void;onDraft: (draft: MemoDraft) => void;onDelete: () => void;
  onPin: () => void;onSelect: () => void;notify: (message: string) => void;
}
export default function CanvasMemoCard({ instanceId,memo,style,selected,dragging=false,readOnly=false,initialDraft,initialEditing=false,onSave,onDraft,onDelete,onPin,onSelect,notify }: Props) {
  const { preferences }=usePreferences();
  const fontSize=preferences?.font.size?`${preferences.font.size}px`:undefined;
  const [editing,setEditing]=useState(initialEditing||Boolean(initialDraft)),[content,setContent]=useState(initialDraft?.content??memo.content),[menu,setMenu]=useState(false);
  const element=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),baseline=useRef(initialDraft?.baseRevision??memo.revision);
  const snapshot=useRef({ ...memo,...initialDraft }),latest=useRef({ editing,content,memo,onSave,onDelete,notify,readOnly });latest.current={ editing,content,memo,onSave,onDelete,notify,readOnly };
  function enterEdit() { if (readOnly) return;snapshot.current={ ...memo,...initialDraft };baseline.current=initialDraft?.baseRevision??memo.revision;setContent(initialDraft?.content??memo.content);setEditing(true);setMenu(false); }
  function commit() {
    const value=latest.current;if (value.readOnly||!value.editing) return;
    if (!value.content.trim()) { if (value.memo.revision===0) value.onDelete();else value.notify('笔记内容不能为空，草稿已保留。');return; }
    try { value.onSave({ ...snapshot.current,content: value.content,baseRevision: baseline.current });setEditing(false); }
    catch (cause) { value.notify(cause instanceof Error?cause.message:'保存失败，草稿已保留。'); }
  }
  const commitRef=useRef(commit);commitRef.current=commit;
  useEffect(() => {
    const outside=(event: PointerEvent) => { if (!(event.target instanceof Node)||element.current?.contains(event.target)) return;setMenu(false);commitRef.current(); };
    const escape=(event: KeyboardEvent) => { if (event.key==='Escape') { setMenu(false);commitRef.current(); } };
    const delay=setTimeout(() => { document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape); },100);
    return () => { clearTimeout(delay);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape);if (timer.current) clearTimeout(timer.current); };
  },[]);
  function hover(open: boolean) { if (readOnly) return;if (timer.current) clearTimeout(timer.current);timer.current=setTimeout(() => setMenu(open),open?300:150); }
  const menuButton='block w-full text-left px-3 py-2 sm:px-4 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';
  return <div ref={element} className={`draggable-memo absolute -translate-x-1/2 -translate-y-1/2 group ${editing?'cursor-text':'cursor-grab active:cursor-grabbing'} transition-shadow duration-200 ease-out ${dragging?'ring-2 ring-blue-300/60 shadow-xl':'hover:shadow-md'}`} data-canvas-object={`memo:${memo.id}`} data-selected={selected||undefined} aria-grabbed={dragging} tabIndex={0} aria-label={`画布笔记：${memo.content.slice(0,40)}`} style={{ ...style,width: 320,minWidth: 280,maxWidth: 400,willChange: dragging?'transform':'auto',...(dragging?{ transform: 'translate(-50%, -50%) scale(1.03)',transition: 'none' }:{}),touchAction: 'none',userSelect: editing?'text':'none' }} onFocus={onSelect} onDoubleClick={(event) => { if (event.target instanceof Element&&event.target.closest('.memo-menu')) return;event.preventDefault();event.stopPropagation();enterEdit(); }}>
    <div className={`relative rounded-xl border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm transition-colors ${memo.isPinned?'pl-3':''}`}>
      {memo.isPinned&&<div className='absolute -left-1 top-3 h-3 w-3 rounded-full bg-yellow-400 shadow ring-2 ring-yellow-200' aria-hidden />}
      <div className='p-3 sm:p-3 pb-9 relative'>
        <div className='absolute top-3 right-3 sm:top-4 sm:right-4 memo-menu' onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}><button type='button' disabled={readOnly} onClick={(event) => { event.stopPropagation();if (timer.current) clearTimeout(timer.current);setMenu(!menu); }} className='p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' aria-label='操作菜单' aria-expanded={menu}><MoreVertical className='h-4 w-4 text-gray-500' /></button>
          {menu&&!readOnly&&<div className='absolute w-44 sm:w-52 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-200 dark:border-gray-700' style={{ top: '100%',right: 0,marginTop: 6 }} onClick={(event) => event.stopPropagation()}><button type='button' className={menuButton} onClick={() => { onPin();setMenu(false); }}>{memo.isPinned?'取消置顶':'置顶'}</button><button type='button' className={menuButton} onClick={enterEdit}>编辑</button><button type='button' className='block w-full text-left px-3 py-2 sm:px-4 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30' onClick={() => { onDelete();setMenu(false); }}>删除</button><div className='border-t border-gray-100 dark:border-gray-700 mt-1 pt-1 px-3 py-2 sm:px-4 text-xs text-gray-500 dark:text-gray-400 space-y-0.5'><div className='truncate'>字数: {memo.content.length}字</div><div className='truncate'>创建: {new Date(memo.createdAt).toLocaleString('zh-CN',{ month: 'short',day: 'numeric',hour: '2-digit',minute: '2-digit' })}</div><div className='truncate'>修改: {new Date(memo.updatedAt).toLocaleString('zh-CN',{ month: 'short',day: 'numeric',hour: '2-digit',minute: '2-digit' })}</div></div></div>}
        </div>
        {editing&&!readOnly?<div className='memo-edit px-4 custom-font-content' style={{ fontSize }}><textarea value={content} maxLength={200000} onChange={(event) => { const value=event.target.value;setContent(value);try { onDraft({ content: value,tags: snapshot.current.tags,links: snapshot.current.links,attachments: snapshot.current.attachments,isPublic: snapshot.current.isPublic,baseRevision: baseline.current }); } catch (cause) { notify(cause instanceof Error?cause.message:'草稿未能保存。'); } }} onKeyDown={(event) => { if (event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.nativeEvent.isComposing) { event.preventDefault();commit(); } }} className='w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent scrollbar-transparent scrollbar-thin custom-font-content' style={{ fontSize }} rows={4} autoFocus placeholder='编辑想法...' aria-label='编辑画布笔记内容' /></div>:<div className='px-4 custom-font-content' style={{ fontSize }} onDoubleClick={(event) => { event.stopPropagation();enterEdit(); }}>{memo.content?<ContentRenderer content={memo.content} activeTag={null} onTagClick={() => {}} />:<div className='text-gray-400 italic'>双击编辑...</div>}{memo.attachments.map((attachment) => <MediaAttachment key={attachment.mediaId} instanceId={instanceId} {...attachment} />)}</div>}
        <div className='absolute bottom-2 right-3 text-[11px] text-gray-400 dark:text-gray-500 select-none pointer-events-none'>{new Date(memo.createdAt).toLocaleDateString()}</div>
      </div>
    </div>
  </div>;
}
