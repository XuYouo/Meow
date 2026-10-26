import { useCallback, useEffect, useRef, useState } from 'react';

import { exportShareImage, SHARE_DOWNLOAD_URL_LIFETIME_MS, type ShareExportPhase } from '../functions/exportShareImage';

type State = { phase: 'idle' } | { phase: ShareExportPhase } | { phase: 'error'; message: string } | { phase: 'requested'; url: string; fileName: string };
export function useShareExport(isOpen: boolean, memoId: string | undefined) {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const current = useRef<AbortController | null>(null);
  const active = useRef(true);
  const cancel = useCallback(() => { current.current?.abort(); current.current = null; setState({ phase: 'idle' }); }, []);
  useEffect(() => {
    active.current = true;
    cancel();
    return () => { active.current = false; current.current?.abort(); current.current = null; };
  }, [cancel, isOpen, memoId]);
  useEffect(() => {
    if (state.phase !== 'requested') return;
    const timer = setTimeout(() => setState({ phase: 'idle' }), SHARE_DOWNLOAD_URL_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [state]);
  async function start(element: HTMLElement | null) {
    if (!element || !memoId || !isOpen || current.current) return;
    const controller = new AbortController(); current.current = controller;
    try {
      const result = await exportShareImage(element, memoId, { signal: controller.signal, onPhase: (phase) => { if (active.current && current.current === controller) setState({ phase }); } });
      if (active.current && current.current === controller) setState({ phase: 'requested', ...result });
    } catch (error) {
      if (active.current && current.current === controller && !controller.signal.aborted) setState({ phase: 'error', message: error instanceof Error ? error.message : '生成分享图失败，请重试。' });
    } finally { if (current.current === controller) current.current = null; }
  }
  return { state, start, cancel, busy: ['preparing', 'rendering', 'encoding', 'requesting'].includes(state.phase) };
}
