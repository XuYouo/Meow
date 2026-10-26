import React from 'react';
import { SkipBack, SkipForward, ListMusic } from 'lucide-react';
import SvgIcon from './SvgIcon';
import DanmakuComponent from './DanmakuComponent';
import MusicPlaylistDialog from './MusicPlaylistDialog';
import type { Playback } from '../usePlayback';
import { useModalFocus } from '../../../pages/Index/hooks/useModalFocus';

export default function MusicModal({ playback, isOpen, onClose, danmakuText = '好听', enableDanmaku = true }: { playback: Playback; isOpen: boolean; onClose: () => void; danmakuText?: string; enableDanmaku?: boolean }) {
  const { currentSong, playlist, currentSongIndex, isPlaying, currentTime, duration, lyrics, currentLyricIndex, isLoop, showLyrics, volume, setVolume, togglePlay, playNext, playPrevious, playSong, deleteSongAtIndex, setIsLoop: toggleLoop, toggleLyrics } = playback;
  const [showVol, setShowVol] = React.useState(false);
  const [showPlaylist, setShowPlaylist] = React.useState(false);
  const volRef = React.useRef<HTMLDivElement>(null);
  const volTrackRef = React.useRef<HTMLDivElement>(null);
  const isDraggingVolRef = React.useRef(false);
  const lyricsContainerRef = React.useRef<HTMLDivElement>(null);
  const computeLayoutMode = () => window.innerWidth <= 420 || window.innerHeight <= 520 ? 'disc' : window.innerWidth <= 640 || window.innerHeight <= 620 ? 'info' : window.innerWidth <= 900 || window.innerHeight <= 760 ? 'controls' : 'full';
  const [layoutMode, setLayoutMode] = React.useState<'disc' | 'info' | 'controls' | 'full'>(computeLayoutMode);
  function closeModal(){setShowPlaylist(false);setShowVol(false);isDraggingVolRef.current=false;onClose();}
  const dialogRef = useModalFocus<HTMLDivElement>(isOpen && !showPlaylist, closeModal);
  React.useEffect(() => { const resize = () => setLayoutMode(computeLayoutMode()); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  React.useEffect(() => {
    if (isOpen) document.body.setAttribute('data-music-modal-open', 'true');
    return () => document.body.removeAttribute('data-music-modal-open');
  }, [isOpen]);
  const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
  const setVolumeByClientY = React.useCallback((clientY: number) => { const track = volTrackRef.current; if (!track) return; const rect = track.getBoundingClientRect(); if(rect.height<=0)return;setVolume(1 - clamp((clientY - rect.top) / rect.height, 0, 1)); }, [setVolume]);
  const onVolMouseDown = (event: React.MouseEvent<HTMLDivElement>) => { isDraggingVolRef.current = true; setVolumeByClientY(event.clientY); event.preventDefault(); };
  React.useEffect(() => { const move = (event: MouseEvent) => { if (isOpen && isDraggingVolRef.current) setVolumeByClientY(event.clientY); }; const up = () => { isDraggingVolRef.current = false; }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; }, [setVolumeByClientY,isOpen]);
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => { if (event.target !== event.currentTarget) return; if (showPlaylist) setShowPlaylist(false); else closeModal(); };
  const getDanmakuText = React.useCallback(() => { const current = lyrics[currentLyricIndex]?.text; const candidates = [current, danmakuText, '太好听了', '绝了', '♪', currentSong?.title].filter((text): text is string => Boolean(text)); return candidates[Math.floor(Math.random() * candidates.length)] ?? danmakuText; }, [lyrics, currentLyricIndex, currentSong?.title, danmakuText]);
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const discSizeMap = {
    disc: 'clamp(10.5rem, 58vw, 18rem)',
    info: 'clamp(10rem, 54vw, 17.5rem)',
    controls: 'clamp(9.8rem, 50vw, 17rem)',
    full: 'clamp(9.2rem, 46vw, 16rem)',
  };
  const ringThicknessMap = {
    disc: { outer: 'clamp(0.75rem, 3.5vw, 1.2rem)', inner: 'clamp(0.55rem, 2.8vw, 0.9rem)' },
    info: { outer: 'clamp(0.7rem, 3.2vw, 1.1rem)', inner: 'clamp(0.5rem, 2.5vw, 0.85rem)' },
    controls: { outer: 'clamp(0.65rem, 3vw, 1.05rem)', inner: 'clamp(0.45rem, 2.2vw, 0.8rem)' },
    full: { outer: 'clamp(0.6rem, 2.8vw, 1rem)', inner: 'clamp(0.4rem, 2vw, 0.75rem)' },
  };
  const discSize = discSizeMap[layoutMode] || discSizeMap.full;
  const { outer: outerRingThickness, inner: innerRingThickness } = ringThicknessMap[layoutMode] || ringThicknessMap.full;
  const centerButtonSize = 'clamp(2.5rem, 10vw, 3.4rem)';
  const showSongInfo = layoutMode !== 'disc';
  const showControlRow = layoutMode === 'controls' || layoutMode === 'full';
  const showLyricsSection = layoutMode === 'full' && showLyrics && lyrics.length > 0;
  const canToggleLyrics = layoutMode === 'full';

  if (!isOpen || !currentSong) return null;
  return (
    <>
      {enableDanmaku && (
        <DanmakuComponent
          isVisible={isOpen}
          getText={getDanmakuText}
          opacity={0.7}
          speed={3}
          isLoop={true}
          maxLines={8}
          screenRatio={0.5}
          interval={800}
          fontSize={18}
          color="#ffffff"
          density={3}
          randomHeight
          randomSpeed
          randomSize
          zIndex={45}
        />
      )}
      <div
        className="fixed inset-0 bg-[rgba(0,0,0,0.3)] bg-opacity-75 flex items-center justify-center z-50 transition-opacity duration-300 ease-in-out font-[family-name:var(--font-geist-sans)] px-4 sm:px-6"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef} tabIndex={-1} role='dialog' aria-modal='true' aria-label='全屏播放器' className="bg-[#282A2A] rounded-2xl w-full max-w-2xl mx-auto px-5 py-6 sm:px-8 sm:py-8 transform transition-all duration-300 ease-in-out relative flex flex-col items-center gap-4 sm:gap-5 pt-10 sm:pt-14 pb-4"
          style={{ animation: isOpen ? 'modalSlideIn 0.3s ease-out' : 'modalSlideOut 0.3s ease-in', width: 'min(92vw, 36rem)', maxHeight: 'min(90vh, 42rem)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button title='回到迷你播放器' aria-label='回到迷你播放器' onClick={closeModal} className="cursor-pointer absolute top-4 right-4">
            <SvgIcon name="close" width={30} height={30} color="#333" />
          </button>

          <div
            className="text-center bg-[#3C3E3F] rounded-full relative flex items-center justify-center shadow-lg mx-auto box-border"
            style={{ width: discSize, height: discSize, padding: outerRingThickness }}
          >
            <div
              className="bg-[#030303] rounded-full overflow-hidden shadow-lg flex items-center justify-center relative w-full h-full box-border"
              style={{ padding: innerRingThickness }}
            >
              <img
                src={currentSong.coverUrl || '/images/default-music-cover.svg'}
                alt={currentSong.title}
                className={`object-cover rounded-full border-[3px] border-white transition-transform duration-1000 w-full h-full ${isPlaying ? 'animate-spin' : ''}`}
                style={{ animationDuration: '10s' }}
              />

              {/* 唱片中央播放/暂停按钮 */}
              {!isPlaying && (
                <button type="button" aria-label="开始播放"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer bg-[rgba(0,0,0,0.5)] rounded-full flex items-center justify-center"
                  style={{ width: centerButtonSize, height: centerButtonSize }}
                  onClick={togglePlay}
                >
                  <SvgIcon name="play" color="#fff" className="w-full h-full" />
                </button>
              )}

              {isPlaying && (
                <button type="button" aria-label="暂停播放"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer bg-[rgba(0,0,0,0.5)] rounded-full flex items-center justify-center"
                  style={{ width: centerButtonSize, height: centerButtonSize }}
                  onClick={togglePlay}
                >
                  <SvgIcon name="pause" color="#fff" className="w-full h-full" />
                </button>
              )}
            </div>
          </div>

          {showSongInfo && (
            <>
              <div className="text-lg sm:text-xl text-white mt-2 text-center px-2 break-words">{currentSong.title}</div>
              <p className="text-sm sm:text-base text-gray-300 text-center px-2">{currentSong.artist}</p>
            </>
          )}

          {showControlRow && (
          <div className="w-full flex flex-col items-center gap-2 mb-2">
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5">
              {/* 上一首按钮 */}
              <button
                onClick={playPrevious}
                className="cursor-pointer text-white hover:text-gray-300 transition-colors disabled:opacity-40"
                title="上一首"
                disabled={playlist.length <= 1}
              >
                <SkipBack className="w-5 h-5" />
              </button>

              {/* 播放/暂停按钮 */}
              <button type="button" aria-label={isPlaying?'暂停播放':'开始播放'} onClick={togglePlay} className="cursor-pointer">
                {isPlaying ? (
                  <SvgIcon name="pause" width={20} height={20} color="#fff" />
                ) : (
                  <SvgIcon name="play" width={20} height={20} color="#fff" />
                )}
              </button>

              {/* 下一首按钮 */}
              <button
                onClick={playNext}
                className="cursor-pointer text-white hover:text-gray-300 transition-colors"
                title="下一首"
                disabled={playlist.length <= 1}
              >
                <SkipForward className="w-5 h-5" />
              </button>

              {/* 循环播放按钮 */}
              {!isLoop ? (
                <button type="button" aria-label={isLoop?'关闭单曲循环':'开启单曲循环'} aria-pressed={isLoop} onClick={toggleLoop}>
                  <SvgIcon name="pepicons" width={20} height={20} color="#fff" className="cursor-pointer" />
                </button>
              ) : (
                <button type="button" aria-label={isLoop?'关闭单曲循环':'开启单曲循环'} aria-pressed={isLoop} onClick={toggleLoop}>
                  <SvgIcon name="no-pepicons" width={20} height={20} color="#fff" className="cursor-pointer" />
                </button>
              )}

              {/* 歌词按钮 */}
              {canToggleLyrics && (
                <button type="button" aria-label={showLyrics?'隐藏歌词':'显示歌词'} aria-pressed={showLyrics}
                  className={`cursor-pointer text-white text-xs sm:text-sm ${showLyrics ? 'font-semibold' : 'font-normal'}`}
                  onClick={toggleLyrics}
                >
                  词
                </button>
              )}

              {/* 播放列表按钮 */}
              <button
                onClick={() => setShowPlaylist(true)}
                className="cursor-pointer text-white hover:text-gray-300 transition-colors"
                title="播放列表"
              >
                <ListMusic className="w-5 h-5" />
              </button>

              {/* 音量控制 */}
              <div
                className="relative flex items-center"
                ref={volRef}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.05 : 0.05;
                  setVolume(clamp(volume + delta, 0, 1));
                }}
              >
                <button
                  className="cursor-pointer text-white text-sm px-2 py-1 rounded hover:bg-[#4a4c4d]"
                  title={volume > 0 ? '静音' : '取消静音'} aria-label={volume > 0 ? '静音' : '取消静音'}
                  onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
                  onFocus={() => setShowVol(true)}
                  onMouseEnter={() => setShowVol(true)}
                >
                  {volume > 0 ? '🔊' : '🔇'}
                </button>
                {showVol && (
                  <div
                    className="absolute bottom-9 left-1/2 -translate-x-1/2 bg-[#2f3132] border border-gray-700 rounded-xl px-3 py-3 shadow-2xl z-50"
                    onMouseLeave={() => setShowVol(false)}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="text-[11px] text-gray-300 select-none">{Math.round(volume * 100)}%</div>
                      <div
                        role="slider" tabIndex={0} aria-label="音量" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(volume*100)}
                        onKeyDown={(event)=>{let next:number;if(event.key==='Home')next=0;else if(event.key==='End')next=1;else if(event.key==='ArrowUp'||event.key==='ArrowRight')next=volume+0.05;else if(event.key==='ArrowDown'||event.key==='ArrowLeft')next=volume-0.05;else return;event.preventDefault();setVolume(clamp(next,0,1));}}
                        ref={volTrackRef}
                        className="relative w-2 h-28 rounded-full bg-gray-700 cursor-pointer"
                        onMouseDown={onVolMouseDown}
                        onClick={(e) => setVolumeByClientY(e.clientY)}
                      >
                        <div
                          className="absolute bottom-0 left-0 w-full bg-white rounded-full"
                          style={{ height: `${Math.round(volume * 100)}%` }}
                        />
                        <div
                          className="absolute left-1/2 -translate-x-1/2 rounded-full w-4 h-4 bg-white shadow"
                          style={{ bottom: `calc(${Math.round(volume * 100)}% - 0.5rem)` }}
                          onMouseDown={onVolMouseDown}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <span className="text-white text-xs sm:text-sm text-center leading-tight">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          )}

          {/* 歌词（放入卡片内） */}
          {showLyricsSection && (
            <div className="w-full mt-2">
              <div
                ref={lyricsContainerRef}
                className="rounded-lg px-3 py-2 overflow-y-auto scrollbar-hide"
                style={{ scrollbarWidth: 'none', maxHeight: 'min(32vh, 13rem)' }}
              >
                {(() => {
                  const len = lyrics.length;
                  const idx = currentLyricIndex;
                  const start = Math.max(0, Math.min(idx < 0 ? 0 : idx - 1, Math.max(0, len - 3)));
                  const items = lyrics.slice(start, Math.min(start + 3, len));
                  return items.map((lyric, i) => {
                    const realIndex = start + i;
                    const isCurrentLyric = realIndex === currentLyricIndex;
                    const isPassedLyric = realIndex < currentLyricIndex;
                    return (
                      <div
                        key={realIndex}
                className={`py-1.5 px-2 transition-all duration-300 text-center ${isCurrentLyric ? 'text-white text-base sm:text-xl font-bold' : isPassedLyric ? 'text-gray-300 text-xs sm:text-sm' : 'text-gray-200 text-xs sm:text-sm'}`}
                        style={{ lineHeight: '1.6', whiteSpace: 'pre-line' }}
                      >
                        {lyric.artist && (<div className="text-[10px] sm:text-xs text-gray-400 mb-1">{lyric.artist}</div>)}
                        {lyric.section && (<div className="text-[10px] sm:text-xs text-blue-300 mb-1 font-semibold">[{lyric.section}]</div>)}
                        <div>{lyric.text}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* 无音频元素：音频源在迷你播放器 */}
        </div>

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

        <style>{`
          @keyframes modalSlideIn { from { opacity: 0; transform: scale(0.9) translateY(-20px);} to { opacity: 1; transform: scale(1) translateY(0);} }
          @keyframes modalSlideOut { from { opacity: 1; transform: scale(1) translateY(0);} to { opacity: 0; transform: scale(0.9) translateY(-20px);} }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
        `}</style>
      </div>
    </>
  );
}

// 无音频元素，作为全局音频（迷你播放器）的控制与展示层
