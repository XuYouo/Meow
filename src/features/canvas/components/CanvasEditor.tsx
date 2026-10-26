import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';

export default function CanvasEditor({ value,onChange,onSubmit,disabled }: { value: string;onChange: (value: string) => void;onSubmit: () => void;disabled: boolean }) {
  const textarea=useRef<HTMLTextAreaElement>(null),container=useRef<HTMLDivElement>(null);
  const [height,setHeight]=useState(40);
  useEffect(() => {
    const adjust=() => { const field=textarea.current;if (!field) return;field.style.height='auto';const next=Math.max(40,Math.min(field.scrollHeight,96));field.style.height=`${next}px`;setHeight(field.offsetHeight||next); };
    adjust();window.addEventListener('resize',adjust);return () => window.removeEventListener('resize',adjust);
  },[value]);
  useEffect(() => {
    const outside=(event: PointerEvent) => { if (event.target instanceof Node&&!container.current?.contains(event.target)&&document.activeElement===textarea.current) textarea.current?.blur(); };
    document.addEventListener('pointerdown',outside,true);return () => document.removeEventListener('pointerdown',outside,true);
  },[]);
  return <div className='absolute bottom-4 left-1/2 -translate-x-1/2 z-30 canvas-ui' style={{ pointerEvents: 'auto' }}><div ref={container} className='flex items-end gap-2'><textarea ref={textarea} value={value} disabled={disabled} onChange={(event) => { if (!disabled) onChange(event.target.value); }} onKeyDown={(event) => { if (event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing) { event.preventDefault();if (value.trim()&&!disabled) onSubmit(); } }} placeholder='输入笔记内容...（Enter 发送，Shift+Enter 换行）' aria-label='画布新笔记内容' className='w-80 md:w-[520px] px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl resize-none bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-inner [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]' style={{ minHeight: 40,maxHeight: 96 }} rows={1} maxLength={200000} /><button type='button' onClick={onSubmit} disabled={!value.trim()||disabled} className='rounded-lg bg-slate-600 hover:bg-slate-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white shadow-md px-3 flex items-center justify-center transition-colors' style={{ height }} title='发送笔记' aria-label='发送画布笔记'><Send className='h-4 w-4' /></button></div></div>;
}
