// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/system/api/sendAPI';
import { useCanvasDocument } from '../src/features/canvas/hooks/useCanvasDocument';
import { defaultStyle, emptyDocument, makeShape } from '../src/features/canvas/functions/geometry';
import type { CanvasDTO } from '../shared/contracts/canvas';

const mocks=vi.hoisted(() => ({ get: vi.fn(),save: vi.fn(),ensure: vi.fn(),release: vi.fn() }));
vi.mock('../src/features/media/pendingMedia',() => ({ ensurePendingMediaUploaded: mocks.ensure,releasePendingMedia: mocks.release }));
vi.mock('../src/apis/canvas/GetCanvasAPI',() => ({ GetCanvasAPI: mocks.get }));
vi.mock('../src/apis/canvas/SaveCanvasAPI',() => ({ SaveCanvasAPI: mocks.save }));
const instance='7c2d9698-7253-409f-bf90-926e60f4345d';
const key=`meow:v2:${instance}:owner:canvas`;
const initial: CanvasDTO={ revision: 0,updatedAt: null,document: emptyDocument };
function changed() { return { ...emptyDocument,shapes: [makeShape('rectangle',{ x: 0,y: 0 },{ x: 100,y: 80 },[],defaultStyle,crypto.randomUUID(),1)] }; }
beforeEach(() => { localStorage.clear();mocks.get.mockReset();mocks.save.mockReset();mocks.get.mockResolvedValue(initial);mocks.ensure.mockReset().mockResolvedValue(undefined);mocks.release.mockReset().mockResolvedValue(undefined); });
afterEach(() => { cleanup();vi.restoreAllMocks(); });

describe('durable canvas browser state',() => {
  it('never reads or clears old storage and keeps instance namespaces separate',async () => {
    const legacy='synthetic-old-data';localStorage.setItem('canvasState',legacy);
    const first=renderHook(() => useCanvasDocument(instance));await waitFor(() => expect(first.result.current.status).toBe('ready'));
    expect(first.result.current.document).toEqual(emptyDocument);
    expect(localStorage.getItem('canvasState')).toBe(legacy);
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(localStorage.getItem('meow:v2:another-instance:owner:canvas')).toBeNull();
  });
  it('persists an offline operation before sending and replays the same identity after reload',async () => {
    mocks.save.mockRejectedValue(new ApiError(0,'NETWORK_ERROR','合成断网'));
    const first=renderHook(() => useCanvasDocument(instance));await waitFor(() => expect(first.result.current.status).toBe('ready'));
    const value=changed();act(() => first.result.current.change(value));
    const before=JSON.parse(localStorage.getItem(key)??'{}');expect(before.queue).toHaveLength(1);
    await waitFor(() => expect(first.result.current.status).toBe('error'),{ timeout: 2000 });
    expect(first.result.current.document).toEqual(value);
    first.unmount();
    mocks.save.mockImplementation(async (input) => ({ revision: 1,updatedAt: '2026-10-24T00:00:00.000Z',document: input.document }));
    const second=renderHook(() => useCanvasDocument(instance));await waitFor(() => expect(second.result.current.pending).toBe(false),{ timeout: 2000 });
    expect(mocks.save.mock.calls.at(-1)?.[0].operationId).toBe(before.queue[0].operationId);
    expect(second.result.current.document).toEqual(value);
  });
  it('preserves both the in-flight payload and later edits, then uses the confirmed revision for the next write',async () => {
    let release: ((value: CanvasDTO) => void)|undefined;
    mocks.save.mockImplementationOnce(() => new Promise<CanvasDTO>((resolve) => { release=resolve; }));
    mocks.save.mockImplementation(async (input) => ({ revision: 2,updatedAt: '2026-10-24T00:00:00.000Z',document: input.document }));
    const view=renderHook(() => useCanvasDocument(instance));await waitFor(() => expect(view.result.current.status).toBe('ready'));
    const first=changed();act(() => view.result.current.change(first));await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1),{ timeout: 2000 });
    const second={ ...first,viewport: { x: 20,y: 30,scale: 0.8 } };act(() => view.result.current.change(second));
    const queued=JSON.parse(localStorage.getItem(key)??'{}');expect(queued.queue).toHaveLength(2);expect(queued.queue[0].document).toEqual(first);
    await act(async () => release?.({ revision: 1,updatedAt: '2026-10-24T00:00:00.000Z',document: first }));
    await waitFor(() => expect(view.result.current.pending).toBe(false),{ timeout: 2500 });
    expect(mocks.save.mock.calls[1]?.[0].baseRevision).toBe(1);expect(view.result.current.document).toEqual(second);
  });
  it('keeps the local document on conflict and only rebases it after the user chooses',async () => {
    const remote: CanvasDTO={ revision: 3,updatedAt: '2026-10-24T00:00:00.000Z',document: emptyDocument };
    mocks.save.mockRejectedValueOnce(new ApiError(409,'CANVAS_CONFLICT','合成并发冲突',{ current: remote }));
    mocks.save.mockImplementation(async (input) => ({ revision: 4,updatedAt: remote.updatedAt,document: input.document }));
    const view=renderHook(() => useCanvasDocument(instance));await waitFor(() => expect(view.result.current.status).toBe('ready'));
    const value=changed();act(() => view.result.current.change(value));await waitFor(() => expect(view.result.current.status).toBe('conflict'),{ timeout: 2000 });
    expect(view.result.current.document).toEqual(value);expect(view.result.current.remote.revision).toBe(3);
    expect(() => act(() => view.result.current.change(changed()))).toThrow('请先处理画布冲突');
    act(() => view.result.current.resolve(true));await waitFor(() => expect(view.result.current.pending).toBe(false),{ timeout: 2000 });
    expect(mocks.save.mock.calls.at(-1)?.[0].baseRevision).toBe(3);expect(view.result.current.document).toEqual(value);
  });
  it('does not alter acknowledged state or erase the previous persisted queue if storage is full',async () => {
    const view=renderHook(() => useCanvasDocument(instance));await waitFor(() => expect(view.result.current.status).toBe('ready'));
    const previous=localStorage.getItem(key);
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new DOMException('synthetic quota','QuotaExceededError'); });
    expect(() => act(() => view.result.current.change(changed()))).toThrow();
    expect(view.result.current.document).toEqual(emptyDocument);expect(localStorage.getItem(key)).toBe(previous);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe('canvas authentication pause',() => {
  it('allows durable local edits without any network calls while identity is unverified',async () => {
    const view=renderHook(({ localOnly }) => useCanvasDocument(instance,localOnly),{ initialProps: { localOnly: true } });
    expect(view.result.current.status).toBe('ready');
    const value=changed();act(() => view.result.current.change(value));
    act(() => window.dispatchEvent(new Event('online')));
    act(() => view.result.current.retry());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve,800)); });
    expect(mocks.get).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();
    expect(view.result.current.document).toEqual(value);expect(view.result.current.pending).toBe(true);
    mocks.save.mockImplementation(async (input) => ({ revision: 1,updatedAt: '2026-10-24T00:00:00.000Z',document: input.document }));
    view.rerender({ localOnly: false });
    await waitFor(() => expect(view.result.current.pending).toBe(false));
    expect(mocks.get).toHaveBeenCalledTimes(1);expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it('hides private canvas state immediately after any 401 while retaining pending data for reauthentication',async () => {
    const value=changed();
    localStorage.setItem(key,JSON.stringify({ remote: initial,queue: [{ operationId: crypto.randomUUID(),baseRevision: 0,document: value }] }));
    mocks.get.mockRejectedValue(new ApiError(401,'UNAUTHENTICATED','expired'));
    const onExpired=vi.fn();
    const view=renderHook(() => useCanvasDocument(instance,false,onExpired));
    await waitFor(() => expect(view.result.current.expired).toBe(true));
    expect(view.result.current.document).toEqual(emptyDocument);expect(onExpired).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(key)??'{}').queue[0].document).toEqual(value);
    act(() => view.result.current.retry());expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe('workspace writer lease for the canvas cache',() => {
  it('revokes stale callbacks on unmount before the next tab can take over',async () => {
    const view=renderHook(() => useCanvasDocument(instance,true,undefined,true));
    act(() => view.result.current.change(changed()));
    const stale=view.result.current.change,raw=localStorage.getItem(key);
    view.unmount();
    expect(() => stale(changed())).toThrow('只读');expect(localStorage.getItem(key)).toBe(raw);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('keeps a reader entirely read-only and follows the writer through storage events',async () => {
    const first=changed(),operationId=crypto.randomUUID();
    localStorage.setItem(key,JSON.stringify({ remote: initial,queue: [{ operationId,baseRevision: 0,document: first }] }));
    const writes=vi.spyOn(Storage.prototype,'setItem');
    const view=renderHook(() => useCanvasDocument(instance,false,undefined,false));
    expect(view.result.current.document).toEqual(first);
    expect(() => act(() => view.result.current.change(changed()))).toThrow('只读');
    act(() => { view.result.current.retry();view.result.current.resolve(true);window.dispatchEvent(new Event('online')); });
    await act(async () => view.result.current.refresh());
    expect(writes).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();
    const next={ ...first,viewport: { x: 180,y: 220,scale: 1 } };
    localStorage.setItem(key,JSON.stringify({ remote: initial,queue: [{ operationId,baseRevision: 0,document: next }] }));
    writes.mockClear();act(() => window.dispatchEvent(new StorageEvent('storage',{ key })));
    expect(view.result.current.document).toEqual(next);expect(writes).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();
  });
  it('rereads the previous writer queue on takeover and submits its exact operation identity',async () => {
    const view=renderHook(({ canWrite }) => useCanvasDocument(instance,false,undefined,canWrite),{ initialProps: { canWrite: false } });
    const document=changed(),operationId=crypto.randomUUID(),remote={ revision: 3,updatedAt: '2026-10-24T00:00:00.000Z',document: emptyDocument };
    localStorage.setItem(key,JSON.stringify({ remote,queue: [{ operationId,baseRevision: 3,document,dispatched: true }] }));
    mocks.get.mockResolvedValue(remote);mocks.save.mockImplementation(async (input) => ({ revision: 4,updatedAt: remote.updatedAt,document: input.document }));
    view.rerender({ canWrite: true });
    await waitFor(() => expect(view.result.current.pending).toBe(false));
    expect(mocks.save).toHaveBeenCalledWith({ operationId,baseRevision: 3,document },expect.any(AbortSignal));
    expect(view.result.current.document).toEqual(document);
  });
  it('does not apply an old HTTP result or clear pending media after the writer lease is lost',async () => {
    let finish: ((value: CanvasDTO) => void)|undefined;
    mocks.save.mockImplementationOnce(() => new Promise<CanvasDTO>((resolve) => { finish=resolve; }));
    const view=renderHook(({ canWrite }) => useCanvasDocument(instance,false,undefined,canWrite),{ initialProps: { canWrite: true } });
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    const first=changed();act(() => view.result.current.change(first));await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1),{ timeout: 2000 });
    view.rerender({ canWrite: false });
    const successor={ ...first,viewport: { x: 200,y: 300,scale: 1 } },raw=JSON.stringify({ remote: initial,queue: [{ operationId: crypto.randomUUID(),baseRevision: 0,document: successor }] });
    localStorage.setItem(key,raw);act(() => window.dispatchEvent(new StorageEvent('storage',{ key })));
    await act(async () => finish?.({ revision: 1,updatedAt: '2026-10-24T00:00:00.000Z',document: first }));
    expect(localStorage.getItem(key)).toBe(raw);expect(view.result.current.document).toEqual(successor);expect(mocks.release).not.toHaveBeenCalled();
  });
});

describe('canvas media dependency acknowledgment',() => {
  it('uploads durable staged image IDs before document save and releases local blobs only after business acknowledgment',async () => {
    const mediaId=crypto.randomUUID();
    const document={ ...emptyDocument,shapes: [{ id: crypto.randomUUID(),type: 'image' as const,mediaId,alt: '合成图片',x: 0,y: 0,width: 80,height: 60,z: 1,style: defaultStyle,erasures: [] }] };
    mocks.ensure.mockRejectedValueOnce(new ApiError(0,'NETWORK_ERROR','合成上传断网'));
    mocks.save.mockImplementation(async (input) => ({ revision: 1,updatedAt: '2026-10-24T00:00:00.000Z',document: input.document }));
    const view=renderHook(() => useCanvasDocument(instance));await waitFor(() => expect(view.result.current.status).toBe('ready'));
    act(() => view.result.current.change(document));await waitFor(() => expect(view.result.current.status).toBe('error'),{ timeout: 2000 });
    expect(mocks.save).not.toHaveBeenCalled();expect(mocks.release).not.toHaveBeenCalled();expect(view.result.current.pending).toBe(true);
    mocks.ensure.mockResolvedValue(undefined);act(() => view.result.current.retry());
    await waitFor(() => expect(view.result.current.pending).toBe(false));
    expect(mocks.ensure.mock.calls.at(-1)?.slice(0,2)).toEqual([instance,[mediaId]]);
    expect(mocks.release).toHaveBeenCalledWith(instance,[mediaId]);
    expect(mocks.ensure.mock.invocationCallOrder[1]).toBeLessThan(mocks.save.mock.invocationCallOrder[0]??0);
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.release.mock.invocationCallOrder[0]??0);
  });
  it('reports local cleanup failure after a confirmed save without reviving its pending operation',async () => {
    mocks.save.mockImplementation(async (input) => ({ revision: 1,updatedAt: '2026-10-24T00:00:00.000Z',document: input.document }));
    mocks.release.mockRejectedValue(new Error('synthetic cleanup failure'));
    const view=renderHook(() => useCanvasDocument(instance));await waitFor(() => expect(view.result.current.status).toBe('ready'));
    act(() => view.result.current.change(changed()));await waitFor(() => expect(view.result.current.pending).toBe(false),{ timeout: 2000 });
    expect(view.result.current.status).toBe('ready');expect(view.result.current.error).toContain('画布已同步');
    expect(JSON.parse(localStorage.getItem(key)??'{}').queue).toEqual([]);
  });
});

describe('unsupported canvas cache preservation',() => {
  it('does not overwrite unrecognized pending data during refresh, retry or attempted edits',async () => {
    const raw=JSON.stringify({ version: 999,syntheticPendingText: '必须保留' });localStorage.setItem(key,raw);
    const view=renderHook(() => useCanvasDocument(instance));
    expect(view.result.current.status).toBe('error');
    act(() => view.result.current.retry());await act(async () => view.result.current.refresh());
    expect(() => act(() => view.result.current.change(changed()))).toThrow();
    expect(localStorage.getItem(key)).toBe(raw);expect(mocks.get).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe('uncertain canvas write outcomes',() => {
  it.each([400,413])('lets an edited document replace a confirmed HTTP %s rejection without replaying the invalid payload',async (status) => {
    mocks.save.mockRejectedValueOnce(new ApiError(status,'INVALID_DOCUMENT','合成画布校验失败'));
    const view=renderHook(() => useCanvasDocument(instance));await waitFor(() => expect(view.result.current.status).toBe('ready'));
    const first=changed();act(() => view.result.current.change(first));await waitFor(() => expect(view.result.current.status).toBe('error'),{ timeout: 2000 });
    const rejected=mocks.save.mock.calls[0]?.[0];
    expect(view.result.current.document).toEqual(first);
    const corrected={ ...first,shapes: [] };
    mocks.save.mockImplementation(async (input) => ({ revision: 1,updatedAt: '2026-10-24T00:00:00.000Z',document: input.document }));
    act(() => view.result.current.change(corrected));
    const pending=JSON.parse(localStorage.getItem(key)??'{}').queue;expect(pending).toHaveLength(1);expect(pending[0].operationId).not.toBe(rejected.operationId);
    await waitFor(() => expect(view.result.current.pending).toBe(false),{ timeout: 2000 });
    expect(mocks.save).toHaveBeenCalledTimes(2);expect(mocks.save.mock.calls[1]?.[0].document).toEqual(corrected);expect(mocks.save.mock.calls[1]?.[0].baseRevision).toBe(0);
  });
  it('replays the exact dispatched operation after a lost response before applying later local edits',async () => {
    mocks.save.mockRejectedValueOnce(new ApiError(0,'NETWORK_ERROR','合成已提交但确认丢失'));
    const view=renderHook(() => useCanvasDocument(instance));await waitFor(() => expect(view.result.current.status).toBe('ready'));
    const first=changed();act(() => view.result.current.change(first));await waitFor(() => expect(view.result.current.status).toBe('error'),{ timeout: 2000 });
    const originalOperation=mocks.save.mock.calls[0]?.[0];
    const second={ ...first,viewport: { x: 80,y: 90,scale: 1 } };
    mocks.save.mockImplementation(async (input) => ({ revision: input.operationId===originalOperation.operationId?1:2,updatedAt: '2026-10-24T00:00:00.000Z',document: input.document }));
    act(() => view.result.current.change(second));
    const pending=JSON.parse(localStorage.getItem(key)??'{}').queue;expect(pending).toHaveLength(2);expect(pending[0].operationId).toBe(originalOperation.operationId);
    await waitFor(() => expect(view.result.current.pending).toBe(false),{ timeout: 3000 });
    expect(mocks.save.mock.calls[1]?.[0]).toEqual(originalOperation);expect(mocks.save.mock.calls[2]?.[0].baseRevision).toBe(1);expect(view.result.current.document).toEqual(second);
  });
});
