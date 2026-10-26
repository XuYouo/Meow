// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMemoRecording } from '../pages/Index/hooks/useMemoRecording';

const mocked = vi.hoisted(() => ({ stage: vi.fn() }));
vi.mock('../features/media/pendingMedia', () => ({ stagePendingMedia: mocked.stage, getMediaContentURL: (id: string) => `/api/media/${id}/content` }));
class Recorder {
  static latest: Recorder;
  static failConstruction = false;
  static failStop = false;
  static isTypeSupported = () => true;
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => Promise<void>) | null = null;
  onerror: (() => void) | null = null;
  constructor() { if (Recorder.failConstruction) throw new Error('合成设备错误'); Recorder.latest = this; }
  start() { this.state = 'recording'; }
  stop() { if (Recorder.failStop) throw new Error('合成停止错误'); this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['actual recording']) }); void this.onstop?.(); }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
}
function deferred<T>() {
  let complete: (value: T) => void = () => { throw new Error('Promise not initialized'); };
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, resolve: (value: T) => complete(value) };
}
const stop = vi.fn(); const notify = vi.fn(); const attach = vi.fn();
const stream = { getTracks: () => [{ stop }] };
const microphone = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); Recorder.failConstruction = false; Recorder.failStop = false; mocked.stage.mockResolvedValue({ mediaId: 'eecfd4b2-fb72-4e4b-b065-105de674ccf7' });
  microphone.mockResolvedValue(stream); vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: microphone } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function useRecording(disabled = false) { return useMemoRecording({ instanceId: 'instance', memoId: null, disabled, notify, onAttach: attach }); }

describe('microphone lifetime and durable attachment failure boundaries', () => {
  it('releases a late microphone grant after unmount without recording or attaching', async () => {
    const permission = deferred<typeof stream>(); microphone.mockReturnValueOnce(permission.promise);
    const hook = renderHook(() => useRecording());
    act(() => { void hook.result.current.toggleRecording(); }); hook.unmount();
    await act(async () => permission.resolve(stream));
    expect(stop).toHaveBeenCalledTimes(1); expect(mocked.stage).not.toHaveBeenCalled(); expect(attach).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
  });

  it('stops acquired tracks when recorder construction fails and reports the failure', async () => {
    Recorder.failConstruction = true; const hook = renderHook(() => useRecording());
    await act(() => hook.result.current.toggleRecording());
    expect(stop).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledWith('合成设备错误');
    expect(hook.result.current.isRecording).toBe(false); expect(mocked.stage).not.toHaveBeenCalled();
  });

  it('handles an unexpected recorder error without saving an incomplete attachment', async () => {
    const hook = renderHook(() => useRecording()); await act(() => hook.result.current.toggleRecording());
    act(() => Recorder.latest.onerror?.());
    expect(stop).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledWith('录音中断，请重新录制。');
    expect(hook.result.current.isRecording).toBe(false); expect(mocked.stage).not.toHaveBeenCalled(); expect(attach).not.toHaveBeenCalled();
  });

  it('releases the microphone and reports native stop failure without an unhandled rejection', async () => {
    const hook = renderHook(() => useRecording()); await act(() => hook.result.current.toggleRecording());
    Recorder.failStop = true; await act(() => hook.result.current.toggleRecording());
    expect(stop).toHaveBeenCalledTimes(1); expect(notify).toHaveBeenCalledWith('合成停止错误');
    expect(hook.result.current.isRecording).toBe(false); expect(mocked.stage).not.toHaveBeenCalled();
  });

  it('invalidates a pending microphone grant when the editor becomes read-only', async () => {
    const permission = deferred<typeof stream>(); microphone.mockReturnValueOnce(permission.promise);
    const hook = renderHook(({ disabled }) => useRecording(disabled), { initialProps: { disabled: false } });
    act(() => { void hook.result.current.toggleRecording(); }); hook.rerender({ disabled: true });
    await act(async () => permission.resolve(stream));
    expect(stop).toHaveBeenCalledTimes(1); expect(hook.result.current.isRecording).toBe(false); expect(attach).not.toHaveBeenCalled();
  });

  it('does not attach after unmount while the durable write is finishing', async () => {
    const persisted = deferred<{ mediaId: string }>(); mocked.stage.mockReturnValueOnce(persisted.promise);
    const hook = renderHook(() => useRecording()); await act(() => hook.result.current.toggleRecording());
    await act(async () => { void hook.result.current.toggleRecording(); });
    expect(mocked.stage).toHaveBeenCalledTimes(1); expect(stop).toHaveBeenCalledTimes(1);
    hook.unmount(); await act(async () => persisted.resolve({ mediaId: 'eecfd4b2-fb72-4e4b-b065-105de674ccf7' }));
    expect(attach).not.toHaveBeenCalled();
  });
});
