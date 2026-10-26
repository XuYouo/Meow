import { useCallback, useEffect, useRef, useState } from 'react';

export type StorageWriterPhase = 'waiting' | 'writer' | 'unavailable';

// A cache contains both drafts and the durable outbox. Holding one origin-wide
// Web Lock for its entire writable lifetime prevents stale tabs replacing it.
export function useStorageWriter(scope: string) {
  const [phase, setPhase] = useState<StorageWriterPhase>('waiting');
  const owner = useRef(false);
  useEffect(() => {
    const manager = navigator.locks;
    if (!manager) { setPhase('unavailable'); return; }
    const controller = new AbortController();
    let active = true;
    let release: (() => void) | undefined;
    setPhase('waiting');
    void manager.request(`meow:v2:storage-writer:${scope}`, { signal: controller.signal }, async () => {
      if (!active) return;
      owner.current = true;
      setPhase('writer');
      await new Promise<void>((resolve) => { release = resolve; });
      owner.current = false;
    }).catch(() => { if (active) { owner.current = false; setPhase('unavailable'); } });
    return () => {
      active = false; owner.current = false;
      controller.abort(); release?.();
    };
  }, [scope]);
  const assertWriter = useCallback(() => {
    if (!owner.current) throw new Error('本页目前只读。请关闭正在编辑的其他标签页，或使用支持 Web Locks 的浏览器后重试。');
  }, []);
  return { canWrite: phase === 'writer', phase, assertWriter };
}
