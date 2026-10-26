import React from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, SkipBack, SkipForward, ListMusic, X } from 'lucide-react';
import { usePlayback } from './usePlayback';
import MusicModal from './presentation/MusicModal';
import MusicPlaylistDialog from './presentation/MusicPlaylistDialog';
export { parseLyrics } from './presentation/MusicView';
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function MusicPlayer({canWrite=false,localOnly=true}:{canWrite?:boolean;localOnly?:boolean}={}) {
  const playback = usePlayback({canWrite,localOnly});
  const { music, audioRef, currentSong, playlist, currentSongIndex, lyrics, currentLyricIndex, currentTime, duration, isPlaying, volume, isLoop, showLyrics, togglePlay, playNext, playPrevious, playSong, setVolume, setIsLoop, toggleLyrics, setCurrentTime, deleteSongAtIndex, handleTimeUpdate, handleLoadedMetadata, handleSongEnd, handleAudioError, error } = playback;
  const [volOpen, setVolOpen] = React.useState(false);
  const volRef = React.useRef<HTMLDivElement>(null);
  const lyricsRef = React.useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const [showPlaylist, setShowPlaylist] = React.useState(false);
  const isCollapsed = music.device.collapsed;
  function handleCollapse() { music.updateDevice({ collapsed: true }); }
  function handleExpand() { music.updateDevice({ collapsed: false }); }
  const onOpenFull = () => music.setFullScreen(true);
  React.useEffect(() => {
    function close(event: MouseEvent) { if (event.target instanceof Node && !volRef.current?.contains(event.target)) setVolOpen(false); }
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!currentSong) return null;
  return (
    <>
      <div
        className={`fixed bottom-4 right-4 z-40 transition-all duration-500 ease-in-out ${
          isCollapsed
            ? 'w-16 h-16 opacity-0 hover:opacity-100 focus-within:opacity-100'
            : 'w-96 max-w-[90vw] opacity-100'
        } bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-200 dark:border-gray-700 shadow-lg rounded-xl overflow-visible sidebar-hover-block`}
        onFocusCapture={()=>setIsHovered(true)}
        onBlurCapture={(event)=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget))setIsHovered(false);}}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isCollapsed ? (
          // 折叠状态：显示小图标按钮
          <div
            className="w-full h-full flex items-center justify-center cursor-pointer group"
            role="button" tabIndex={0} aria-label="展开播放器"
            onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();handleExpand();}}}
            onClick={handleExpand}
          >
            <div className="relative">
              <img
                src={currentSong.coverUrl || '/images/default-music-cover.svg'}
                alt={currentSong.title}
                className="w-12 h-12 rounded-lg object-cover transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
              />
              {isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // 展开状态：显示完整播放器
          <>
            {/* 折叠按钮 - 左上角，部分在播放器外 */}
            <button
              className={`absolute -top-2 -left-2 z-50 p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-300 shadow-md ${
                isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
              }`}
              aria-label="折叠播放器" onClick={handleCollapse}
            >
              <X className="w-4 h-4" />
            </button>
            {/* 透明歌词容器（位于迷你播放器上方） */}
            {showLyrics && lyrics.length > 0 && (
              <div className="absolute -top-2 right-0 -translate-y-full w-96 max-w-[90vw] bg-transparent rounded-xl p-2 z-[41]">
                <div
                  ref={lyricsRef}
                  className="max-h-40 overflow-hidden rounded-md p-2 bg-transparent"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {(() => {
                    const len = lyrics.length;
                    const idx = currentLyricIndex;
                    const start = Math.max(0, Math.min(idx < 0 ? 0 : idx - 1, Math.max(0, len - 3)));
                    const items = lyrics.slice(start, Math.min(start + 3, len));
                    return items.map((line, i) => {
                      const realIndex = start + i;
                      const active = realIndex === currentLyricIndex;
                      const passed = realIndex < currentLyricIndex;
                      return (
                        <div
                          key={realIndex}
                          className={`py-1.5 text-center ${active ? 'text-black dark:text-white text-base font-semibold' : passed ? 'text-gray-500 dark:text-gray-300 text-xs' : 'text-gray-800 dark:text-gray-200 text-xs'}`}
                          style={{ lineHeight: 1.5, whiteSpace: 'pre-line' }}
                        >
                          {line.section && (<div className="text-[10px] text-blue-300 mb-0.5">[{line.section}]</div>)}
                          <div>{line.text}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            <div className="relative w-full overflow-hidden rounded-xl">
              <div className="flex items-center p-3 gap-3">
                <img
                  src={currentSong.coverUrl || '/images/default-music-cover.svg'}
                  alt={currentSong.title}
                  className="w-12 h-12 rounded object-cover cursor-pointer"
                  role="button" tabIndex={0} aria-label="打开全屏播放器" onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpenFull();}}}
                  onClick={onOpenFull}
                />
                <div className="flex-1 min-w-0">
                  <div role="button" tabIndex={0} aria-label={`打开${currentSong.title}的全屏播放器`} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpenFull();}}} className="text-sm font-medium truncate cursor-pointer" onClick={onOpenFull}>
                    {currentSong.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {currentSong.artist}
                  </div>
                </div>

                <div className="flex items-center gap-1 relative">
                  {/* 上一首按钮 */}
                  <button
                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                    aria-label="上一首" onClick={playPrevious}
                    disabled={playlist.length <= 1}
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  {/* 播放/暂停按钮 */}
                  <button
                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                    aria-label={isPlaying?'暂停播放':'开始播放'} onClick={togglePlay}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  {/* 下一首按钮 */}
                  <button
                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                    aria-label="下一首" onClick={playNext}
                    disabled={playlist.length <= 1}
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>

                  {/* 循环播放按钮 */}
                  <button
                    className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ${isLoop ? 'text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}
                    aria-label={isLoop?'关闭单曲循环':'开启单曲循环'} aria-pressed={isLoop}
                    onClick={() => {
                      setIsLoop();
                      if (audioRef.current) audioRef.current.loop = !isLoop;
                    }}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  {/* 歌词按钮 */}
                  <button
                    className={`px-2 py-1 rounded text-xs border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700 ${showLyrics ? 'text-white' : 'text-gray-300'}`}
                    aria-label={showLyrics?'隐藏歌词':'显示歌词'} aria-pressed={showLyrics}
                    onClick={() => {
                      toggleLyrics();
                    }}
                  >
                    词
                  </button>

                  {/* 播放列表按钮 */}
                  <button
                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                    aria-label="播放列表" onClick={() => setShowPlaylist(true)}
                  >
                    <ListMusic className="w-4 h-4" />
                  </button>

                  {/* 音量控制 */}
                  <div className="relative" ref={volRef}>
                    <button
                      className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                      aria-label="调节音量" aria-expanded={volOpen} onClick={() => setVolOpen(o => !o)}
                    >
                      {volume <= 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    {volOpen && (
                      <div className="absolute -top-2 right-0 -translate-y-full w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-2xl z-[60]">
                        <div className="flex items-center gap-2 mb-2">
                          <button
                            className="p-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            aria-label={volume>0?'静音':'取消静音'} onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
                          >
                            {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                          </button>
                          <div className="text-xs text-gray-600 dark:text-gray-300 select-none">{Math.round(volume * 100)}%</div>
                        </div>
                        <input
                          type="range" aria-label="音量"
                          min={0}
                          max={100}
                          value={Math.round(volume * 100)}
                          onChange={(e) => setVolume(Math.max(0, Math.min(1, Number(e.target.value) / 100)))}
                          className="w-full h-2 rounded-lg appearance-none bg-gray-200 dark:bg-gray-700"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 进度条和时间显示 */}
              <div className="px-3 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 min-w-[30px]">
                    {formatTime(currentTime)}
                  </span>
                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden cursor-pointer"
                    role="slider" tabIndex={duration>0?0:-1} aria-label="播放进度" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.min(duration,currentTime)} aria-disabled={duration<=0}
                    onClick={(event)=>{if(duration<=0)return;const rect=event.currentTarget.getBoundingClientRect();if(rect.width>0)setCurrentTime(Math.max(0,Math.min(duration,((event.clientX-rect.left)/rect.width)*duration)));}}
                    onKeyDown={(event)=>{if(duration<=0)return;let next:number;if(event.key==='Home')next=0;else if(event.key==='End')next=duration;else if(event.key==='ArrowLeft'||event.key==='ArrowDown')next=currentTime-5;else if(event.key==='ArrowRight'||event.key==='ArrowUp')next=currentTime+5;else return;event.preventDefault();setCurrentTime(next);}}
                  >
                    <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}/>
                  </div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 min-w-[30px] text-right">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
        <audio
          ref={audioRef}
          src={currentSong.musicUrl}
          loop={isLoop}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleSongEnd}
          onError={handleAudioError}
          className="hidden"
        />
      </div>

      {error && <p role='alert' className='fixed bottom-24 right-4 z-50 text-xs p-3 bg-white dark:bg-gray-800 border rounded-xl'>{error}</p>}
      <MusicModal playback={playback} isOpen={music.fullScreen} onClose={() => music.setFullScreen(false)} />
      {/* 播放列表弹窗 */}
      <MusicPlaylistDialog
        isOpen={showPlaylist}
        onClose={() => setShowPlaylist(false)}
        playlist={playlist}
        currentSongIndex={currentSongIndex}
        isPlaying={isPlaying}
        onSongSelect={playSong}
        onTogglePlay={togglePlay}
        canDelete={playback.canDelete}
        onDeleteSong={(idx) => deleteSongAtIndex(idx)}
      />
    </>
  );
}
