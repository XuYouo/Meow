import { useCallback, useEffect, useRef, useState } from 'react';

import type { AudioClipView } from '../../../features/presentation/objects/MemoView';
import { getMediaContentURL, stagePendingMedia } from '../../../features/media/pendingMedia';

type RecordingPhase = 'idle' | 'acquiring' | 'recording' | 'paused' | 'saving';
interface Options {
  instanceId: string;
  memoId: string | null;
  disabled: boolean;
  onAttach?: (memoId: string | null, clip: AudioClipView) => void;
  notify: (message: string) => void;
}
interface RecordingResources {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  elapsed: number;
  startedAt: number | null;
}
function elapsed(resources: RecordingResources) {
  return resources.elapsed + (resources.startedAt === null ? 0 : Date.now() - resources.startedAt);
}

/** Owns microphone/recorder lifetime and durable storage; never sends a network request. */
export function useMemoRecording({ instanceId, memoId, disabled, onAttach, notify }: Options) {
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [, tick] = useState(0);
  const resources = useRef<RecordingResources | null>(null);
  const acquiring = useRef(false);
  const saving = useRef(false);
  const savedDuration = useRef(0);
  const mounted = useRef(true);
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; return generation.current; }, []);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const release = useCallback(() => {
    const current = resources.current;
    resources.current = null;
    if (!current) return;
    current.recorder.ondataavailable = null;
    current.recorder.onstop = null;
    current.recorder.onerror = null;
    try { if (current.recorder.state !== 'inactive') current.recorder.stop(); }
    catch { /* Track shutdown below still releases the microphone if a native recorder fails. */ }
    for (const track of current.stream.getTracks()) track.stop();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; invalidate(); release(); };
  }, [invalidate, release]);
  useEffect(() => {
    if (!disabled) return;
    invalidate(); release(); setPhase('idle');
  }, [disabled, invalidate, release]);
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => tick((value) => value + 1), 200);
    return () => clearInterval(timer);
  }, [phase]);

  async function toggleRecording() {
    if (disabledRef.current || acquiring.current || saving.current) return;
    const current = resources.current;
    if (current) {
      try {
        current.elapsed = elapsed(current); current.startedAt = null;
        if (current.recorder.state !== 'inactive') current.recorder.stop();
      } catch (error) {
        release(); setPhase('idle'); notify(error instanceof Error ? error.message : '无法完成录音，请重新录制。');
      }
      return;
    }
    acquiring.current = true; savedDuration.current = 0; setPhase('acquiring');
    const token = ++generation.current;
    let acquired: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持录音。');
      acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || disabledRef.current || token !== generation.current) {
        for (const track of acquired.getTracks()) track.stop();
        return;
      }
      setHasMicPermission(true);
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((value) => MediaRecorder.isTypeSupported?.(value));
      const recorder = new MediaRecorder(acquired, mimeType ? { mimeType } : undefined);
      const recording: RecordingResources = { recorder, stream: acquired, chunks: [], elapsed: 0, startedAt: Date.now() };
      resources.current = recording;
      recorder.ondataavailable = (event) => { if (event.data.size) recording.chunks.push(event.data); };
      recorder.onerror = () => {
        generation.current++; release();
        if (mounted.current) { setPhase('idle'); notify('录音中断，请重新录制。'); }
      };
      recorder.onstop = async () => {
        const durationMs = elapsed(recording); savedDuration.current = durationMs;
        const type = recorder.mimeType || 'audio/webm';
        const file = new File([new Blob(recording.chunks, { type })], `memo_record_${Date.now()}.${type.split(';')[0]?.split('/')[1] || 'webm'}`, { type });
        saving.current = true; release();
        if (mounted.current) setPhase('saving');
        try {
          const { mediaId } = await stagePendingMedia(instanceId, file);
          if (mounted.current && !disabledRef.current && token === generation.current) {
            onAttach?.(memoId, { id: mediaId, mediaId, url: getMediaContentURL(mediaId), durationMs, createdAt: new Date().toISOString() });
          }
        } catch (error) {
          if (mounted.current) notify(error instanceof Error ? error.message : '录音保存失败，请重试。');
        } finally {
          saving.current = false;
          if (mounted.current) setPhase('idle');
        }
      };
      recorder.start(); setPhase('recording');
    } catch (error) {
      release();
      // Constructor/start may fail before resources owns the acquired stream.
      if (acquired) for (const track of acquired.getTracks()) track.stop();
      if (mounted.current) {
        setPhase('idle'); setHasMicPermission(false);
        notify(error instanceof Error ? error.message : '无法访问麦克风，请检查浏览器权限。');
      }
    } finally { acquiring.current = false; }
  }

  function pauseOrResume() {
    if (disabledRef.current) return;
    const current = resources.current;
    if (!current) return;
    if (current.recorder.state === 'recording') {
      current.recorder.pause(); current.elapsed = elapsed(current); current.startedAt = null; setPhase('paused');
    } else if (current.recorder.state === 'paused') {
      current.recorder.resume(); current.startedAt = Date.now(); setPhase('recording');
    }
  }
  return {
    isRecording: phase === 'recording' || phase === 'paused' || phase === 'saving',
    isPaused: phase === 'paused', hasMicPermission,
    stream: resources.current?.stream ?? null,
    currentDurationMs: resources.current ? elapsed(resources.current) : phase === 'saving' ? savedDuration.current : 0,
    toggleRecording, pauseOrResume,
  };
}
