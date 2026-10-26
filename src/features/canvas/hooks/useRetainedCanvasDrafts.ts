import { useCallback, useEffect, useState } from 'react';
import { MemoDraftSchema, type MemoDraft } from '../../../system/storage/WorkspaceCache';

export interface RetainedCanvasDraft { key: string; id: string; draft: MemoDraft }

// Read drafts written earlier in this rewrite, including IDs already removed by
// the server. New edits belong to the single workspace draft collection.
export function useRetainedCanvasDrafts(instanceId: string, canWrite: boolean) {
  const prefix = `meow:v2:${instanceId}:owner:canvas-memo-draft:`;
  const [drafts, setDrafts] = useState<RetainedCanvasDraft[]>([]);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    const retained: RetainedCanvasDraft[] = [];
    let invalid = false;
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        try {
          const draft = MemoDraftSchema.parse(JSON.parse(localStorage.getItem(key) ?? 'null'));
          retained.push({ key, id: key.slice(prefix.length), draft });
        } catch { invalid = true; }
      }
    } catch {
      setError('无法读取本地画布草稿，请保留浏览器数据后重试。');
      return;
    }
    setDrafts(retained);
    setError(invalid ? '本地画布草稿格式无法识别。原记录已保留，请先保留浏览器数据。' : '');
  }, [prefix]);
  useEffect(() => {
    reload();
    const changed = (event: StorageEvent) => { if (event.key === null || event.key.startsWith(prefix)) reload(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [prefix, reload]);
  function remove(key: string) {
    if (!canWrite) throw new Error('另一标签页正在编辑，此页面只读。');
    if (!key.startsWith(prefix)) throw new Error('这份画布草稿不属于当前工作区。');
    localStorage.removeItem(key);
    reload();
  }
  return { drafts, error, remove };
}
