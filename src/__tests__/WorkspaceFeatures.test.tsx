// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrackDTO } from '../../shared/contracts/music';
import { MusicProvider, useMusic } from '../features/music/MusicProvider';
import MusicPlayer, { parseLyrics } from '../features/music/MusicPlayer';
import { businessDay } from '../features/review/ReviewPanel';
import { saveDevicePreferences, readDevicePreferences, defaultDevicePreferences } from '../system/storage/DevicePreferences';

const mock = vi.hoisted(() => ({ tracks: vi.fn() }));
vi.mock('../apis/music/ListTracksAPI', () => ({ ListTracksAPI: mock.tracks }));
const track: TrackDTO = { id: 'f1dc9b1d-4bbf-4a21-8206-4176ce47e83f', title: '测试曲目', artist: '合成数据', album: '', source: { kind: 'external', url: 'https://example.com/audio.mp3' }, coverMediaId: null, lyricsMediaId: null, lyrics: '[00:03.5]第一句\n[00:08]第二句', danmaku: [{ at: 4, text: '弹幕' }], duration: 90, position: 0, revision: 1, createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z' };
const session = { authenticated: true, principal: 'owner' as const, instanceId: '84c8ff35-fe4a-470f-9bac-dfb2a68af76b' };
function Harness() {
  const music = useMusic();
  return <><button onClick={() => music.play(track.id)}>start-track</button><button onClick={() => music.setFullScreen(!music.fullScreen)}>toggle-view</button><MusicPlayer /></>;
}
beforeEach(() => { localStorage.clear(); mock.tracks.mockResolvedValue({ items: [track], total: 1, nextOffset: null, revision: 1 }); vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('workspace feature boundaries', () => {
  it('keeps one audio element while changing full/mini views and persists device progress', async () => {
    const { container } = render(<MusicProvider session={session} localOnly={false}><Harness /></MusicProvider>);
    await waitFor(() => expect(mock.tracks).toHaveBeenCalled());
    fireEvent.click(screen.getByText('start-track'));
    await screen.findByText('测试曲目');
    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
    Object.defineProperty(audio, 'duration', { configurable: true, value: 90 });
    if (!audio) throw new Error('audio missing');
    fireEvent.loadedMetadata(audio);
    audio.currentTime = 7; fireEvent.timeUpdate(audio);
    fireEvent.click(screen.getByText('toggle-view'));
    await screen.findByRole('dialog', { name: '全屏播放器' });
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    expect(container.querySelector('audio')).toBe(audio);
    fireEvent.click(screen.getByTitle('回到迷你播放器'));
    expect(container.querySelector('audio')).toBe(audio);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(`meow:v2:${session.instanceId}:owner:device:player`) ?? '{}').progress).toBe(7));
  });

  it('defines review days by the chosen timezone and parses synchronized lyrics', () => {
    const now = new Date('2026-10-24T00:30:00.000Z');
    expect(businessDay(now, 'Asia/Shanghai')).toBe('2026-10-24');
    expect(businessDay(now, 'America/Los_Angeles')).toBe('2026-10-23');
    expect(parseLyrics('[00:03.50][00:09]一句歌词')).toEqual([{ at: 3.5, text: '一句歌词' }, { at: 9, text: '一句歌词' }]);
  });

  it('keeps custom device shortcuts in the new namespace and permits disabling them', () => {
    localStorage.setItem('keyboardShortcuts', 'legacy sentinel');
    saveDevicePreferences(session.instanceId, { ...defaultDevicePreferences, newMemoKey: null, searchKey: 'f', submitShortcut: false, showContext: false });
    expect(readDevicePreferences(session.instanceId).newMemoKey).toBeNull();
    expect(readDevicePreferences(session.instanceId).searchKey).toBe('f');
    expect(localStorage.getItem('keyboardShortcuts')).toBe('legacy sentinel');
  });
});
