import { z } from 'zod';
import type { SongDTO } from '../../../../shared/contracts/integrations/index.js';
import { parseExternal } from './parseExternal.js';

const record = z.record(z.string(), z.unknown());
export function normalizeSong(value: unknown, fallbackId = ''): SongDTO {
  const song = parseExternal(record, value);
  const safeUrl = (candidate: unknown) => typeof candidate === 'string' && candidate.startsWith('https://') ? candidate : null;
  const text = (candidate: unknown, max = 300) => typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate).slice(0, max) : '';
  const artistValue = song.artists ?? song.artist ?? song.ar;
  const artists = Array.isArray(artistValue) ? artistValue.map((artist) => typeof artist === 'string' ? artist : text(record.safeParse(artist).data?.name)).join(' / ') : text(artistValue);
  const album = record.safeParse(song.album ?? song.al).data;
  return {
    sourceId: text(song.id ?? song.sourceId ?? fallbackId, 100),
    title: text(song.name ?? song.title), artist: artists.slice(0, 300), album: album ? text(album.name) : text(song.album),
    coverUrl: safeUrl(song.pic ?? song.picUrl ?? album?.picUrl), audioUrl: safeUrl(song.url), lyrics: text(song.lyric ?? song.lyrics, 500_000),
  };
}
