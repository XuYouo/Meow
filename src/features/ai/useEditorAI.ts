import { useEffect, useRef, useState } from 'react';
import { ChatAPI } from '../../apis/integrations/ChatAPI';
import { usePreferences } from '../settings/PreferencesProvider';

/** onDelta receives only the new chunk; callers own the durable editor draft. */
export function useEditorAI() {
  const { preferences } = usePreferences();
  const controller = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => controller.current?.abort(), []);
  async function generate(mode: 'continue' | 'optimize', text: string, onDelta: (chunk: string) => void) {
    if (controller.current || !text.trim()) return;
    const current = new AbortController(); controller.current = current;
    setRunning(true); setError('');
    const model = preferences && 'aiModel' in preferences ? preferences.aiModel.trim() : '';
    try { await ChatAPI({ mode, prompt: text, contextMemoIds: [], history: [], ...(model ? { model } : {}) }, onDelta, current.signal); }
    catch (cause) { setError(current.signal.aborted ? '已停止生成，收到的文字已保留。' : cause instanceof Error ? cause.message : '生成失败，草稿已保留。'); }
    finally { if (controller.current === current) { controller.current = null; setRunning(false); } }
  }
  return { generate, cancel: () => controller.current?.abort(), running, error };
}
