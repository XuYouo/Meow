import { ReadMediaAPI } from '../../apis/media/ReadMediaAPI';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { DeleteTrackAPI } from '../../apis/music/DeleteTrackAPI';
import { useMusic } from './MusicProvider';
import { BUILTIN_MUSIC_ID, builtinMusic, musicView, parseLyrics, type LyricLine } from './presentation/MusicView';

export function usePlayback({canWrite=false,localOnly=true}:{canWrite?:boolean;localOnly?:boolean}={}) {
  const music = useMusic();
  const audioRef = useRef<HTMLAudioElement>(null);
  const writeAllowed=useRef(canWrite&&!localOnly);writeAllowed.current=canWrite&&!localOnly;
  const mounted=useRef(true),deleteController=useRef<AbortController|null>(null);
  const deleteOperation=useRef<{key:string;operationId:string}|null>(null);
  useEffect(()=>{mounted.current=true;const element=audioRef.current;return ()=>{mounted.current=false;deleteController.current?.abort();element?.pause();};},[]);
  useEffect(()=>{if(!canWrite||localOnly)deleteController.current?.abort();},[canWrite,localOnly]);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [builtinLyrics, setBuiltinLyrics] = useState<LyricLine[]>([]);
  const currentSong = music.current ? musicView(music.current) : null;
  const source = currentSong?.musicUrl;
  const { playing, device, setPlaying, updateDevice, current } = music;
  useEffect(() => { if (audioRef.current) audioRef.current.volume = device.volume; }, [device.volume]);
  useEffect(() => {
    const element = audioRef.current;
    if (!element || !source) return;
    let active=true;
    if (playing) void element.play().catch((cause: unknown) => { if(!active)return;setPlaying(false); setError(cause instanceof DOMException && cause.name === 'NotAllowedError' ? '浏览器尚未允许播放，请点击播放按钮。' : '音频暂时无法播放，请检查文件或外部音频地址。'); });
    else element.pause();
    return ()=>{active=false;};
  }, [playing, source, setPlaying]);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    const track = current;
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album, artwork: track.coverMediaId ? [{ src: ReadMediaAPI(track.coverMediaId) }] : [] });
    navigator.mediaSession.setActionHandler('play', () => setPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setPlaying(false));
    return () => { navigator.mediaSession.setActionHandler('play', null); navigator.mediaSession.setActionHandler('pause', null); navigator.mediaSession.metadata = null; };
  }, [current, setPlaying]);
  useEffect(() => {
    if (current?.id !== BUILTIN_MUSIC_ID) return;
    const controller = new AbortController();
    void fetch('/ci/鲜花.json', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const value: unknown = await response.json();
      const parsed = z.object({ lyrics: z.array(z.object({ time: z.string(), text: z.string() })).max(5000) }).safeParse(value);
      if (parsed.success && !controller.signal.aborted) setBuiltinLyrics(parsed.data.lyrics.flatMap((line) => parseLyrics(`[${line.time}]${line.text}`)));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [current?.id]);
  const playlist = [builtinMusic, ...music.tracks].map(musicView);
  const currentSongIndex = playlist.findIndex((track) => track.id === currentSong?.id);
  function skip(direction: number) {
    const next = playlist[(currentSongIndex + direction + playlist.length) % playlist.length];
    if (next) music.play(next.id);
  }
  function seek(time: number) { const value = Math.max(0, Math.min(duration || time, time)); if (audioRef.current) audioRef.current.currentTime = value; updateDevice({ progress: value }); }
  function handleSongEnd() {
    if (device.loop === 'one' && audioRef.current) { seek(0); void audioRef.current.play().catch(() => setPlaying(false)); return; }
    if (currentSongIndex < playlist.length - 1 || device.loop === 'all') skip(1);
    else { setPlaying(false); updateDevice({ progress: 0 }); }
  }
  async function deleteSongAtIndex(index: number) {
    if(!mounted.current||!writeAllowed.current||deleteController.current)return;
    const selected=playlist[index];if(!selected||selected.isBuiltin)return;
    const track=music.tracks.find((entry)=>entry.id===selected.id);if(!track)return;
    const key=JSON.stringify([track.id,track.revision]);
    if(deleteOperation.current?.key!==key)deleteOperation.current={key,operationId:crypto.randomUUID()};
    const controller=new AbortController();deleteController.current=controller;
    try{
      await DeleteTrackAPI({id:track.id,baseRevision:track.revision,operationId:deleteOperation.current.operationId},controller.signal);
      if(!mounted.current||!writeAllowed.current||controller.signal.aborted)return;
      await music.refresh();
    }catch(cause){if(mounted.current&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'删除失败，请重试。');}
    finally{if(deleteController.current===controller)deleteController.current=null;}
  }
  const lyrics = currentSong?.id === BUILTIN_MUSIC_ID ? builtinLyrics : parseLyrics(currentSong?.lyrics ?? '');
  const currentLyricIndex = lyrics.reduce((selected, line, index) => line.at >= 0 && line.at <= device.progress ? index : selected, -1);
  return {
    music, audioRef, currentSong, playlist, currentSongIndex, lyrics, currentLyricIndex,
    currentTime: device.progress, duration, error, isPlaying: playing, volume: device.volume, isLoop: device.loop === 'one', showLyrics: device.lyricsVisible,
    togglePlay: () => setPlaying(!playing), playNext: () => skip(1), playPrevious: () => skip(-1),
    playSong: (index: number) => { const track = playlist[index]; if (track) music.play(track.id); },
    setVolume: (volume: number) => updateDevice({ volume }),
    setIsLoop: () => updateDevice({ loop: device.loop === 'one' ? 'off' : 'one' }),
    toggleLyrics: () => updateDevice({ lyricsVisible: !device.lyricsVisible }),
    setCurrentTime: seek, deleteSongAtIndex, canDelete:canWrite&&!localOnly,
    handleTimeUpdate: () => { if (audioRef.current) updateDevice({ progress: audioRef.current.currentTime }); },
    handleLoadedMetadata: () => { const element = audioRef.current; if (!element) return; setError(''); setDuration(Number.isFinite(element.duration) ? element.duration : music.current?.duration ?? 0); element.currentTime = device.progress; },
    handleSongEnd, handleAudioError: () => { setPlaying(false); if (playing) setError('音频暂时无法播放，请检查文件或外部音频地址。'); },
  };
}
export type Playback = ReturnType<typeof usePlayback>;
