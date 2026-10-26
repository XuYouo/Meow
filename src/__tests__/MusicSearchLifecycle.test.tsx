// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongDTO } from '../../shared/contracts/integrations';
import type { TrackDTO, TrackValues } from '../../shared/contracts/music';

const mock = vi.hoisted(() => ({
  search: vi.fn(), resolve: vi.fn(), cover: vi.fn(), create: vi.fn(), error: vi.fn(), success: vi.fn(),
  music: { tracks: [] as TrackDTO[], current: undefined as TrackDTO | undefined, playing: false, refresh: vi.fn(), setPlaying: vi.fn(), playPreview: vi.fn() },
}));
vi.mock('../apis/integrations/SearchMusicAPI', () => ({ SearchMusicAPI: mock.search }));
vi.mock('../apis/integrations/ResolveMusicAPI', () => ({ ResolveMusicAPI: mock.resolve }));
vi.mock('../apis/integrations/ImportImageURLAPI', () => ({ ImportImageURLAPI: mock.cover }));
vi.mock('../apis/music/CreateTrackAPI', () => ({ CreateTrackAPI: mock.create }));
vi.mock('../features/music/MusicProvider', () => ({ useMusic: () => mock.music }));
vi.mock('sonner', () => ({ toast: { error: mock.error, success: mock.success } }));
import MusicSearchCard from '../features/music/MusicSearchCard';

const song: SongDTO = { sourceId: '1001', title: '搜索曲目', artist: '合成作者', album: '测试专辑', coverUrl: null, audioUrl: null, lyrics: '' };
const resolved: SongDTO = { ...song, coverUrl: 'https://example.org/cover-v1.png', audioUrl: 'https://example.org/audio-v1.mp3', lyrics: '[00:01]歌词' };
const cover = { id: '8ad47bd9-e33a-4434-8a1b-dfa814be7e69' };
const props = () => ({ open: true, keyword: '合成测试', onClose: vi.fn(), localOnly: false, canWrite: true });
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { resolve, promise };
}
async function add() { fireEvent.click(await screen.findByTitle('加入音乐列表')); }
async function readyAfterFailure() { await waitFor(() => expect(mock.error).toHaveBeenCalled()); await waitFor(() => expect(screen.getByTitle('加入音乐列表')).toHaveProperty('disabled', false)); }
beforeEach(() => {
  vi.resetAllMocks(); mock.music.tracks = []; mock.music.current = undefined; mock.music.playing = false;
  mock.search.mockResolvedValue({ items: [song] }); mock.resolve.mockResolvedValue(resolved); mock.cover.mockResolvedValue(cover);
  mock.create.mockImplementation((input: { id: string; values: TrackValues }) => Promise.resolve({ ...input.values, id: input.id, revision: 1 }));
  mock.music.refresh.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('music search prepared operations', () => {
  it('reuses frozen resolved metadata, cover and exact create payload after uncertain delivery', async () => {
    mock.resolve.mockResolvedValueOnce(resolved).mockResolvedValueOnce({ ...resolved, audioUrl: 'https://example.org/audio-v2.mp3', coverUrl: 'https://example.org/cover-v2.png' });
    mock.create.mockRejectedValueOnce(new Error('提交结果未确认')).mockResolvedValueOnce({});
    render(<MusicSearchCard {...props()} />); await add(); await readyAfterFailure(); await add();
    await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2));
    expect(mock.resolve).toHaveBeenCalledTimes(1); expect(mock.cover).toHaveBeenCalledTimes(1);
    expect(mock.create.mock.calls[1]?.[0]).toEqual(mock.create.mock.calls[0]?.[0]);
    expect(mock.create.mock.calls[1]?.[0].values).toMatchObject({ source: { url: resolved.audioUrl }, coverMediaId: cover.id });
    await waitFor(() => expect(mock.music.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog', { name: '搜索音乐' }).className).toContain('max-w-2xl bg-white dark:bg-gray-900');
  });

  it('retries the original cover operation and URL rather than resolving a new cover for the same ID', async () => {
    mock.cover.mockRejectedValueOnce(new Error('封面提交结果未确认')).mockResolvedValueOnce(cover);
    render(<MusicSearchCard {...props()} />); await add(); await readyAfterFailure(); await add();
    await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(1));
    expect(mock.resolve).toHaveBeenCalledTimes(1); expect(mock.cover).toHaveBeenCalledTimes(2);
    expect(mock.cover.mock.calls[1]?.[0]).toEqual(mock.cover.mock.calls[0]?.[0]);
    expect(mock.cover.mock.calls[1]?.[0].url).toBe(resolved.coverUrl);
  });

  it('starts a new operation when a refreshed song with the same source ID has different fields', async () => {
    const changed = { ...song, title: '更新的曲目' };
    mock.create.mockRejectedValueOnce(new Error('先前添加未确认')).mockResolvedValueOnce({});
    mock.resolve.mockResolvedValueOnce(resolved).mockResolvedValueOnce({ ...resolved, title: changed.title, audioUrl: 'https://example.org/changed.mp3' });
    render(<MusicSearchCard {...props()} />); await add(); await readyAfterFailure();
    mock.search.mockResolvedValueOnce({ items: [changed] });
    const input = screen.getByPlaceholderText('搜索网易云音乐歌曲/歌手... 回车搜索');
    fireEvent.change(input, { target: { value: '更新查询' } }); fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('更新的曲目'); await add(); await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2));
    const first = mock.create.mock.calls[0]?.[0], second = mock.create.mock.calls[1]?.[0];
    expect(second.operationId).not.toBe(first.operationId); expect(second.id).not.toBe(first.id);
    expect(second.values).toMatchObject({ title: changed.title, source: { url: 'https://example.org/changed.mp3' } });
    expect(mock.resolve).toHaveBeenCalledTimes(2);
  });
});

describe('music search lifetime and authorization', () => {
  it.each(['readonly', 'offline', 'closed', 'unmounted'] as const)('aborts a pending add Resolve and ignores a late answer after becoming %s', async (state) => {
    const pending = deferred<SongDTO>(); mock.resolve.mockReturnValueOnce(pending.promise);
    const initial = props(), view = render(<MusicSearchCard {...initial} />); await add();
    await waitFor(() => expect(mock.resolve).toHaveBeenCalledTimes(1));
    const signal = mock.resolve.mock.calls[0]?.[1]; expect(signal).toBeInstanceOf(AbortSignal);
    if (state === 'unmounted') view.unmount();
    else view.rerender(<MusicSearchCard {...initial} canWrite={state !== 'readonly'} localOnly={state === 'offline'} open={state !== 'closed'} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(resolved); await pending.promise; });
    expect(mock.cover).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled(); expect(mock.music.refresh).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled();
  });

  it('checks current writer ownership again after an already-issued cover request resolves late', async () => {
    const pending = deferred<{ id: string }>(); mock.cover.mockReturnValueOnce(pending.promise);
    const initial = props(), view = render(<MusicSearchCard {...initial} />); await add();
    await waitFor(() => expect(mock.cover).toHaveBeenCalledTimes(1));
    const signal = mock.cover.mock.calls[0]?.[1]; view.rerender(<MusicSearchCard {...initial} canWrite={false} />); expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(cover); await pending.promise; });
    expect(mock.create).not.toHaveBeenCalled(); expect(mock.music.refresh).not.toHaveBeenCalled();
  });

  it('does not start a player preview after the search card has unmounted', async () => {
    const pending = deferred<SongDTO>(); mock.resolve.mockReturnValueOnce(pending.promise);
    const view = render(<MusicSearchCard {...props()} />); fireEvent.click(await screen.findByRole('button', { name: '播放' }));
    await waitFor(() => expect(mock.resolve).toHaveBeenCalledTimes(1)); view.unmount();
    expect(mock.resolve.mock.calls[0]?.[1].aborted).toBe(true);
    await act(async () => { pending.resolve(resolved); await pending.promise; }); expect(mock.music.playPreview).not.toHaveBeenCalled();
  });

  it('does not let an aborted older search replace the current result list', async () => {
    const previous = deferred<{ items: SongDTO[] }>(); mock.search.mockReturnValueOnce(previous.promise).mockResolvedValueOnce({ items: [{ ...song, title: '当前搜索结果' }] });
    render(<MusicSearchCard {...props()} />);
    const input = screen.getByPlaceholderText('搜索网易云音乐歌曲/歌手... 回车搜索'); fireEvent.change(input, { target: { value: '当前查询' } }); fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('当前搜索结果'); await act(async () => { previous.resolve({ items: [song] }); await previous.promise; });
    expect(screen.getByText('当前搜索结果')).toBeTruthy(); expect(screen.queryByText(song.title)).toBeNull();
  });
});
