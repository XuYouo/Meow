// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memoView } from '../features/presentation/objects/MemoView';
import { exportShareImage, SHARE_DOWNLOAD_URL_LIFETIME_MS, SHARE_EXPORT_TIMEOUT_MS } from '../pages/Index/functions/exportShareImage';
import ShareDialog from '../pages/Index/presentation/ShareDialog';

const state = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('html2canvas', () => ({ default: state.render }));
vi.mock('../features/presentation/PresentationContext', () => ({ useTheme: () => ({ themeColor: '#818CF8', currentFont: 'default' }) }));

const memo = memoView({ id: '34314002-e853-4be9-ac04-07feb51cb70a', content: '合成分享正文', tags: ['测试'], links: [], backlinks: [], attachments: [], isPublic: false, isPinned: false, revision: 1, createdAt: '2026-10-24T10:00:00.000Z', updatedAt: '2026-10-24T10:00:00.000Z' });
const createURL = vi.fn(() => 'blob:synthetic-share');
const revokeURL = vi.fn();
const canvas = () => ({ toBlob: (done: BlobCallback) => done(new Blob(['synthetic PNG'], { type: 'image/png' })) });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  vi.clearAllMocks(); state.render.mockReset(); state.render.mockResolvedValue(canvas());
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); document.querySelectorAll('iframe.html2canvas-container').forEach((frame) => frame.remove()); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('share image export lifecycle', () => {
  it('keeps the template and appends a Blob download anchor, without claiming browser acceptance', async () => {
    let connected = false;
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(function (this: HTMLAnchorElement) { connected = this.isConnected; expect(this.download).toMatch(/^memo-.*\.png$/); expect(this.href).toBe('blob:synthetic-share'); });
    const otherImage = document.createElement('img'); document.body.append(otherImage);
    render(<ShareDialog isOpen onClose={vi.fn()} memo={memo} />);
    expect(screen.getByText('合成分享正文')).toBeTruthy(); expect(screen.getByText('#测试')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '下载分享图' }));
    await screen.findByRole('status');
    expect(screen.getByRole('status').textContent).toContain('已向浏览器请求下载');
    expect(screen.getByRole('link', { name: '再次下载' }).getAttribute('href')).toBe('blob:synthetic-share');
    expect(connected).toBe(true); expect(createURL).toHaveBeenCalledWith(expect.any(Blob)); expect(revokeURL).not.toHaveBeenCalled();
    const target: HTMLElement = state.render.mock.calls[0]?.[0];
    const options: { imageTimeout: number; ignoreElements: (element: Element) => boolean } = state.render.mock.calls[0]?.[1];
    expect(options.imageTimeout).toBe(1500); expect(options.ignoreElements(otherImage)).toBe(true); expect(options.ignoreElements(target)).toBe(false); expect(options.ignoreElements(document.head)).toBe(false); expect(options.ignoreElements(document.body)).toBe(false);
    otherImage.remove();
  });

  it('blocks duplicate exports until rendering and encoding finish', async () => {
    const pending = deferred<ReturnType<typeof canvas>>(); state.render.mockReturnValue(pending.promise);
    render(<ShareDialog isOpen onClose={vi.fn()} memo={memo} />);
    fireEvent.click(screen.getByRole('button', { name: '下载分享图' }));
    const busy = await screen.findByRole('button', { name: '正在渲染分享图…' });
    expect(busy.getAttribute('aria-busy')).toBe('true'); expect(busy.hasAttribute('disabled')).toBe(true);
    fireEvent.click(busy); expect(state.render).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(canvas()));
    expect(await screen.findByRole('button', { name: '下载分享图' })).toBeTruthy(); expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it('lets the original bookmark grow to its actual text layout instead of clipping a guessed character height', () => {
    const content = Array.from({ length: 100 }, (_, index) => `第${index + 1}段完整正文，保留中文换行和末尾。`).join('\n\n');
    render(<ShareDialog isOpen onClose={vi.fn()} memo={{ ...memo, content }} />);
    const body = screen.getByText((_, element) => element?.textContent === content && element.classList.contains('whitespace-pre-wrap'));
    expect(body.classList.contains('shrink-0')).toBe(true); expect(body.classList.contains('overflow-hidden')).toBe(false);
    const card = body.closest('.bg-\\[\\#f9f6f2\\]');
    expect(card).toBeInstanceOf(HTMLElement); expect((card as HTMLElement).style.height).toBe(''); expect((card as HTMLElement).style.minHeight).toBe('360px');
    expect(body.textContent?.endsWith('第100段完整正文，保留中文换行和末尾。')).toBe(true);
  });

  it('shows render and PNG conversion failures and permits retry', async () => {
    state.render.mockRejectedValueOnce(new Error('合成渲染失败'));
    render(<ShareDialog isOpen onClose={vi.fn()} memo={memo} />);
    fireEvent.click(screen.getByRole('button', { name: '下载分享图' }));
    expect((await screen.findByRole('alert')).textContent).toBe('合成渲染失败');
    state.render.mockResolvedValueOnce({ toBlob: (done: BlobCallback) => done(null) });
    fireEvent.click(screen.getByRole('button', { name: '下载分享图' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('PNG转换失败'));
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled(); expect(createURL).not.toHaveBeenCalled();
  });

  it('does not download after unmount while a renderer is still pending', async () => {
    const pending = deferred<ReturnType<typeof canvas>>(); state.render.mockReturnValue(pending.promise);
    const view = render(<ShareDialog isOpen onClose={vi.fn()} memo={memo} />);
    fireEvent.click(screen.getByRole('button', { name: '下载分享图' }));
    await screen.findByRole('button', { name: '正在渲染分享图…' });
    const frame = document.createElement('iframe'); frame.className = 'html2canvas-container'; document.body.append(frame);
    view.unmount(); await act(async () => pending.resolve(canvas()));
    expect(frame.isConnected).toBe(false); expect(createURL).not.toHaveBeenCalled(); expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('cancels the current export on close and resets before reopening', async () => {
    const pending = deferred<ReturnType<typeof canvas>>(); state.render.mockReturnValue(pending.promise); const onClose = vi.fn();
    const view = render(<ShareDialog isOpen onClose={onClose} memo={memo} />);
    fireEvent.click(screen.getByRole('button', { name: '下载分享图' })); await screen.findByRole('button', { name: '正在渲染分享图…' });
    fireEvent.click(screen.getByRole('button', { name: '关闭分享图' })); expect(onClose).toHaveBeenCalledOnce();
    view.rerender(<ShareDialog isOpen={false} onClose={onClose} memo={memo} />);
    await act(async () => pending.resolve(canvas())); view.rerender(<ShareDialog isOpen onClose={onClose} memo={memo} />);
    expect(screen.getByRole('button', { name: '下载分享图' }).hasAttribute('disabled')).toBe(false); expect(createURL).not.toHaveBeenCalled();
  });

  it('bounds a stalled renderer and reports the stage which timed out', async () => {
    vi.useFakeTimers(); const pending = deferred<ReturnType<typeof canvas>>(); state.render.mockReturnValue(pending.promise);
    const target = document.createElement('div'); document.body.append(target); const phase = vi.fn();
    const exported = exportShareImage(target, memo.id, { signal: new AbortController().signal, onPhase: phase });
    const result = expect(exported).rejects.toThrow('渲染分享图超时');
    await vi.dynamicImportSettled(); expect(phase).toHaveBeenLastCalledWith('rendering');
    await vi.advanceTimersByTimeAsync(SHARE_EXPORT_TIMEOUT_MS); await result;
    pending.resolve(canvas()); await Promise.resolve(); expect(createURL).not.toHaveBeenCalled(); target.remove();
  });

  it('retains the Blob long enough for the browser and then revokes its URL', async () => {
    vi.useFakeTimers(); const target = document.createElement('div'); document.body.append(target);
    const result = await exportShareImage(target, memo.id, { signal: new AbortController().signal, onPhase: vi.fn() });
    expect(result.fileName).toMatch(/\.png$/); expect(revokeURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SHARE_DOWNLOAD_URL_LIFETIME_MS - 1); expect(revokeURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(revokeURL).toHaveBeenCalledWith(result.url); target.remove();
  });
});
