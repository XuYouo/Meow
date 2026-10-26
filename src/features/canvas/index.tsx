import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { z } from 'zod';
import type { CanvasDocument, CanvasPoint, CanvasShape, CanvasStyle } from '../../../shared/contracts/canvas';
import { CanvasPointSchema } from '../../../shared/contracts/canvas';
import type { WorkspaceExtensionProps } from '../../pages/Index/index';
import type { Memo, MemoInput } from '../../objects/memos/Memo';
import { MemoDraftSchema, type MemoDraft } from '../../system/storage/WorkspaceCache';
import { ImportImageURLAPI } from '../../apis/integrations/ImportImageURLAPI';
import { useCanvasDocument } from './hooks/useCanvasDocument';
import { useRetainedCanvasDrafts } from './hooks/useRetainedCanvasDrafts';
import { defaultStyle, eraseShapes, makeShape, moveObjects, nextLayer, reorderLayers, shapeBounds, toWorld, zoomAt, type DrawingTool } from './functions/geometry';
import type { CanvasLayerAction, CanvasTool } from './objects/CanvasTool';
import CanvasToolbar, { tools } from './components/CanvasToolbar';
import ToolOptionsPanel from './components/ToolOptionsPanel';
import CanvasEditor from './components/CanvasEditor';
import CanvasMemoCard from './components/CanvasMemoCard';
import ShapeView from './components/ShapeView';
import { getMediaContentURL, stagePendingMedia } from '../media/pendingMedia';
import './canvas.css';

interface Props extends WorkspaceExtensionProps { onToolPanelVisibleChange?: (visible: boolean) => void }
type Gesture=
  | { kind: 'pan';start: CanvasPoint;original: CanvasDocument }
  | { kind: 'move';start: CanvasPoint;original: CanvasDocument;ids: Set<string> }
  | { kind: 'draw';start: CanvasPoint;original: CanvasDocument;tool: DrawingTool;id: string;points: CanvasPoint[] }
  | { kind: 'erase';original: CanvasDocument }
  | { kind: 'selection';start: CanvasPoint;original: CanvasDocument;initial: Set<string> };
const newMemoSchema=z.object({ id: z.string().uuid(),position: CanvasPointSchema,draft: MemoDraftSchema });
type NewMemo=z.infer<typeof newMemoSchema>;
const emptyDraft: MemoDraft={ content: '',tags: [],links: [],attachments: [],isPublic: false,baseRevision: 0 };

export default function CanvasFeature(props: Props) {
  if (props.session.principal!=='owner') return null;
  return <OwnerCanvasFeature key={`${props.session.instanceId}:${props.canWrite?'writer':'reader'}`} {...props} />;
}
function OwnerCanvasFeature(props: Props) {
  const canvas=useCanvasDocument(props.session.instanceId,props.localOnly,undefined,props.canWrite);
  const canWriteRef=useRef(props.canWrite);canWriteRef.current=props.canWrite;
  useEffect(() => { canWriteRef.current=props.canWrite;return () => { canWriteRef.current=false; }; },[props.canWrite]);
  function assertWriter() { if (!canWriteRef.current) throw new Error('另一标签页正在编辑，此页面只读。'); }
  const retained=useRetainedCanvasDrafts(props.session.instanceId,props.canWrite);
  const newMemoKey=`meow:v2:${props.session.instanceId}:owner:canvas-new-memo`;
  const [tool,setTool]=useState<CanvasTool>('select'),[style,setStyle]=useState<CanvasStyle>(defaultStyle);
  const [textColor,setTextColor]=useState('#111827'),[cornerRadius,setCornerRadius]=useState(8);
  const [selected,setSelected]=useState<Set<string>>(new Set()),[preview,setPreview]=useState<CanvasDocument|null>(null);
  const [eraserWhole,setEraserWhole]=useState(false),[uploading,setUploading]=useState(false),[space,setSpace]=useState(false),[dropHint,setDropHint]=useState(false);
  const [draftError,setDraftError]=useState('');
  const [selectionRect,setSelectionRect]=useState<{ x: number;y: number;width: number;height: number }|null>(null);
  const [eraserTrail,setEraserTrail]=useState<CanvasPoint[]>([]);
  const [zoomTip,setZoomTip]=useState<{ x: number;y: number }|null>(null);
  const [newMemo,setNewMemo]=useState<NewMemo|null>(() => { try { const raw=localStorage.getItem(newMemoKey);return raw?newMemoSchema.parse(JSON.parse(raw)):null; } catch { return null; } });
  const bottomDraft=props.drafts.new??emptyDraft;
  const [history,setHistory]=useState<CanvasDocument[]>([]),[future,setFuture]=useState<CanvasDocument[]>([]);
  const stage=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null),previewRef=useRef<CanvasDocument|null>(null),awaitingExit=useRef(false);
  const current=useRef(canvas.document),selectedRef=useRef(selected),viewportRef=useRef(canvas.document.viewport),canvasRef=useRef(canvas);
  const rawDocument=preview??canvas.document;
  const document=eraserWhole&&gesture.current?.kind==='erase'?{ ...rawDocument,shapes: gesture.current.original.shapes.map((shape) => rawDocument.shapes.some((item) => item.id===shape.id)?shape:{ ...shape,style: { ...shape.style,opacity: Math.max(0.25,shape.style.opacity*0.4) } }) }:rawDocument;
  current.current=canvas.document;selectedRef.current=selected;viewportRef.current=document.viewport;canvasRef.current=canvas;
  const isBlocked=!props.canWrite||canvas.status==='loading'||canvas.status==='conflict';
  const selectedShapes=document.shapes.filter((shape) => selected.has(`shape:${shape.id}`));
  const selectedShape=selectedShapes.length===1?selectedShapes[0]:undefined;
  const panelTool=tool!=='select'?tool:selectedShape?.type??'select';
  const panelVisible=props.canWrite&&panelTool!=='select';
  const toolPanelChanged=props.onToolPanelVisibleChange;
  useEffect(() => { toolPanelChanged?.(panelVisible);return () => toolPanelChanged?.(false); },[panelVisible,toolPanelChanged]);
  const panelStyle=selectedShape&&tool==='select'?selectedShape.style:panelTool==='text'?{ ...style,stroke: textColor }:style;
  const changeCanvas=canvas.change,notify=props.notify;
  const persist=useCallback((next: CanvasDocument,remember=true) => {
    try {
      if (!canWriteRef.current) throw new Error('另一标签页正在编辑，此页面只读。');
      if (canvasRef.current.status==='loading'||canvasRef.current.status==='conflict') throw new Error('请等待画布读取完成，或先处理更新冲突。');
      const previous=current.current;changeCanvas(next);
      if (remember) { setHistory((items) => [...items,previous].slice(-40));setFuture([]); }
    } catch (cause) { notify(cause instanceof Error?cause.message:'画布更改未能保存，请重试。'); }
  },[changeCanvas,notify]);
  const persistRef=useRef(persist);persistRef.current=persist;
  const latest=useRef({ props,tool,style,textColor,cornerRadius,history,future });latest.current={ props,tool,style,textColor,cornerRadius,history,future };
  useEffect(() => {
    const element=stage.current;if (!canWriteRef.current||!element) return;
    const initialize=() => {
      if (!canWriteRef.current) return;
      const state=canvasRef.current;
      if (state.pending&&state.document.memoPositions.every((position) => props.memos.some((memo) => memo.id===position.memoId&&memo.revision>0))) state.retry();
      if (state.status==='loading'||state.status==='conflict'||element.clientWidth<=0||element.clientHeight<=0) return;
      const existing=new Set(state.document.memoPositions.map((position) => position.memoId));
      const missing=props.memos.filter((memo) => !existing.has(memo.id));
      if (!missing.length) return;
      const center=toWorld({ x: element.clientWidth/2,y: element.clientHeight/2 },state.document.viewport);
      persistRef.current({ ...state.document,memoPositions: [...state.document.memoPositions,...missing.map((memo) => { const index=props.memos.findIndex((item) => item.id===memo.id),angle=index/Math.max(props.memos.length,1)*Math.PI*2;return { memoId: memo.id,x: center.x+Math.cos(angle)*220,y: center.y+Math.sin(angle)*220,z: nextLayer(state.document)+index }; })] },false);
    };
    initialize();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(initialize):null;
    observer?.observe(element);window.addEventListener('resize',initialize);
    return () => { observer?.disconnect();window.removeEventListener('resize',initialize); };
  },[props.memos,canvas.status]);
  useEffect(() => {
    try {
      const pending=localStorage.getItem(newMemoKey);if (pending) newMemoSchema.parse(JSON.parse(pending));
      setDraftError('');
    } catch { setDraftError('本地笔记草稿格式无法识别。原记录已保留，请先保留浏览器数据。'); }
  },[newMemoKey]);
  useEffect(() => {
    if (props.canWrite) return;
    const sync=(event: StorageEvent) => {
      if (event.key!==newMemoKey&&event.key!==null) return;
      try {
        const pending=localStorage.getItem(newMemoKey);
        setNewMemo(pending?newMemoSchema.parse(JSON.parse(pending)):null);
      } catch { setDraftError('本地笔记草稿格式无法识别。原记录已保留。'); }
    };
    window.addEventListener('storage',sync);return () => window.removeEventListener('storage',sync);
  },[newMemoKey,props.canWrite]);
  useEffect(() => {
    const element=stage.current;if (!element) return;
    const wheel=(event: WheelEvent) => {
      if (canvasRef.current.status==='loading'||canvasRef.current.status==='conflict'||event.target instanceof Element&&event.target.closest('.canvas-ui,.memo-edit')) return;
      if (!event.ctrlKey&&!event.metaKey) return;
      event.preventDefault();const rect=element.getBoundingClientRect(),point={ x: event.clientX-rect.left,y: event.clientY-rect.top };
      const viewport=zoomAt(viewportRef.current,point,event.deltaY<0?1.1:0.9);viewport.scale=Math.max(0.5,Math.min(2.5,viewport.scale));
      const world=toWorld(point,viewportRef.current);viewport.x=point.x-world.x*viewport.scale;viewport.y=point.y-world.y*viewport.scale;
      persistRef.current({ ...current.current,viewport },false);
    };
    element.addEventListener('wheel',wheel,{ passive: false });return () => element.removeEventListener('wheel',wheel);
  },[]);
  useEffect(() => {
    const down=(event: KeyboardEvent) => {
      if (!latest.current.props.canWrite) return;
      if (event.target instanceof Element&&event.target.closest('.canvas-ui,input,textarea,button,select,a,[contenteditable=true]')) return;
      const found=tools.find((item) => item.hotkey===event.key);
      if (found) { event.preventDefault();setTool(found.id);setSelected(new Set());awaitingExit.current=false; }
      if (event.code==='Space') { event.preventDefault();setSpace(true); }
      if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z') { event.preventDefault();const list=event.shiftKey?latest.current.future:latest.current.history,next=list.at(-1);if (next) { if (event.shiftKey) { setFuture(list.slice(0,-1));setHistory((items) => [...items,current.current]); } else { setHistory(list.slice(0,-1));setFuture((items) => [...items,current.current]); }persistRef.current(next,false); } }
      if ((event.key==='Delete'||event.key==='Backspace')&&selectedRef.current.size) { event.preventDefault();persistRef.current({ ...current.current,shapes: current.current.shapes.filter((shape) => !selectedRef.current.has(`shape:${shape.id}`)) });setSelected(new Set()); }
      if (event.key.startsWith('Arrow')&&selectedRef.current.size) { event.preventDefault();const step=event.shiftKey?30:5;persistRef.current(moveObjects(current.current,selectedRef.current,{ x: event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,y: event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0 })); }
      if (event.key==='Escape') { setSelected(new Set());setTool('select'); }
    };
    const up=(event: KeyboardEvent) => { if (event.code==='Space') setSpace(false); };
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);return () => { window.removeEventListener('keydown',down);window.removeEventListener('keyup',up); };
  },[]);
  function localPoint(event: { clientX: number;clientY: number }): CanvasPoint { const rect=stage.current?.getBoundingClientRect();return { x: event.clientX-(rect?.left??0),y: event.clientY-(rect?.top??0) }; }
  function showPreview(next: CanvasDocument) { previewRef.current=next;setPreview(next); }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (isBlocked||event.target instanceof Element&&event.target.closest('.canvas-ui,.memo-edit,[contenteditable=true],button,a,input,textarea,select')) return;
    if (event.button!==0&&event.button!==1) return;
    event.preventDefault();const point=localPoint(event),world=toWorld(point,document.viewport),original=current.current;
    const target=event.target instanceof Element?event.target.closest<HTMLElement>('[data-canvas-object]')?.dataset.canvasObject:undefined;
    stage.current?.setPointerCapture(event.pointerId);
    if (event.button===1||space) { gesture.current={ kind: 'pan',start: point,original };return; }
    if (awaitingExit.current&&tool!=='eraser'&&!target) { awaitingExit.current=false;setTool('select');return; }
    if (target?.startsWith('memo:')||tool==='select') {
      if (!target) { gesture.current={ kind: 'selection',start: world,original,initial: event.ctrlKey||event.metaKey?selected:new Set() };setSelected(event.ctrlKey||event.metaKey?selected:new Set());return; }
      const ids=event.shiftKey?new Set(selected.has(target)?[...selected].filter((id) => id!==target):[...selected,target]):selected.has(target)?selected:new Set([target]);setSelected(ids);gesture.current={ kind: 'move',start: world,original,ids };return;
    }
    if (tool==='text'||tool==='image'||target) return;
    if (tool==='eraser') { gesture.current={ kind: 'erase',original };setEraserTrail([world]);showPreview(eraseShapes(original,world,Math.max(14,style.strokeWidth*6),eraserWhole));return; }
    const id=crypto.randomUUID();gesture.current={ kind: 'draw',start: world,original,tool,id,points: [world] };
    const shape=makeShape(tool,world,{ x: world.x+1,y: world.y+1 },[world,world],style,id,nextLayer(original));if (shape.type==='rectangle') shape.cornerRadius=cornerRadius;
    showPreview({ ...original,shapes: [...original.shapes,shape] });setSelected(new Set([`shape:${id}`]));
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active=gesture.current;if (!active) return;const point=localPoint(event),world=toWorld(point,active.original.viewport);
    if (active.kind==='pan') showPreview({ ...active.original,viewport: { ...active.original.viewport,x: active.original.viewport.x+point.x-active.start.x,y: active.original.viewport.y+point.y-active.start.y } });
    else if (active.kind==='move') showPreview(moveObjects(active.original,active.ids,{ x: world.x-active.start.x,y: world.y-active.start.y }));
    else if (active.kind==='erase') { setEraserTrail((points) => [...points,world].slice(-32));showPreview(eraseShapes(previewRef.current??active.original,world,Math.max(14,style.strokeWidth*6),eraserWhole)); }
    else if (active.kind==='selection') {
      const rect={ x: Math.min(active.start.x,world.x),y: Math.min(active.start.y,world.y),width: Math.abs(world.x-active.start.x),height: Math.abs(world.y-active.start.y) };setSelectionRect(rect);
      setSelected(new Set([...active.initial,...active.original.shapes.filter((shape) => { const box=shapeBounds(shape);return box.x<=rect.x+rect.width&&box.x+box.width>=rect.x&&box.y<=rect.y+rect.height&&box.y+box.height>=rect.y; }).map((shape) => `shape:${shape.id}`)]));
    } else {
      if (active.points.length<4000) active.points.push(world);const shape=makeShape(active.tool,active.start,world,active.points,style,active.id,nextLayer(active.original));if (shape.type==='rectangle') shape.cornerRadius=cornerRadius;
      showPreview({ ...active.original,shapes: [...active.original.shapes,shape] });
    }
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) { const active=gesture.current;if (!active) return;const next=previewRef.current;gesture.current=null;previewRef.current=null;setPreview(null);setSelectionRect(null);if (stage.current?.hasPointerCapture(event.pointerId)) stage.current.releasePointerCapture(event.pointerId);if (next) persist(next,active.kind!=='pan');if (active.kind==='draw') awaitingExit.current=true; }
  function safeAction(action: () => void) { try { action(); } catch (cause) { props.notify(cause instanceof Error?cause.message:'操作未完成，请重试。'); } }
  function writeDraft(id: string,draft: MemoDraft) { assertWriter();props.saveDraft(id,MemoDraftSchema.parse(draft)); }
  function saveMemo(input: MemoInput,position?: CanvasPoint) { assertWriter();props.save(input);if (position&&!current.current.memoPositions.some((item) => item.memoId===input.id)) persist({ ...current.current,memoPositions: [...current.current.memoPositions,{ memoId: input.id,...position,z: nextLayer(current.current) }] }); }
  function newAt(position: CanvasPoint) { assertWriter();const existing=localStorage.getItem(newMemoKey);if (existing) { try { const pending=newMemoSchema.parse(JSON.parse(existing));if (pending.draft.content.trim()) { props.notify('请先完成已有画布笔记，内容仍保存在本机。');return; } } catch { props.notify('已有新笔记草稿格式无法识别，未覆盖原记录。');return; } }const value: NewMemo={ id: crypto.randomUUID(),position,draft: { content: '',tags: [],links: [],attachments: [],isPublic: false,baseRevision: 0 } };localStorage.setItem(newMemoKey,JSON.stringify(value));setNewMemo(value); }
  function doubleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (isBlocked||event.target instanceof Element&&event.target.closest('.draggable-memo,.canvas-ui,[data-canvas-object]')) return;
    const position=toWorld(localPoint(event),document.viewport);
    if (tool==='text') { const shape=makeShape('text',position,position,[],{ ...style,stroke: textColor },crypto.randomUUID(),nextLayer(document));if (shape.type==='text') { shape.text='双击编辑';shape.width=200;shape.height=50; }persist({ ...document,shapes: [...document.shapes,shape] });setSelected(new Set([`shape:${shape.id}`]));awaitingExit.current=true; }
    else safeAction(() => newAt(position));
  }
  function submitBottom() { if (!bottomDraft.content.trim()) return;const position=toWorld({ x: (stage.current?.clientWidth??800)/2,y: (stage.current?.clientHeight??600)/2 },document.viewport);saveMemo({ ...bottomDraft,id: crypto.randomUUID(),content: bottomDraft.content.trim(),baseRevision: 0,isPinned: false },position);props.saveDraft('new',emptyDraft); }
  function updateStyle(patch: Partial<CanvasStyle>) { if (panelTool==='text'&&patch.stroke) setTextColor(patch.stroke);else setStyle((value) => ({ ...value,...patch }));if (tool==='select'&&selected.size) persist({ ...document,shapes: document.shapes.map((shape) => selected.has(`shape:${shape.id}`)?{ ...shape,style: { ...shape.style,...patch } }:shape) }); }
  function layer(action: CanvasLayerAction) {
    if (action==='to-front'||action==='to-back') { persist(reorderLayers(document,selected,action==='to-front'));return; }
    const order=[...document.shapes.map((shape) => ({ key: `shape:${shape.id}`,z: shape.z })),...document.memoPositions.map((position) => ({ key: `memo:${position.memoId}`,z: position.z }))].sort((a,b) => a.z-b.z);
    const selectedIndex=order.findIndex((item) => selected.has(item.key)),otherIndex=selectedIndex+(action==='up'?1:-1),a=order[selectedIndex],b=order[otherIndex];if (!a||!b) return;
    const ranks=new Map(order.map((item,index) => [item.key,index]));ranks.set(a.key,otherIndex);ranks.set(b.key,selectedIndex);
    persist({ ...document,shapes: document.shapes.map((shape) => ({ ...shape,z: ranks.get(`shape:${shape.id}`)??shape.z })),memoPositions: document.memoPositions.map((position) => ({ ...position,z: ranks.get(`memo:${position.memoId}`)??position.z })) });
  }
  function insertImage(mediaId: string,width=240,height=180,alt='图片') {
    if (selectedShape?.type==='image'&&selected.size===1) { persist({ ...current.current,shapes: current.current.shapes.map((shape) => shape.id===selectedShape.id&&shape.type==='image'?{ ...shape,mediaId,alt }:shape) });return; }
    const center=toWorld({ x: (stage.current?.clientWidth??800)/2,y: (stage.current?.clientHeight??600)/2 },current.current.viewport),image: CanvasShape={ id: crypto.randomUUID(),type: 'image',mediaId,alt,x: center.x-width/2,y: center.y-height/2,width,height,z: nextLayer(current.current),style: { ...style },erasures: [] };
    persist({ ...current.current,shapes: [...current.current.shapes,image] });setTool('select');setSelected(new Set([`shape:${image.id}`]));
  }
  async function upload(file: File) {
    if (!canWriteRef.current) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { props.notify('请选择 JPG、PNG、GIF 或 WebP 图片。');return; }
    setUploading(true);try { const result=await stagePendingMedia(props.session.instanceId,file),bitmap=typeof createImageBitmap==='function'?await createImageBitmap(file).catch(() => null):null;const ratio=bitmap?Math.min(1,360/bitmap.width,260/bitmap.height):1;insertImage(result.mediaId,bitmap?Math.max(40,Math.round(bitmap.width*ratio)):240,bitmap?Math.max(40,Math.round(bitmap.height*ratio)):180,file.name);bitmap?.close(); } catch (cause) { props.notify(cause instanceof Error?cause.message:'图片保存失败。'); }finally { setUploading(false); }
  }
  async function importURL(url: string) {
    assertWriter();
    if (props.localOnly) throw new Error('重新连接并确认身份后才能读取图片直链。');setUploading(true);
    try {
      const media=await ImportImageURLAPI({ id: crypto.randomUUID(),operationId: crypto.randomUUID(),url });
      const size=await new Promise<{ width: number;height: number }>((resolve) => { const image=new Image();const timer=window.setTimeout(() => resolve({ width: 240,height: 180 }),5000);image.onload=() => { window.clearTimeout(timer);const ratio=Math.min(1,360/(image.naturalWidth||240),260/(image.naturalHeight||180));resolve({ width: Math.max(40,Math.round((image.naturalWidth||240)*ratio)),height: Math.max(40,Math.round((image.naturalHeight||180)*ratio)) }); };image.onerror=() => { window.clearTimeout(timer);resolve({ width: 240,height: 180 }); };image.src=getMediaContentURL(media.id); });
      insertImage(media.id,size.width,size.height,media.fileName);
    } finally { setUploading(false); }
  }
  const ephemeralMemo: Memo|undefined=newMemo?{ id: newMemo.id,...newMemo.draft,isPinned: false,revision: 0,backlinks: [],createdAt: new Date().toISOString(),updatedAt: new Date().toISOString() }:undefined;
  if (canvas.expired) return null;
  return <div className='relative flex-1 min-h-0 w-full h-full bg-gray-50 dark:bg-gray-900 overflow-hidden legacy-canvas' aria-label='想法画布'>
    <div ref={stage} className='absolute inset-0' style={{ cursor: gesture.current?.kind==='move'?'move':space?'grab':undefined,touchAction: 'none' }} onDoubleClick={doubleClick} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current=null;previewRef.current=null;setPreview(null);setSelectionRect(null); }} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')||event.dataTransfer.types.includes('text/uri-list')) { event.preventDefault();setDropHint(true); } }} onDragLeave={() => setDropHint(false)} onDrop={(event) => { event.preventDefault();setDropHint(false);if (!canWriteRef.current) return;const file=event.dataTransfer.files[0];if (file) void upload(file);else { const url=event.dataTransfer.getData('text/uri-list').split('\n').find((line) => line&&!line.startsWith('#'));if (url) void importURL(url.trim()).catch((cause: unknown) => props.notify(cause instanceof Error?cause.message:'图片读取失败')); } }}>
      <CanvasToolbar selectedTool={tool} disabled={isBlocked} onSelectTool={(value) => { setTool(value);setSelected(new Set());awaitingExit.current=false; }} />
      <ToolOptionsPanel visible={panelVisible} tool={panelTool} style={panelStyle} cornerRadius={selectedShape?.type==='rectangle'?selectedShape.cornerRadius:cornerRadius} eraseWhole={eraserWhole} onStyle={updateStyle} onCornerRadius={(radius) => { setCornerRadius(radius);if (tool==='select'&&selectedShape?.type==='rectangle') persist({ ...document,shapes: document.shapes.map((shape) => shape.id===selectedShape.id&&shape.type==='rectangle'?{ ...shape,cornerRadius: radius }:shape) }); }} onEraseWhole={setEraserWhole} onLayer={layer} onFile={(file) => void upload(file)} onImageURL={importURL} uploading={uploading} />
      {props.canWrite&&tool!=='select'&&<div className='absolute top-0 left-0 h-full z-30' style={{ width: 360,pointerEvents: 'auto' }} onMouseEnter={(event) => event.stopPropagation()} onMouseMove={(event) => event.stopPropagation()} onMouseLeave={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()} />}
      <div className='absolute inset-0 origin-top-left' style={{ transform: `translate(${document.viewport.x}px, ${document.viewport.y}px) scale(${document.viewport.scale})`,transformOrigin: '0 0' }}>
        <div className='absolute' style={{ width: 1000000,height: 1000000,left: -500000,top: -500000,backgroundImage: ['repeating-linear-gradient(to right, rgba(107,114,128,0.15) 0, rgba(107,114,128,0.15) 1px, transparent 1px, transparent 100px)','repeating-linear-gradient(to bottom, rgba(107,114,128,0.15) 0, rgba(107,114,128,0.15) 1px, transparent 1px, transparent 100px)','repeating-linear-gradient(to right, rgba(107,114,128,0.06) 0, rgba(107,114,128,0.06) 1px, transparent 1px, transparent 20px)','repeating-linear-gradient(to bottom, rgba(107,114,128,0.06) 0, rgba(107,114,128,0.06) 1px, transparent 1px, transparent 20px)'].join(', '),pointerEvents: 'none' }} />
        <svg className='absolute inset-0' style={{ zIndex: 1,width: '100%',height: '100%',pointerEvents: 'none',overflow: 'visible' }} aria-hidden>{gesture.current?.kind==='move'&&document.memoPositions.filter((position) => selected.has(`memo:${position.memoId}`)).flatMap((position) => document.memoPositions.filter((target) => target.memoId!==position.memoId&&Math.hypot(target.x-position.x,target.y-position.y)<160).map((target) => <line key={`${position.memoId}-${target.memoId}`} x1={position.x} y1={position.y} x2={target.x} y2={target.y} stroke='rgba(59, 130, 246, 0.45)' strokeWidth='2' strokeDasharray='4 6' />))}</svg>
        {[...document.shapes].sort((a,b) => a.z-b.z).map((shape) => <ShapeView key={shape.id} readOnly={!props.canWrite} instanceId={props.session.instanceId} shape={shape} selected={selected.has(`shape:${shape.id}`)} onSelect={() => { setSelected(new Set([`shape:${shape.id}`]));setTool('select'); }} onTextChange={(text) => persist({ ...current.current,shapes: current.current.shapes.map((item) => item.id===shape.id&&item.type==='text'?{ ...item,text: text||'双击编辑' }:item) })} />)}
        {eraserTrail.length>0&&<svg className='absolute inset-0' style={{ zIndex: 2,width: '100%',height: '100%',pointerEvents: 'none',overflow: 'visible' }}><g className='pointer-events-none transition-opacity duration-400' style={{ opacity: gesture.current?.kind==='erase'?1:0 }}>{eraserTrail.map((point,index) => { const t=(index+1)/eraserTrail.length;return <circle key={index} cx={point.x} cy={point.y} r={Math.max(14,style.strokeWidth*6)*(0.28+0.72*t)} fill='#ffffff' opacity={0.12+0.28*t} />; })}</g></svg>}
        {selectionRect&&<svg className='absolute inset-0' style={{ zIndex: 2,width: '100%',height: '100%',pointerEvents: 'none',overflow: 'visible' }}><rect {...selectionRect} fill='rgba(59,130,246,0.08)' stroke='#3b82f6' strokeDasharray='4 4' strokeWidth='1.5' /></svg>}
        {document.memoPositions.map((position) => { const memo=props.memos.find((item) => item.id===position.memoId);return memo?<CanvasMemoCard key={memo.id} readOnly={!props.canWrite} instanceId={props.session.instanceId} memo={memo} style={{ left: position.x,top: position.y,zIndex: 10+position.z }} selected={selected.has(`memo:${memo.id}`)} dragging={gesture.current?.kind==='move'&&selected.has(`memo:${memo.id}`)} initialDraft={props.drafts[memo.id]} onSave={(input) => saveMemo(input)} onDraft={(draft) => writeDraft(memo.id,draft)} onDelete={() => safeAction(() => props.remove(memo))} onPin={() => safeAction(() => props.save({ ...memo,isPinned: !memo.isPinned,baseRevision: memo.revision },'pin'))} onSelect={() => setSelected(new Set([`memo:${memo.id}`]))} notify={props.notify} />:null; })}
        {newMemo&&ephemeralMemo&&<CanvasMemoCard key={newMemo.id} readOnly={!props.canWrite} instanceId={props.session.instanceId} memo={ephemeralMemo} style={{ left: newMemo.position.x,top: newMemo.position.y,zIndex: 100000 }} selected initialEditing initialDraft={newMemo.draft} onSave={(input) => { saveMemo(input,newMemo.position);localStorage.removeItem(newMemoKey);setNewMemo(null); }} onDraft={(draft) => { const next={ ...newMemo,draft };localStorage.setItem(newMemoKey,JSON.stringify(next));setNewMemo(next); }} onDelete={() => { localStorage.removeItem(newMemoKey);setNewMemo(null); }} onPin={() => {}} onSelect={() => {}} notify={props.notify} />}
      </div>
      <CanvasEditor value={bottomDraft.content} disabled={isBlocked} onChange={(content) => safeAction(() => writeDraft('new',{ ...bottomDraft,content }))} onSubmit={() => safeAction(submitBottom)} />
      {retained.drafts.length>0&&<div className='absolute left-4 top-16 z-50 canvas-ui max-w-sm max-h-[60%] overflow-auto rounded-lg border border-orange-200 bg-white dark:bg-gray-800 px-3 py-2 text-xs space-y-3' role='region' aria-label='保留的画布草稿'>{retained.drafts.map((entry) => <section key={entry.key}><p>画布编辑草稿仍保存在本机</p><p className='mt-1 text-gray-500'>原笔记可能已删除。转存只创建新草稿，不会恢复原 ID。</p><details><summary>查看草稿</summary><pre className='whitespace-pre-wrap break-words'>{entry.draft.content}</pre></details><div className='flex gap-3 mt-1'><button type='button' disabled={!props.canWrite} onClick={() => safeAction(() => { assertWriter();props.recoverExternalDraft(entry.draft);retained.remove(entry.key);props.notify('草稿已转入底部新笔记编辑框，尚未提交。'); })}>转存新草稿</button><button type='button' disabled={!props.canWrite} onClick={() => safeAction(() => { assertWriter();retained.remove(entry.key); })}>放弃这份草稿</button></div></section>)}</div>}
      <div className='absolute right-4 bottom-4 z-30 flex flex-col items-end gap-2 canvas-ui'><div className='rounded-lg border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow px-2 py-1 flex items-center gap-1'><button type='button' className='px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded' aria-label='缩小画布' disabled={isBlocked} onClick={() => persist({ ...document,viewport: { ...document.viewport,scale: Math.max(0.5,document.viewport.scale*0.9) } },false)}>-</button><div className='px-2 text-sm tabular-nums text-gray-600 dark:text-gray-300 cursor-help relative' onMouseEnter={(event) => { const rect=event.currentTarget.getBoundingClientRect();setZoomTip({ x: Math.min(window.innerWidth-230,rect.left-120),y: rect.top-40 }); }} onMouseLeave={() => setZoomTip(null)}>{Math.round(document.viewport.scale*100)}%</div><button type='button' className='px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded' aria-label='放大画布' disabled={isBlocked} onClick={() => persist({ ...document,viewport: { ...document.viewport,scale: Math.min(2.5,document.viewport.scale*1.1) } },false)}>+</button><button type='button' className='ml-1 px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded' disabled={isBlocked} onClick={() => persist({ ...document,viewport: { x: 0,y: 0,scale: 1 } },false)}>重置</button></div></div>
      <div className={`fixed bg-gray-900 dark:bg-gray-800 text-white p-2 rounded text-xs pointer-events-none transition-opacity whitespace-nowrap shadow-lg border border-gray-700 ${zoomTip?'opacity-100':'opacity-0'}`} style={{ left: zoomTip?.x??0,top: zoomTip?.y??0,zIndex: 50,transform: zoomTip?'scale(1)':'scale(0.95)',transition: 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out' }}>鼠标中键拖拽画布，Ctrl+滚轮缩放</div>
      {dropHint&&<div className='fixed inset-0 z-40 pointer-events-none flex items-center justify-center'><div className='rounded-xl border border-blue-300/70 bg-blue-500/10 px-4 py-2 text-sm text-blue-700 dark:text-blue-200 shadow'>松开以上传图片到画布</div></div>}
      {(canvas.error||draftError||retained.error)&&<div className='absolute left-4 bottom-20 z-50 canvas-ui rounded-lg border border-orange-200 bg-white dark:bg-gray-800 px-3 py-2 text-xs max-w-md' role='alert'><p>{canvas.error||draftError||retained.error}</p>{canvas.status==='conflict'?<div className='flex gap-3 mt-2'><button type='button' onClick={() => canvas.resolve(false)}>采用服务器画布</button><button type='button' onClick={() => canvas.resolve(true)}>确认保留本地画布</button></div>:<button type='button' className='mt-1 text-blue-600' onClick={canvas.retry}>重试保存</button>}</div>}
      <span className='sr-only' role='status'>{canvas.status==='saving'?'正在同步画布':canvas.pending?'画布更改已保存在本机':'画布已同步'}</span>
    </div>
  </div>;
}
