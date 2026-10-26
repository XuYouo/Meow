// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AIDialog from '../features/ai/AIDialog';
import type { Memo } from '../objects/memos/Memo';

const mock = vi.hoisted(() => ({ chat: vi.fn(), enabled: true }));
vi.mock('../apis/integrations/ChatAPI', () => ({ ChatAPI: mock.chat }));
vi.mock('../features/settings/PreferencesProvider', () => ({ usePreferences: () => ({ preferences: { aiEnabled: mock.enabled, aiModel: 'chosen-model' } }) }));
const memo: Memo = { id: 'f1dc9b1d-4bbf-4a21-8206-4176ce47e83f', content: '明确选中的合成上下文', tags: [], links: [], backlinks: [], attachments: [], isPublic: false, isPinned: false, revision: 1, createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z' };
beforeEach(() => {
  mock.enabled = true; mock.chat.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(cleanup);

describe('original AI dialog with the new stream boundary', () => {
  it('sends only selected context and the saved model, then retains streamed text in the original bubbles', async () => {
    mock.chat.mockImplementation(async (_input: unknown, delta: (chunk: string) => void) => { delta('合成'); delta('回答'); });
    render(<AIDialog isOpen onClose={() => {}} memos={[memo]} />);
    fireEvent.click(screen.getByText('参考笔记（0/100）'));
    fireEvent.click(screen.getByLabelText(memo.content));
    fireEvent.change(screen.getByPlaceholderText('输入你的问题...'), { target: { value: '总结' } });
    fireEvent.click(screen.getByLabelText('发送问题'));
    await screen.findByText('合成回答');
    expect(mock.chat.mock.calls[0]?.[0]).toMatchObject({ prompt: '总结', contextMemoIds: [memo.id], model: 'chosen-model', history: [] });
  });

  it('keeps partial text when generation is cancelled', async () => {
    mock.chat.mockImplementation((_input: unknown, delta: (chunk: string) => void, signal: AbortSignal) => new Promise<void>((_resolve, reject) => { delta('已收到的文字'); signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }); }));
    render(<AIDialog isOpen onClose={() => {}} memos={[]} />);
    fireEvent.change(screen.getByPlaceholderText('输入你的问题...'), { target: { value: '测试取消' } });
    fireEvent.click(screen.getByLabelText('发送问题'));
    await screen.findByText('已收到的文字'); fireEvent.click(screen.getByLabelText('停止生成'));
    await screen.findByText('已停止生成，收到的文字已保留。');
    expect(screen.getByText('已收到的文字')).toBeTruthy();
  });

  it('does not send while the feature is disabled or another tab owns the writer lock', async () => {
    mock.enabled = false;
    const view = render(<AIDialog isOpen onClose={() => {}} memos={[]} />);
    fireEvent.change(screen.getByPlaceholderText('输入你的问题...'), { target: { value: '不会发送' } });
    fireEvent.click(screen.getByLabelText('发送问题')); await screen.findByText('请先在设置中启用AI功能。');
    mock.enabled = true; view.rerender(<AIDialog isOpen onClose={() => {}} memos={[]} canWrite={false} />);
    fireEvent.click(screen.getByLabelText('发送问题'));
    await waitFor(() => expect(mock.chat).not.toHaveBeenCalled());
  });
});
