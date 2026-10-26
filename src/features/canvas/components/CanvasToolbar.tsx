import { ArrowRight, Circle, Eraser, Image as ImageIcon, Minus, Pencil, Square, Type } from 'lucide-react';
import type { CanvasTool } from '../objects/CanvasTool';

export const tools: { id: CanvasTool;icon: typeof Square;hotkey: string;label: string }[]=[
  { id: 'rectangle',icon: Square,hotkey: '1',label: '矩形' },{ id: 'ellipse',icon: Circle,hotkey: '2',label: '圆形' },
  { id: 'text',icon: Type,hotkey: '3',label: '文字' },{ id: 'arrow',icon: ArrowRight,hotkey: '4',label: '箭头' },
  { id: 'line',icon: Minus,hotkey: '5',label: '直线' },{ id: 'pencil',icon: Pencil,hotkey: '6',label: '画笔' },
  { id: 'eraser',icon: Eraser,hotkey: '7',label: '橡皮擦' },{ id: 'image',icon: ImageIcon,hotkey: '8',label: '图片' },
];
export default function CanvasToolbar({ selectedTool,onSelectTool,disabled }: { selectedTool: CanvasTool;onSelectTool: (tool: CanvasTool) => void;disabled: boolean }) {
  return <div className='absolute top-3 left-1/2 -translate-x-1/2 z-40 canvas-ui'><div className='flex items-center gap-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur shadow-lg px-2 py-1' role='toolbar' aria-label='画布工具'>
    <Tooltip.Provider>{tools.map(({ id,icon: Icon,hotkey,label }) => <Tooltip.Root key={id}><Tooltip.Trigger asChild><button type='button' aria-label={label} aria-pressed={selectedTool===id} disabled={disabled} onClick={() => onSelectTool(id)} className={`inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 h-10 w-10 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 relative ${selectedTool===id?'bg-gray-100 dark:bg-gray-700':''}`}><Icon className='h-5 w-5' /><span className='absolute -bottom-0.5 -right-0.5 text-[11px] leading-none font-semibold pointer-events-none select-none text-gray-900 dark:text-gray-100 [text-shadow:_0_0_2px_rgba(255,255,255,0.6)] dark:[text-shadow:_0_0_2px_rgba(0,0,0,0.6)]' aria-hidden>{hotkey}</span></button></Tooltip.Trigger><Tooltip.Content side='bottom' sideOffset={4} className='z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 select-none'><div className='flex items-center gap-2'><span>{label}</span><span className='text-xs text-gray-400'>{hotkey}</span></div></Tooltip.Content></Tooltip.Root>)}</Tooltip.Provider>
  </div></div>;
}
import * as Tooltip from '@radix-ui/react-tooltip';
