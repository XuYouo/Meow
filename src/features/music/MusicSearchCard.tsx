import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Loader2, Play, Pause, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SongDTO } from '../../../shared/contracts/integrations';
import { TrackValuesSchema, type TrackValues } from '../../../shared/contracts/music';
import { SearchMusicAPI } from '../../apis/integrations/SearchMusicAPI';
import { ResolveMusicAPI } from '../../apis/integrations/ResolveMusicAPI';
import { ImportImageURLAPI } from '../../apis/integrations/ImportImageURLAPI';
import { CreateTrackAPI } from '../../apis/music/CreateTrackAPI';
import { useMusic } from './MusicProvider';
import { useModalFocus } from '../../pages/Index/hooks/useModalFocus';

interface PreparedAdd {
  fingerprint: string;
  id: string;
  operationId: string;
  coverId: string;
  coverOperationId: string;
  resolved?: SongDTO;
  coverMediaId?: string | null;
  values?: TrackValues;
}
interface ActionRequest { controller: AbortController; write: boolean }
const songFingerprint = (song: SongDTO) => JSON.stringify([song.sourceId, song.title, song.artist, song.album, song.coverUrl, song.audioUrl, song.lyrics]);

export default function MusicSearchCard({ open, keyword, onClose, localOnly = false, canWrite = true }: { open: boolean; keyword: string; onClose: () => void; localOnly?: boolean; canWrite?: boolean }) {
  const music = useMusic();
  const [query, setQuery] = useState(keyword);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [songs, setSongs] = useState<SongDTO[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [fetchLimit, setFetchLimit] = useState(10);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const action = useRef<ActionRequest | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const access = useRef({ open, localOnly, canWrite });
  access.current = { open, localOnly, canWrite };
  const operations = useRef(new Map<string, PreparedAdd>());
  const cancelAction = useCallback(() => {
    action.current?.controller.abort(); action.current = null; busy.current = false;
    if (mounted.current) setBusyId(null);
  }, []);
  function close() { controller.current?.abort(); cancelAction(); onClose(); }
  const dialogRef = useModalFocus<HTMLDivElement>(open, close);
  const canRead = useCallback(() => mounted.current && access.current.open && !access.current.localOnly, []);
  const active = (request: ActionRequest) => canRead() && action.current === request && !request.controller.signal.aborted && (!request.write || access.current.canWrite);
  function beginAction(sourceId: string, write: boolean): ActionRequest | null {
    if (!canRead() || busy.current || (write && !access.current.canWrite)) return null;
    const request = { controller: new AbortController(), write };
    action.current = request; busy.current = true; setBusyId(sourceId); return request;
  }
  function finishAction(request: ActionRequest) {
    if (action.current !== request) return;
    action.current = null; busy.current = false;
    if (mounted.current) setBusyId(null);
  }
  const search = useCallback(async (value: string, limit: number, more = false) => {
    if (!value.trim() || !canRead()) return;
    controller.current?.abort(); cancelAction();
    const current = new AbortController(); controller.current = current;
    const currentSearch = () => canRead() && controller.current === current && !current.signal.aborted;
    setLoading(!more); setLoadingMore(more); setError('');
    try {
      const response = await SearchMusicAPI({ query: value, limit }, current.signal);
      if (!currentSearch()) return;
      setSongs(response.items); setFetchLimit(limit); setCanLoadMore(limit < 50 && response.items.length >= limit);
    } catch (cause) { if (currentSearch()) setError(cause instanceof Error ? cause.message : '搜索失败'); }
    finally { if (currentSearch()) { setLoading(false); setLoadingMore(false); } }
  }, [canRead, cancelAction]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); action.current?.controller.abort(); action.current = null; busy.current = false; };
  }, []);
  useEffect(() => {
    if (!open || localOnly) {
      controller.current?.abort(); cancelAction(); setLoading(false); setLoadingMore(false);
    } else if (!canWrite && action.current?.write) cancelAction();
  }, [open, localOnly, canWrite, cancelAction]);
  useEffect(() => {
    if (!open || localOnly || !keyword.trim()) return;
    void search(keyword, 10);
    const current = controller.current;
    return () => current?.abort();
  }, [open, localOnly, keyword, search]);
  async function detail(song: SongDTO, signal: AbortSignal): Promise<SongDTO> {
    return song.audioUrl ? { sourceId: song.sourceId, title: song.title, artist: song.artist, album: song.album, coverUrl: song.coverUrl, audioUrl: song.audioUrl, lyrics: song.lyrics } : ResolveMusicAPI({ sourceId: song.sourceId }, signal);
  }
  function valuesFor(song: SongDTO, coverMediaId: string | null): TrackValues {
    if (!song.audioUrl) throw new Error('该歌曲暂无播放地址。');
    return TrackValuesSchema.parse({ title: song.title, artist: song.artist, album: song.album, source: { kind: 'external', url: song.audioUrl }, coverMediaId, lyricsMediaId: null, lyrics: song.lyrics, danmaku: [], duration: null });
  }
  async function handlePlay(song: SongDTO) {
    if (!canRead() || busy.current) return;
    if (playingId === song.sourceId && music.current?.title === song.title) { music.setPlaying(!music.playing); return; }
    const current = beginAction(song.sourceId, false); if (!current) return;
    try {
      const resolved = await detail(song, current.controller.signal); if (!active(current)) return;
      const values = valuesFor(resolved, null);
      const now = new Date().toISOString();
      music.playPreview({ ...values, id: crypto.randomUUID(), position: 0, revision: 1, createdAt: now, updatedAt: now });
      setPlayingId(song.sourceId);
    } catch (cause) { if (active(current)) toast.error(cause instanceof Error ? cause.message : '播放失败'); }
    finally { finishAction(current); }
  }
  async function handleAddToList(song: SongDTO) {
    if (!canRead() || !access.current.canWrite || busy.current) return;
    if (music.tracks.some((track) => track.title === song.title && track.artist === song.artist)) { toast.success('已在音乐列表中'); return; }
    const current = beginAction(song.sourceId, true); if (!current) return;
    const fingerprint = songFingerprint(song);
    let prepared = operations.current.get(song.sourceId);
    if (!prepared || prepared.fingerprint !== fingerprint) {
      prepared = { fingerprint, id: crypto.randomUUID(), operationId: crypto.randomUUID(), coverId: crypto.randomUUID(), coverOperationId: crypto.randomUUID() };
      operations.current.set(song.sourceId, prepared);
    }
    try {
      if (!prepared.resolved) {
        const resolved = await detail(song, current.controller.signal); if (!active(current)) return;
        if (!resolved.audioUrl) throw new Error('该歌曲暂无播放地址。');
        prepared.resolved = { ...resolved };
      }
      if (!active(current)) return;
      // Keep the same resolved URL and cover request after uncertain network delivery.
      if (prepared.coverMediaId === undefined) {
        if (prepared.resolved.coverUrl) {
          const cover = await ImportImageURLAPI({ id: prepared.coverId, operationId: prepared.coverOperationId, url: prepared.resolved.coverUrl }, current.controller.signal);
          if (!active(current)) return;
          prepared.coverMediaId = cover.id;
        } else prepared.coverMediaId = null;
      }
      if (!active(current)) return;
      prepared.values ??= valuesFor(prepared.resolved, prepared.coverMediaId);
      await CreateTrackAPI({ id: prepared.id, operationId: prepared.operationId, values: prepared.values }, current.controller.signal);
      if (!active(current)) return;
      await music.refresh(); if (active(current)) toast.success('已添加到音乐列表');
    } catch (cause) { if (active(current)) toast.error(cause instanceof Error ? cause.message : '添加失败'); }
    finally { finishAction(current); }
  }
  const isPlaying = music.playing;
  const results = songs.map((song) => ({ ...song, id: song.sourceId, name: song.title, artists: song.artist, pic: song.coverUrl, duration: '', error: '', fetchingUrl: busyId === song.sourceId, _uploading: false, _liked: music.tracks.some((track) => track.title === song.title && track.artist === song.artist) }));
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
    >
      {/* 点击遮罩关闭搜索卡片 */}
      <div className="absolute inset-0 bg-black/20" onMouseDown={close} />
      <div ref={dialogRef} tabIndex={-1} role='dialog' aria-modal='true' aria-label='搜索音乐' className="relative w-full max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void search(query, 10); }}
            placeholder="搜索网易云音乐歌曲/歌手... 回车搜索"
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100"
          />
          <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800" onClick={close} title="关闭">
            <X className="w-4 h-4" />
          </button>
        </div>

  <div className="max-h-[60vh] overflow-auto scrollbar-theme">
          {loading && (
            <div className="flex items-center justify-center p-6 text-gray-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> 正在搜索...
            </div>
          )}
          {!loading && error && (
            <div className="p-6 text-center text-red-500">{error}</div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="p-6 text-center text-gray-500">未找到相关歌曲</div>
          )}
          {!loading && !error && results.length > 0 && (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {results.map((s) => (
                <li key={s.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {/* 封面：若已解析到图片则显示图片，否则显示首字文字封面 */}
                  <div className="w-12 h-12 rounded overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    {s.pic ? (
                      <img src={s.pic} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-base font-semibold text-gray-800 dark:text-gray-100">
                        {(s.name || '').trim().slice(0, 1) || '?'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-gray-500 truncate">{s.artists} {s.duration ? `· ${s.duration}` : ''}</div>
                    {s.error && <div className="text-xs text-red-500 mt-1">{s.error}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                      onClick={() => handlePlay(s)}
                      disabled={s.fetchingUrl || s._uploading || localOnly}
                    >
                      {s.fetchingUrl ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : playingId === s.id && isPlaying && music.current?.title === s.name ? (
                        <><Pause className="inline w-3.5 h-3.5 mr-1" /> 暂停</>
                      ) : (
                        <><Play className="inline w-3.5 h-3.5 mr-1" /> 播放</>
                      )}
                    </button>
                    <button
                      className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${s._liked ? 'text-red-500' : ''}`}
                      title="加入音乐列表"
                      onClick={() => handleAddToList(s)}
                      disabled={s.fetchingUrl || s._uploading || localOnly || !canWrite}
                    >
                      {s._liked ? (
                        <Heart className="w-4 h-4" fill="currentColor" stroke="none" />
                      ) : (
                        <Heart className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {/* 底部：显示更多 */}
          {!loading && !error && results.length > 0 && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-800 flex justify-center">
              {canLoadMore ? (
                <button
                  className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                  disabled={loadingMore}
                  onClick={() => void search(query, Math.min(50, fetchLimit + 10), true)}
                >
                  {loadingMore ? (<span className="inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载中</span>) : '显示更多'}
                </button>
              ) : (
                <span className="text-xs text-gray-500">没有更多了</span>
              )}
            </div>
          )}
        </div>

        {/* 不再使用卡片内播放器，交由全局播放器统一管理 */}
      </div>
    </div>
  );
}
