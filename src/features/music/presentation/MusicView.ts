import { ReadMediaAPI } from '../../../apis/media/ReadMediaAPI';
import type { TrackDTO } from '../../../../shared/contracts/music';
export type MusicView = TrackDTO & { coverUrl: string; musicUrl: string; isBuiltin: boolean };
export const BUILTIN_MUSIC_ID = '00000000-0000-4000-8000-000000000001';
export const builtinMusic: TrackDTO = { id: BUILTIN_MUSIC_ID, title: '鲜花', artist: '回春丹', album: '', source: { kind: 'external', url: 'https://pic.lover.nyc.mn/2025-08/回春丹 - 鲜花_1755699293512.flac' }, coverMediaId: null, lyricsMediaId: null, lyrics: '', danmaku: [], duration: null, position: 0, revision: 1, createdAt: '2025-08-20T00:00:00.000Z', updatedAt: '2025-08-20T00:00:00.000Z' };
export const musicView = (track: TrackDTO): MusicView => ({ ...track, coverUrl: track.id === BUILTIN_MUSIC_ID ? '/images/xh.jpg' : track.coverMediaId ? ReadMediaAPI(track.coverMediaId) : '', musicUrl: track.source.kind === 'media' ? ReadMediaAPI(track.source.mediaId) : track.source.url, isBuiltin: track.id === BUILTIN_MUSIC_ID });
export type LyricLine = { at: number; text: string; artist?: string; section?: string };
export function parseLyrics(value: string): LyricLine[] {
  return value.split('\n').flatMap((line) => {
    const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
    const times = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    return times.length ? times.map((time) => ({ at: Number(time[1]) * 60 + Number(time[2]), text })) : text ? [{ at: -1, text }] : [];
  }).sort((a, b) => a.at - b.at);
}
