export type ShareExportPhase = 'preparing' | 'rendering' | 'encoding' | 'requesting';
export const SHARE_EXPORT_TIMEOUT_MS = 8000;
export const SHARE_DOWNLOAD_URL_LIFETIME_MS = 30_000;
const phaseNames: Record<ShareExportPhase, string> = { preparing: '加载导出工具', rendering: '渲染分享图', encoding: '转换PNG', requesting: '请求浏览器下载' };

function interrupted(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Export cancelled', 'AbortError');
}
function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(interrupted(signal)); return; }
    const abort = () => reject(interrupted(signal));
    signal.addEventListener('abort', abort, { once: true });
    void work.then((value) => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(interrupted(signal)); else resolve(value); }, (error: unknown) => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

export async function exportShareImage(element: HTMLElement, memoId: string, options: { signal: AbortSignal; onPhase: (phase: ShareExportPhase) => void }): Promise<{ url: string; fileName: string }> {
  const document = element.ownerDocument;
  const controller = new AbortController();
  const cancel = () => controller.abort(new DOMException('Export cancelled', 'AbortError'));
  options.signal.addEventListener('abort', cancel, { once: true });
  if (options.signal.aborted) cancel();
  let phase: ShareExportPhase = 'preparing';
  const update = (next: ShareExportPhase) => { phase = next; options.onPhase(next); };
  const timeout = setTimeout(() => controller.abort(new Error(`${phaseNames[phase]}超时，请检查字体或图片加载后重试。`)), SHARE_EXPORT_TIMEOUT_MS);
  const existingFrames = new Set(document.querySelectorAll('iframe.html2canvas-container'));
  try {
    update('preparing');
    const html2canvas = (await bounded(import('html2canvas'), controller.signal)).default;
    update('rendering');
    const canvas = await bounded(html2canvas(element, {
      scale: 2, backgroundColor: null, logging: false, imageTimeout: 1500, useCORS: true, allowTaint: false, removeContainer: true,
      // Preserve the target, its layout ancestors and stylesheet/font declarations.
      // Other app images/audio/canvases must not delay the clone's readiness.
      ignoreElements: (candidate) => !(candidate === element || candidate.contains(element) || element.contains(candidate) || candidate.tagName === 'HEAD' || candidate.closest('head')),
    }), controller.signal);
    update('encoding');
    const blob = await bounded(new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG转换失败，请重试。')), 'image/png')), controller.signal);
    if (controller.signal.aborted) throw interrupted(controller.signal);
    update('requesting');
    const url = URL.createObjectURL(blob);
    const fileName = `memo-${memoId}-${Date.now()}.png`;
    const anchor = document.createElement('a');
    anchor.download = fileName; anchor.href = url; anchor.style.display = 'none';
    document.body.appendChild(anchor);
    try { anchor.click(); }
    catch (error) { URL.revokeObjectURL(url); throw error; }
    finally { anchor.remove(); }
    // Let the browser consume the Blob even when the dialog closes immediately.
    setTimeout(() => URL.revokeObjectURL(url), SHARE_DOWNLOAD_URL_LIFETIME_MS);
    return { url, fileName };
  } finally {
    clearTimeout(timeout); options.signal.removeEventListener('abort', cancel);
    // Only this single-flight share flow uses html2canvas. Preserve all containers
    // which predated it, and remove this run's clone even after timeout/cancel.
    for (const frame of document.querySelectorAll('iframe.html2canvas-container')) if (!existingFrames.has(frame)) frame.remove();
  }
}
