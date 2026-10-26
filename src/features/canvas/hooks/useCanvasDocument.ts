import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { CanvasSchema, CanvasDocumentSchema, SaveCanvasInputSchema, type CanvasDocument, type CanvasDTO } from '../../../../shared/contracts/canvas';
import { ApiError } from '../../../system/api/sendAPI';
import { GetCanvasAPI } from '../../../apis/canvas/GetCanvasAPI';
import { SaveCanvasAPI } from '../../../apis/canvas/SaveCanvasAPI';
import { emptyDocument } from '../functions/geometry';
import { ensurePendingMediaUploaded, releasePendingMedia } from '../../media/pendingMedia';

const cacheSchema=z.object({ remote: CanvasSchema,queue: z.array(SaveCanvasInputSchema.extend({ dispatched: z.boolean().default(false) })).max(50) });
type Cache=z.infer<typeof cacheSchema>;
function fresh(): Cache { return { remote: { revision: 0,updatedAt: null,document: emptyDocument },queue: [] }; }
function load(key: string): { cache: Cache;error: string } {
  const raw=localStorage.getItem(key);
  if (!raw) return { cache: fresh(),error: '' };
  try { return { cache: cacheSchema.parse(JSON.parse(raw)),error: '' }; }
  catch { return { cache: fresh(),error: '本地画布格式无法识别。原数据已保留，请导出浏览器数据后重试。' }; }
}
export function useCanvasDocument(instanceId: string,localOnly=false,onSessionExpired?: () => void,canWrite=true) {
  const key=`meow:v2:${instanceId}:owner:canvas`;
  const [initial]=useState(() => load(key));
  const [cache,setCache]=useState(initial.cache);
  const [status,setStatus]=useState<'loading'|'ready'|'saving'|'error'|'conflict'>(initial.error?'error':localOnly||!canWrite?'ready':'loading');
  const [error,setError]=useState(initial.error);
  const [expired,setExpired]=useState(false);
  const expiredState=useRef(expired);expiredState.current=expired;
  const networkEnabled=useRef(!localOnly),expiredCallback=useRef(onSessionExpired),requests=useRef(new Set<AbortController>());
  networkEnabled.current=!localOnly&&!expired&&canWrite;expiredCallback.current=onSessionExpired;
  const writeEnabled=useRef(canWrite);writeEnabled.current=canWrite;
  const state=useRef(cache),inflight=useRef<{ operationId: string;controller: AbortController }|null>(null),blocked=useRef(Boolean(initial.error)),invalidCache=useRef(Boolean(initial.error)),mounted=useRef(true);
  const saveState=useCallback((next: Cache) => {
    if (!writeEnabled.current) throw new Error('另一标签页正在编辑，此页面只读。');
    localStorage.setItem(key,JSON.stringify(cacheSchema.parse(next)));
    state.current=next;
    if (mounted.current) setCache(next);
  },[key]);
  const reportError=useCallback((cause: unknown) => {
    if (!mounted.current) return;
    if (cause instanceof ApiError && cause.status===401) {
      networkEnabled.current=false;setExpired(true);setStatus('error');setError('会话已失效，请重新登录。');expiredCallback.current?.();return;
    }
    setError(cause instanceof Error?cause.message:'画布保存失败，本地更改已保留。');
    setStatus(cause instanceof ApiError && cause.status===409?'conflict':'error');
    if (cause instanceof ApiError && cause.status===409) blocked.current=true;
  },[]);
  const flush=useCallback(async () => {
    if (!networkEnabled.current || inflight.current || blocked.current || !state.current.queue.length) return;
    const operation=state.current.queue[0];
    if (!operation) return;
    const controller=new AbortController();requests.current.add(controller);
    inflight.current={ operationId: operation.operationId,controller };
    setStatus('saving');
    try {
      saveState({ ...state.current,queue: state.current.queue.map((entry) => entry.operationId===operation.operationId?{ ...entry,dispatched: true }:entry) });
      const imageIds=operation.document.shapes.filter((shape) => shape.type==='image').map((shape) => shape.mediaId);
      await ensurePendingMediaUploaded(instanceId,imageIds,controller.signal);
      if (!networkEnabled.current||controller.signal.aborted) return;
      const remote=await SaveCanvasAPI({ operationId: operation.operationId,baseRevision: operation.baseRevision,document: operation.document },controller.signal);
      if (!networkEnabled.current||controller.signal.aborted) return;
      const current=state.current;
      const remaining=current.queue.filter((entry) => entry.operationId!==operation.operationId);
      const first=remaining[0];
      saveState({ remote,queue: first?remaining.map((entry,index) => index===0?{ ...entry,baseRevision: remote.revision,dispatched: false }:entry):[] });
      if (inflight.current?.controller===controller) inflight.current=null;
      if (mounted.current) { setStatus('ready');setError(''); }
      try { await releasePendingMedia(instanceId,imageIds); } catch { if (mounted.current) setError('画布已同步，本地附件暂存清理失败，可稍后重试。'); }
    } catch (cause) {
      if (controller.signal.aborted) return;
      // A validated rejection confirms that this canvas write was not committed.
      // Let a subsequent edit replace it; uncertain network outcomes still replay exactly.
      if (cause instanceof ApiError && (cause.status===400 || cause.status===413)) {
        const current=state.current,newest=current.queue.at(-1);
        const queue=newest&&newest.operationId!==operation.operationId
          ?[{ ...newest,baseRevision: current.remote.revision,dispatched: false }]
          :current.queue.map((entry) => entry.operationId===operation.operationId?{ ...entry,dispatched: false }:entry);
        saveState({ ...current,queue });
      }
      if (cause instanceof ApiError && cause.status===409 && cause.details && typeof cause.details==='object' && 'current' in cause.details) {
        const result=CanvasSchema.safeParse(cause.details.current);
        if (result.success) saveState({ ...state.current,remote: result.data });
      }
      reportError(cause);
    } finally { requests.current.delete(controller);if (inflight.current?.controller===controller) inflight.current=null; }
  },[instanceId,reportError,saveState]);
  const refresh=useCallback(async (signal?: AbortSignal) => {
    if (!networkEnabled.current || invalidCache.current) return;
    const controller=new AbortController();requests.current.add(controller);
    const abort=() => controller.abort();signal?.addEventListener('abort',abort,{ once: true });
    try {
      const remote=await GetCanvasAPI(controller.signal);
      if (controller.signal.aborted || !mounted.current || !networkEnabled.current) return;
      const current=state.current;
      saveState({ ...current,remote });
      if (!current.queue.length) { setStatus('ready');setError(''); }
      else if (!blocked.current) await flush();
    } catch (cause) { if (!controller.signal.aborted) reportError(cause); }
    finally { requests.current.delete(controller);signal?.removeEventListener('abort',abort); }
  },[flush,reportError,saveState]);
  useEffect(() => {
    const adopt=() => {
      const loaded=load(key);
      state.current=loaded.cache;setCache(loaded.cache);setError(loaded.error);
      invalidCache.current=Boolean(loaded.error);blocked.current=Boolean(loaded.error);
      setStatus(loaded.error?'error':canWrite?'loading':'ready');
    };
    // The workspace owns the single Web Lock. A new writer must reread the
    // previous writer's persisted document before making any request or edit.
    adopt();
    if (canWrite) return;
    const changed=(event: StorageEvent) => { if (event.key===key||event.key===null) adopt(); };
    window.addEventListener('storage',changed);return () => window.removeEventListener('storage',changed);
  },[canWrite,key]);
  useEffect(() => {
    mounted.current=true;
    writeEnabled.current=canWrite;networkEnabled.current=canWrite&&!localOnly&&!expiredState.current;
    const controller=new AbortController();
    const currentRequests=requests.current;
    if (localOnly||!canWrite) { if (!invalidCache.current) setStatus('ready');return () => { mounted.current=false;writeEnabled.current=false;networkEnabled.current=false;controller.abort();for (const request of currentRequests) request.abort();inflight.current=null; }; }
    if (!invalidCache.current) void refresh(controller.signal);
    const retry=() => { if (!blocked.current) void refresh(controller.signal); };
    window.addEventListener('online',retry);
    const interval=window.setInterval(() => { if (!state.current.queue.length && !inflight.current) void refresh(controller.signal); },15_000);
    return () => { mounted.current=false;writeEnabled.current=false;networkEnabled.current=false;controller.abort();for (const request of currentRequests) request.abort();inflight.current=null;window.removeEventListener('online',retry);window.clearInterval(interval); };
  },[canWrite,localOnly,refresh]);
  useEffect(() => {
    if (localOnly || !canWrite || !cache.queue.length || status!=='ready' || invalidCache.current) return;
    const timeout=window.setTimeout(() => { void flush(); },700);
    return () => window.clearTimeout(timeout);
  },[cache.queue,canWrite,flush,localOnly,status]);
  const change=useCallback((document: CanvasDocument) => {
    if (!writeEnabled.current) throw new Error('另一标签页正在编辑，此页面只读。');
    if (blocked.current) throw new Error('请先处理画布冲突，当前本地画布已保留。');
    const parsed=CanvasDocumentSchema.parse(document),current=state.current;
    const operation={ operationId: crypto.randomUUID(),baseRevision: current.remote.revision,document: parsed,dispatched: false };
    const first=current.queue[0];
    // An in-flight request must keep its exact payload and operation identity.
    const queue=first && (first.dispatched || inflight.current?.operationId===first.operationId)?[first,operation]:[operation];
    saveState({ ...current,queue });
    setStatus('ready');setError('');
  },[saveState]);
  const resolve=useCallback((keepLocal: boolean) => {
    if (invalidCache.current||!writeEnabled.current) return;
    const current=state.current,last=current.queue.at(-1);
    const queue=keepLocal && last?[{ operationId: crypto.randomUUID(),baseRevision: current.remote.revision,document: last.document,dispatched: false }]:[];
    saveState({ ...current,queue });blocked.current=false;setStatus('ready');setError('');
  },[saveState]);
  return { document: expired?emptyDocument:cache.queue.at(-1)?.document??cache.remote.document,remote: expired?fresh().remote:cache.remote,expired,status,error,pending: cache.queue.length>0,change,refresh,retry: () => { if (!invalidCache.current && status!=='conflict' && writeEnabled.current) { blocked.current=false;void flush(); } },resolve };
}
export type { CanvasDTO };
