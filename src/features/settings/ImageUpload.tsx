import { useRef, useState, type DragEvent } from 'react';
import { Image as ImageIcon, Link, Loader2, X } from 'lucide-react';
import { ImportImageURLAPI } from '../../apis/integrations/ImportImageURLAPI';
import { stagePendingMedia } from '../media/pendingMedia';
import { useMediaURL } from '../media/useMediaURL';
import { Button } from '../presentation/ui/button';
import { Input } from '../presentation/ui/input';

interface ImageUploadProps { value:string|null;instanceId:string;localOnly:boolean;onChange:(mediaId:string|null)=>void;onClear:()=>void;uploadType:'avatar'|'background';disabled:boolean }
function Preview({ instanceId,mediaId }: {instanceId:string;mediaId:string}) {
  const {url}=useMediaURL(instanceId,mediaId);
  return <img src={url} alt='已选择的图片' className='w-full h-full object-cover rounded-lg' />;
}
export default function ImageUpload({value,instanceId,localOnly,onChange,onClear,uploadType,disabled}:ImageUploadProps) {
  const [url,setURL]=useState(''),[busy,setBusy]=useState(false),[dragging,setDragging]=useState(false),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null);
  async function fileSelected(file:File) {if(disabled)return;setBusy(true);setError('');try {if(!file.type.startsWith('image/'))throw new Error('请选择图片文件');const media=await stagePendingMedia(instanceId,file);onChange(media.mediaId);}catch(cause){setError(cause instanceof Error?cause.message:'图片暂存失败');}finally{setBusy(false);}}
  async function importURL() {if(!url || busy || localOnly || disabled)return;setBusy(true);setError('');try{const media=await ImportImageURLAPI({id:crypto.randomUUID(),operationId:crypto.randomUUID(),url});onChange(media.id);setURL('');}catch(cause){setError(cause instanceof Error?cause.message:'图片地址导入失败');}finally{setBusy(false);}}
  function drop(event:DragEvent<HTMLDivElement>) {event.preventDefault();setDragging(false);const file=event.dataTransfer.files[0];if(file&&!busy&&!disabled)void fileSelected(file);}
  return <div className='space-y-3'>
    {value ? <div className='relative w-full h-32 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600'><Preview instanceId={instanceId} mediaId={value}/><Button type='button' variant='destructive' size='sm' onClick={onClear} disabled={busy||disabled} aria-label={`清除${uploadType === 'avatar'?'头像':'背景'}`} className='absolute top-2 right-2 h-6 w-6 p-0'><X className='h-3 w-3'/></Button></div> : <>
      <div className='flex space-x-2'><div className='relative flex-1'><Link className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400'/><Input type='url' value={url} onChange={(event)=>setURL(event.target.value)} placeholder='输入图片链接' className='pl-10' disabled={busy||localOnly||disabled} onKeyDown={(event)=>{if(event.key==='Enter'){event.preventDefault();void importURL();}}}/></div><Button type='button' variant='outline' size='sm' onClick={()=>void importURL()} disabled={!url||busy||localOnly||disabled}>{busy?<Loader2 className='h-4 w-4 animate-spin'/>:'确定'}</Button></div>
      <div role='button' tabIndex={busy||disabled?-1:0} aria-label='上传图片' onKeyDown={(event)=>{if((event.key==='Enter'||event.key===' ')&&!busy&&!disabled){event.preventDefault();input.current?.click();}}} onDragOver={(event)=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={drop} onClick={()=>{if(!busy&&!disabled)input.current?.click();}} className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragging?'border-blue-500 bg-blue-50 dark:bg-blue-900/20':'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'} ${busy?'opacity-50 cursor-not-allowed':''}`}>
        {busy?<Loader2 className='h-8 w-8 mx-auto mb-2 text-gray-400 animate-spin'/>:<ImageIcon className='h-8 w-8 mx-auto mb-2 text-gray-400'/>}<p className='text-sm text-gray-600 dark:text-gray-400'>{busy?'正在处理图片…':'点击或拖拽图片到此处'}</p><p className='text-xs text-gray-500 mt-1'>支持图片文件，最大 25 MB</p>
      </div>
    </>}
    <input ref={input} type='file' accept='image/*' className='hidden' disabled={busy||disabled} onChange={(event)=>{const file=event.target.files?.[0];event.target.value='';if(file)void fileSelected(file);}}/>
    {error&&<p role='alert' className='text-xs text-red-500'>{error}</p>}
  </div>;
}
