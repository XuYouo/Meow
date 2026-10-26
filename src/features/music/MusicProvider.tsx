import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { builtinMusic } from './presentation/MusicView';

import { TrackSchema, type TrackDTO } from '../../../shared/contracts/music';
import { ListTracksAPI } from '../../apis/music/ListTracksAPI';
import type { Session } from '../../objects/identity/Session';

const deviceSchema = z.object({ currentId: z.string().nullable(), volume: z.number().min(0).max(1), progress: z.number().nonnegative(), loop: z.enum(['off', 'one', 'all']), lyricsVisible: z.boolean(), collapsed: z.boolean().default(false) });
export type PlayerDeviceState = z.infer<typeof deviceSchema>;
interface MusicState {
  tracks: TrackDTO[]; revision: number; loading: boolean; error: string;
  current: TrackDTO | undefined; playing: boolean; device: PlayerDeviceState; fullScreen: boolean;
  refresh: () => Promise<void>; play: (trackId: string) => void; setPlaying: (value: boolean) => void;
  updateDevice: (patch: Partial<PlayerDeviceState>) => void; setFullScreen: (value: boolean) => void;
  playPreview: (track: TrackDTO) => void;
}
const MusicContext = createContext<MusicState | null>(null);
export function MusicProvider({ session, localOnly, children }: { session: Session; localOnly: boolean; children: ReactNode }) {
  const key = `meow:v2:${session.instanceId}:${session.principal}:music`;
  const deviceKey = `meow:v2:${session.instanceId}:${session.principal}:device:player`;
  const [tracks, setTracks] = useState<TrackDTO[]>(() => {
    try { const parsed = TrackSchema.array().safeParse(JSON.parse(localStorage.getItem(key) ?? '[]')); return parsed.success ? parsed.data : []; } catch { return []; }
  });
  const [device, setDevice] = useState<PlayerDeviceState>(() => {
    try { return deviceSchema.parse(JSON.parse(localStorage.getItem(deviceKey) ?? 'null')); } catch { return { currentId: builtinMusic.id, volume: 0.8, progress: 0, loop: 'off', lyricsVisible: false, collapsed: false }; }
  });
  const [revision, setRevision] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [preview, setPreview] = useState<TrackDTO | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (session.principal !== 'owner' || localOnly) return;
    setLoading(true); setError('');
    try {
      const items: TrackDTO[] = []; let offset: number | null = 0; let listRevision = 0;
      while (offset !== null) {
        const response = await ListTracksAPI({ offset, limit: 500 });
        items.push(...response.items); offset = response.nextOffset; listRevision = response.revision;
      }
      setTracks(items); setRevision(listRevision); localStorage.setItem(key, JSON.stringify(items));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '曲库读取失败。'); }
    finally { setLoading(false); }
  }, [key, localOnly, session.principal]);
  useEffect(() => { void refresh(); }, [refresh]);
  const updateDevice = useCallback((patch: Partial<PlayerDeviceState>) => setDevice((previous) => {
    return { ...previous, ...patch };
  }), []);
  useEffect(() => { try { localStorage.setItem(deviceKey, JSON.stringify(device)); } catch { setError('设备播放偏好无法保存，当前播放仍可继续。'); } }, [device, deviceKey]);
  function play(trackId: string) { updateDevice({ currentId: trackId, progress: 0 }); setPlaying(true); }
  const current = tracks.find((track) => track.id === device.currentId) ?? (preview?.id === device.currentId ? preview : device.currentId === builtinMusic.id ? builtinMusic : undefined);
  useEffect(() => { if (!current) setPlaying(false); }, [current]);
  return <MusicContext.Provider value={{ tracks, revision, loading, error, current, playing, device, fullScreen, refresh, play, setPlaying, updateDevice, setFullScreen, playPreview: (track) => { setPreview(track); play(track.id); } }}>{children}</MusicContext.Provider>;
}
export function useMusic() { const value = useContext(MusicContext); if (!value) throw new Error('MusicProvider is required'); return value; }
