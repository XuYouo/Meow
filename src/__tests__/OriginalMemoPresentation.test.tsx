// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ContentRenderer from '../pages/Index/presentation/ContentRenderer';
import MemoEditor from '../pages/Index/presentation/MemoEditor';
import { defaultDevicePreferences, saveDevicePreferences } from '../system/storage/DevicePreferences';
import { matchesShortcut } from '../system/storage/KeyboardShortcut';

const state = vi.hoisted(() => ({ notify: vi.fn(), stage: vi.fn(), stopped: vi.fn(), quote: vi.fn(), quotesEnabled: false, localOnly: true }));
const quoteTypes = ['a'];
vi.mock('../features/presentation/PresentationContext', () => ({
  useTheme: () => ({ themeColor: '#818CF8', currentFont: 'default' }),
  useSettings: () => ({ fontConfig: { selectedFont: 'default', fontSize: 16 }, hitokotoConfig: { enabled: state.quotesEnabled, types: quoteTypes } }),
  usePresentationActions: () => ({ instanceId: 'instance', notify: state.notify, localOnly: state.localOnly }),
}));
vi.mock('../apis/integrations/GetHitokotoAPI', () => ({ GetHitokotoAPI: state.quote }));
vi.mock('../features/media/pendingMedia', () => ({ stagePendingMedia: state.stage, getPendingMediaBlob: vi.fn().mockResolvedValue(null), getMediaContentURL: (id: string) => `/api/media/${id}/content` }));
vi.mock('../pages/Index/presentation/AudioWaveform', () => ({ default: () => null }));

class Recording {
  static latest: Recording;
  static isTypeSupported = () => true;
  state = 'inactive'; mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => Promise<void>) | null = null;
  constructor() { Recording.latest = this; }
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['synthetic recording']) }); void this.onstop?.(); }
}
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); state.quotesEnabled = false; state.localOnly = true;
  state.stage.mockResolvedValue({ mediaId: 'eecfd4b2-fb72-4e4b-b065-105de674ccf7' });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: state.stopped }] }) } });
  vi.stubGlobal('MediaRecorder', Recording);
  vi.stubGlobal('AudioContext', class { createMediaStreamSource() { return { connect() {} }; } createAnalyser() { return { fftSize: 1024, getByteTimeDomainData() {} }; } close() { return Promise.resolve(); } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('original memo UI on the new implementation', () => {
  it('preserves tags, emoji and spoiler controls while sanitizing safe HTML', () => {
    const onTag = vi.fn();
    const { container } = render(<ContentRenderer content={'<strong>安全强调</strong><details><summary>更多</summary>折叠正文</details>\n<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)" style="position:fixed" onclick="alert(1)">链接</a>\n\n#领域/规则 :bili_doge: {% spoiler style:box 隐藏文本 %}'} onTagClick={onTag} />);
    expect(screen.getByText('安全强调').tagName).toBe('STRONG');
    expect(screen.getByText('更多').tagName).toBe('SUMMARY');
    expect(container.querySelector('script,[onerror],[onclick],a[style]')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript:');
    expect(screen.getByAltText('emoji:bili_doge')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('button', { name: '#领域/规则' }), { key: 'Enter' });
    expect(onTag).toHaveBeenCalledWith('领域/规则');
    const spoiler = screen.getByRole('button', { name: '显示或隐藏剧透' });
    fireEvent.keyDown(spoiler, { key: 'Enter' });
    expect(spoiler.getAttribute('aria-expanded')).toBe('true');
  });

  it('falls back quietly when the automatic quote request fails', async () => {
    state.quotesEnabled = true; state.localOnly = false; state.quote.mockRejectedValue(new Error('合成网络不可用'));
    render(<MemoEditor value='' showCharCount />);
    await waitFor(() => expect(state.quote).toHaveBeenCalled());
    expect(screen.getByText('Everyting Goes On.')).toBeTruthy();
    expect(state.notify).not.toHaveBeenCalled();
  });

  it('honors disabled submit shortcut and Chinese input composition', () => {
    const onSubmit = vi.fn();
    render(<MemoEditor value='中文草稿' onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.compositionStart(input); fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input); fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    saveDevicePreferences('instance', { ...defaultDevicePreferences, submitShortcut: false });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('stages the actual recording before attaching it and measures pause time correctly', async () => {
    let now = 1000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const attached = vi.fn();
    render(<MemoEditor value='录音草稿' showCharCount onAddAudioClip={attached} />);
    fireEvent.focus(screen.getByRole('textbox'));
    fireEvent.mouseDown(screen.getByTitle('申请麦克风权限并开始录音'));
    await screen.findByTitle('停止录音');
    now = 4000; fireEvent.mouseDown(screen.getByTitle('暂停录音'));
    now = 7000; fireEvent.mouseDown(screen.getByTitle('继续录音'));
    now = 9000; fireEvent.mouseDown(screen.getByTitle('停止录音'));
    await waitFor(() => expect(attached).toHaveBeenCalledTimes(1));
    const file = state.stage.mock.calls[0]?.[1];
    expect(file).toBeInstanceOf(File); expect(file.size).toBeGreaterThan(0);
    expect(file.name).toMatch(/\.webm$/);
    expect(attached.mock.calls[0]?.[1].durationMs).toBe(5000);
    expect(state.stopped).toHaveBeenCalled();
  });

  it('does not attach an unpersisted recording when browser storage fails', async () => {
    state.stage.mockRejectedValueOnce(new Error('存储空间不足'));
    const attached = vi.fn(); render(<MemoEditor value='录音' showCharCount onAddAudioClip={attached} />);
    fireEvent.focus(screen.getByRole('textbox')); fireEvent.mouseDown(screen.getByTitle('申请麦克风权限并开始录音'));
    await screen.findByTitle('停止录音'); fireEvent.mouseDown(screen.getByTitle('停止录音'));
    await waitFor(() => expect(state.notify).toHaveBeenCalledWith('存储空间不足'));
    expect(attached).not.toHaveBeenCalled();
  });

  it('matches re-recorded shortcuts including Space and permits disabling actions', () => {
    const event = { key: ' ', ctrlKey: false, metaKey: true, altKey: false, shiftKey: true };
    expect(matchesShortcut(event, 'Ctrl+Shift+Space')).toBe(true);
    expect(matchesShortcut(event, 'Ctrl+Space')).toBe(false);
    expect(matchesShortcut(event, null)).toBe(false);
    expect(matchesShortcut({ ...event, key: '\\', shiftKey: false }, 'Ctrl+\\')).toBe(true);
  });
});
