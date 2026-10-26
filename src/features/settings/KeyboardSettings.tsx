import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Keyboard } from 'lucide-react';
import { readDevicePreferences, saveDevicePreferences, KeyboardShortcutsSchema, type KeyboardShortcuts } from '../../system/storage/DevicePreferences';
import { shortcutFromEvent } from '../../system/storage/KeyboardShortcut';
import { Label } from '../presentation/ui/label';

const actions: {key:keyof KeyboardShortcuts;title:string;description:string;shortTitle:string}[] = [
  {key:'toggleSidebar',title:'取消/固定侧栏',description:'切换左右侧栏的固定状态',shortTitle:'侧栏'},
  {key:'openAIDialog',title:'AI对话',description:'快速打开AI对话功能',shortTitle:'AI'},
  {key:'openSettings',title:'打开设置',description:'快速打开设置面板',shortTitle:'设置'},
  {key:'toggleCanvasMode',title:'画布模式',description:'快速切换画布模式',shortTitle:'画布'},
  {key:'openDailyReview',title:'每日回顾',description:'快速打开每日回顾',shortTitle:'回顾'},
];
export default function KeyboardSettings({instanceId,disabled,onError}:{instanceId:string;disabled:boolean;onError:(message:string)=>void}) {
  const [expanded,setExpanded]=useState(false);
  const [shortcuts,setShortcuts]=useState(()=>readDevicePreferences(instanceId).shortcuts);
  const [recording,setRecording]=useState<keyof KeyboardShortcuts|null>(null);
  const [display,setDisplay]=useState('');
  const combination=useRef<string|null>(null);
  function save(action:keyof KeyboardShortcuts,binding:string|null) {
    if(disabled)return;
    const parsed=KeyboardShortcutsSchema.safeParse({...shortcuts,[action]:binding});
    if(!parsed.success){onError('该快捷键已被使用，请选择其他组合。');return;}
    try { saveDevicePreferences(instanceId,{...readDevicePreferences(instanceId),shortcuts:parsed.data});setShortcuts(parsed.data); }
    catch { onError('快捷键无法保存在此浏览器。'); }
  }
  useEffect(()=>{
    if(!recording||disabled)return;
    const down=(event:KeyboardEvent)=>{
      event.preventDefault();event.stopImmediatePropagation();
      if(event.key==='Escape'){setRecording(null);return;}
      const binding=shortcutFromEvent(event);
      if(binding){combination.current=binding;setDisplay(binding);}
    };
    const up=(event:KeyboardEvent)=>{
      event.preventDefault();event.stopImmediatePropagation();
      if(combination.current){save(recording,combination.current);setRecording(null);setDisplay('');}
    };
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);
    return ()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);};
  });
  return <div className='space-y-4'>
    <div className='flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors' onClick={()=>setExpanded((value)=>!value)}>
      <Label className='text-sm font-medium cursor-pointer flex items-center'><Keyboard className='h-4 w-4 mr-2'/>快捷键设置</Label>
      <button type='button' aria-label='展开快捷键设置' aria-expanded={expanded} className='p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors' onClick={(event)=>{event.stopPropagation();setExpanded((value)=>!value);}}>{expanded?<ChevronUp className='h-4 w-4'/>:<ChevronDown className='h-4 w-4'/>}</button>
    </div>
    {expanded&&<div className='animate-in slide-in-from-top-2 duration-200'><div className='space-y-4 pl-4 pr-2 pb-4'><div className='space-y-3'><Label className='text-sm font-medium'>快捷键设置</Label><div className='grid grid-cols-1 gap-3'>
      {actions.map((action)=><div key={action.key} className='flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg'>
        <div className='flex flex-col space-y-1 flex-1'><span className='text-sm font-medium'>{action.title}</span><span className='text-xs text-gray-500 dark:text-gray-400'>{action.description}</span></div>
        <button type='button' disabled={disabled} aria-label={`录制${action.title}快捷键`} onClick={()=>{setRecording(action.key);setDisplay('');combination.current=null;}} className={`shortcut-recording px-3 py-2 text-sm rounded-lg border transition-colors text-left min-w-[100px] ${recording===action.key?'border-blue-500 bg-blue-50 dark:bg-blue-950/20':'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}`}>
          {recording===action.key?<div className='flex flex-col items-center space-y-1'><div className='flex items-center space-x-2'><div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'/><span className='text-blue-600 dark:text-blue-400 text-xs font-medium'>录制中...</span></div>{display&&<div className='text-xs text-gray-600 dark:text-gray-400 font-mono font-medium'>{display}</div>}</div>:<kbd className='px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600'>{shortcuts[action.key]??'已禁用'}</kbd>}
        </button>
      </div>)}
    </div></div><p className='text-xs text-gray-500 dark:text-gray-400'>提示：点击快捷键框录制，松开后保存，Esc 取消。Command 与 Ctrl 等价。</p><div className='flex flex-wrap gap-2'>{actions.map((action)=><button type='button' disabled={disabled} className='text-xs text-gray-500 underline' key={action.key} onClick={()=>save(action.key,null)}>禁用{action.shortTitle}快捷键</button>)}</div></div></div>}
  </div>;
}
