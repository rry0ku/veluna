import React, { useState } from 'react';
import {
  Heart,
  Download,
  Info,
  FileMusic,
  Music,
  Shuffle,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Repeat,
  Repeat1,
  Mic2,
  Moon,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Track, AudioInfo, RepeatMode, CtxMenu } from '../../types';
import { getTrackGradient, formatTime, parseDurationToSeconds, parseTrackMeta, parseArtistParts } from '../../utils';
import { invoke } from '@tauri-apps/api/core';
import { WaveformBar } from '../WaveformBar';
import { SpeedSelector } from '../SpeedSelector';
import { SleepTimerPopover } from '../SleepTimerPopover';

export interface PlayerBarProps {
  currentTrack: Track | null;
  getTrackCover: (track: Track | null | undefined) => string;
  isPlaying: boolean;
  isLoadingTrack: boolean;
  loadingTrackUrl?: string | null;
  audioInfo: AudioInfo | null;
  progressSeconds: number;
  trackDurationSeconds: number;
  waveformData: number[];
  abLoop: { a: number | null; b: number | null };
  setAbLoop: React.Dispatch<React.SetStateAction<{ a: number | null; b: number | null }>>;
  shuffle: boolean;
  repeatMode: RepeatMode;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  crossfadeSeconds: number;
  sleepTimer: number;
  showSleepPopover: boolean;
  setShowSleepPopover: React.Dispatch<React.SetStateAction<boolean>>;
  setSleepTimerMinutes: (m: number) => void;
  cancelSleepTimer: () => void;
  showLyrics: boolean;
  setShowLyrics: React.Dispatch<React.SetStateAction<boolean>>;
  volume: number;
  setVolume: (volume: number) => void;
  togglePlayPause: () => void;
  toggleMute: () => void;
  handleSkipForward: () => void;
  handleSkipBack: () => void;
  handleDownload: (track: Track) => void;
  downloadingTracks: Record<string, number>;
  isTrackLiked: (url: string) => boolean;
  toggleLikeTrack: (track: Track) => void;
  openCtx: (e: React.MouseEvent, menu: Omit<CtxMenu, 'x' | 'y'>) => void;
  setInfoModalTrack?: (track: Track | null) => void;
  progressRef: React.RefObject<HTMLDivElement | null>;
  volumeRef: React.RefObject<HTMLDivElement | null>;
  isDraggingProgress: boolean;
  setIsDraggingProgress: (v: boolean) => void;
  isDraggingProgressRef?: React.MutableRefObject<boolean>;
  isDraggingVolume: boolean;
  setIsDraggingVolume: (v: boolean) => void;
  updateProgressFromEvent?: (clientX: number) => void;
  updateVolumeFromEvent?: (clientX: number) => void;
  calculateProgressPercent?: () => number;
  queue?: Track[];
  playlistContextRef?: React.MutableRefObject<any>;
  progressSecondsRef?: React.MutableRefObject<number>;
  abLoopRef?: React.MutableRefObject<{ a: number | null; b: number | null }>;
  trackDurationRef?: React.MutableRefObject<number>;
  showToast?: (msg: string) => void;
  onArtistClick?: (artistName: string) => void;
}

export const PlayerBar: React.FC<PlayerBarProps> = React.memo(({
  currentTrack,
  getTrackCover,
  isPlaying,
  isLoadingTrack,
  loadingTrackUrl: _loadingTrackUrl,
  audioInfo,
  progressSeconds,
  trackDurationSeconds,
  waveformData,
  abLoop,
  setAbLoop,
  shuffle,
  repeatMode,
  toggleShuffle,
  cycleRepeat,
  playbackSpeed,
  setPlaybackSpeed,
  crossfadeSeconds,
  sleepTimer,
  showSleepPopover,
  setShowSleepPopover,
  setSleepTimerMinutes,
  cancelSleepTimer,
  showLyrics,
  setShowLyrics,
  volume,
  setVolume: _setVolume,
  togglePlayPause,
  toggleMute,
  handleSkipForward,
  handleSkipBack,
  handleDownload,
  downloadingTracks,
  isTrackLiked,
  toggleLikeTrack,
  openCtx,
  setInfoModalTrack,
  progressRef,
  volumeRef,
  isDraggingProgress,
  setIsDraggingProgress,
  isDraggingProgressRef,
  isDraggingVolume,
  setIsDraggingVolume,
  updateProgressFromEvent: customUpdateProgress,
  updateVolumeFromEvent: customUpdateVolume,
  calculateProgressPercent: customCalculateProgress,
  queue = [],
  playlistContextRef,
  progressSecondsRef,
  abLoopRef,
  trackDurationRef,
  showToast = () => {},
  onArtistClick,
}) => {
  const [showRemainingTime, setShowRemainingTime] = useState(false);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [isHoveringVolume, setIsHoveringVolume] = useState(false);

  const calculateProgressPercent = customCalculateProgress || (() => {
    const total = trackDurationSeconds || parseDurationToSeconds(currentTrack?.duration || '0:00');
    return total === 0 ? 0 : Math.min((progressSeconds / total) * 100, 100);
  });

  const updateProgressFromEvent = customUpdateProgress || ((clientX: number) => {
    if (!progressRef.current || !currentTrack) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const total = trackDurationSeconds || parseDurationToSeconds(currentTrack.duration);
    const time = total * pct;
    invoke('seek_audio', { time }).catch(() => {});
  });

  const updateVolumeFromEvent = customUpdateVolume || ((clientX: number) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const v = Math.round(pct * 100);
    _setVolume(v);
    invoke('set_volume', { volume: v }).catch(() => {});
  });

  return (
    <div className="v-player-dock">
      {isLoadingTrack && (
        <div style={{position:"absolute",top:0,left:0,width:"100%",height:"2px",overflow:"hidden",background:"rgba(255,255,255,0.03)",zIndex:10}}>
          <div style={{position:"absolute",top:0,height:"100%",background:"linear-gradient(90deg, transparent, rgba(226,221,217,0.3), #ffffff, #e2ddd9, transparent)",borderRadius:"999px",animation:"velunaLoadStream 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite"}}/>
        </div>
      )}
      {isPlaying&&!isLoadingTrack&&<div style={{position:"absolute",top:0,left:0,right:0,height:"1px",background:"rgba(226,221,217,0.06)"}}/>}

      <div style={{display:"flex",alignItems:"center",gap:"12px",minWidth:0,maxWidth:"35%",flexShrink:0}}>
        {currentTrack ? (
          <>
            <div style={{
              position:"relative",width:"56px",height:"56px",borderRadius:"12px",overflow:"hidden",border:"1px solid rgba(255,255,255,0.07)",flexShrink:0,cursor:"pointer",
              background: getTrackGradient(currentTrack.title, currentTrack.artist),
              display:"flex",alignItems:"center",justifyContent:"center"
            }}
              onClick={()=>{ if(!currentTrack.url.startsWith('local://') && setInfoModalTrack) setInfoModalTrack(currentTrack); }}
              onContextMenu={e=>{ if(!currentTrack.url.startsWith('local://')) openCtx(e,{type:'track',track:currentTrack}); }}
              onMouseEnter={e=>{ const ov=e.currentTarget.querySelector<HTMLElement>('.art-ov'); if(ov) ov.style.opacity='1'; }}
              onMouseLeave={e=>{ const ov=e.currentTarget.querySelector<HTMLElement>('.art-ov'); if(ov) ov.style.opacity='0'; }}>
              <FileMusic size={18} style={{position: 'absolute', color:"rgba(255,255,255,0.25)"}}/>
              {currentTrack.cover && (
                <img
                  src={getTrackCover(currentTrack) || currentTrack.cover}
                  alt={currentTrack.title}
                  style={{position: 'absolute', inset: 0, width:"100%",height:"100%",objectFit:"cover"}}
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              {isLoadingTrack && !isPlaying
                ? <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width="22" height="22" viewBox="0 0 24 24" style={{animation:"spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite"}}>
                      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(226,221,217,0.2)" strokeWidth="2.2"/>
                      <circle cx="12" cy="12" r="9" fill="none" stroke="#e2ddd9" strokeWidth="2.2" strokeDasharray="56.5" strokeDashoffset="38" strokeLinecap="round"/>
                    </svg>
                  </div>
                : !currentTrack.url.startsWith('local://')
                  ? <div className="art-ov" style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .15s"}}>
                      <Info size={14} style={{color:"#e2ddd9"}}/>
                    </div>
                  : null}
            </div>
            <div
              key={currentTrack.url}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                minWidth: 0,
                animation: "fadeIn 0.25s ease both"
              }}
            >
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "1px",
                minWidth: 0,
                flex: 1
              }}>
                {(() => {
                  const meta = parseTrackMeta(currentTrack.title, currentTrack.artist);
                  return (
                    <>
                      <div
                        title={meta.title || currentTrack.title}
                        style={{
                          fontWeight: 700,
                          color: "#e2ddd9",
                          fontSize: "14px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: "1.3"
                        }}
                      >
                        {meta.title || currentTrack.title}
                      </div>
                      {isLoadingTrack && !isPlaying ? (
                        <div style={{ display: "flex", alignItems: "center", height: "16px" }}>
                          <div style={{ display: "flex", gap: "3px", alignItems: "center", height: "12px" }}>
                            {[0, 1, 2, 3, 4].map(i => (
                              <span key={i} style={{ width: "2.5px", background: "#e2ddd9", borderRadius: "2px", height: "4px", animation: `velunaEqualizerWave 0.8s ease-in-out ${i * 110}ms infinite` }} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#8a807c",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            lineHeight: "1.2"
                          }}
                        >
                          {(() => {
                            const artistParts = parseArtistParts(meta.artist || currentTrack.artist);
                            const canClickAny = Boolean(onArtistClick && !currentTrack.url.startsWith('local://'));
                            return artistParts.map((part, idx) => {
                              if (part.isSeparator) {
                                return (
                                  <span key={idx} style={{ color: "#8a807c", pointerEvents: "none" }}>
                                    {part.name}
                                  </span>
                                );
                              }
                              return (
                                <span
                                  key={idx}
                                  onClick={(e) => {
                                    if (canClickAny && onArtistClick) {
                                      e.stopPropagation();
                                      onArtistClick(part.name);
                                    }
                                  }}
                                  onMouseEnter={e => {
                                    if (canClickAny) {
                                      e.currentTarget.style.color = '#e2ddd9';
                                      e.currentTarget.style.textDecoration = 'underline';
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    if (canClickAny) {
                                      e.currentTarget.style.color = '#8a807c';
                                      e.currentTarget.style.textDecoration = 'none';
                                    }
                                  }}
                                  style={{
                                    cursor: canClickAny ? 'pointer' : 'default',
                                    transition: 'color 0.12s ease'
                                  }}
                                  title={canClickAny ? `View ${part.name}` : undefined}
                                >
                                  {part.name}
                                </span>
                              );
                            });
                          })()}
                        </div>
                      )}
                      {audioInfo && !isLoadingTrack && (
                        <div style={{ display: "flex", alignItems: "center", marginTop: "2px" }}>
                          <div className="v-player-codec-badge" style={{ flexShrink: 0, marginTop: 0, lineHeight: 1 }}>
                            {audioInfo.codec.toUpperCase()}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {!currentTrack.url.startsWith('local://') && (
                <div style={{ display: "flex", alignItems: "center", gap: "1px", flexShrink: 0 }}>
                  <button
                    onClick={() => toggleLikeTrack(currentTrack)}
                    title={isTrackLiked(currentTrack.url) ? "Unlike" : "Like"}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "5px",
                      display: "flex",
                      color: "#5c5755",
                      transition: "color .12s, transform .1s"
                    }}
                    onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                    onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    <Heart size={16} style={isTrackLiked(currentTrack.url) ? { color: "#e05555", fill: "#e05555" } : { color: "#5c5755" }} />
                  </button>
                  {(() => {
                    const dl = downloadingTracks[currentTrack.url];
                    return (
                      <button
                        onClick={() => handleDownload(currentTrack)}
                        title={dl > 0 && dl < 100 ? `Downloading ${Math.round(dl)}% (Click to cancel)` : "Download"}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "5px",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          color: "#5c5755",
                          transition: "color .12s, transform .1s"
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                      >
                        {dl > 0 ? (
                          <>
                            <span style={{ fontSize: "10px", fontWeight: 700, color: "#e2ddd9", fontVariantNumeric: "tabular-nums" }}>{Math.round(dl)}%</span>
                            <svg width="15" height="15" viewBox="0 0 14 14">
                              <circle cx="7" cy="7" r="5.5" fill="none" stroke="#2a2727" strokeWidth="1.5" />
                              <circle cx="7" cy="7" r="5.5" fill="none" stroke="#9e9894" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 5.5}`} strokeDashoffset={`${2 * Math.PI * 5.5 * (1 - Math.min(dl, 100) / 100)}`} style={{ transformOrigin: "7px 7px", transform: "rotate(-90deg)", transition: "stroke-dashoffset .25s" }} />
                              {dl >= 100 && <path d="M4.5 7l2 2 3-3" stroke="#9e9894" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
                            </svg>
                          </>
                        ) : (
                          <Download size={15} />
                        )}
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{width:"42px",height:"42px",borderRadius:"7px",border:"1px solid var(--v-bdr2)",background:"var(--v-bg2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <Music size={16} style={{color:"#8a807c"}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,color:"#e2ddd9",fontSize:"12.5px"}}>Nothing playing</div>
              <div style={{fontSize:"11px",color:"#8a807c"}}>Search YouTube to start</div>
            </div>
          </>
        )}
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"10px",padding:"0 16px",minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%"}}>
          <div style={{display:"flex",alignItems:"center",gap:"14px",flexShrink:0}}>
            <SpeedSelector speed={playbackSpeed} onChange={setPlaybackSpeed}/>
            <button
              onClick={toggleShuffle}
              title={`Shuffle: ${shuffle ? 'On' : 'Off'}`}
              style={{
                position: "relative",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: shuffle ? "var(--v-accent)" : "rgba(255, 255, 255, 0.4)",
                padding: "6px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                transition: "all .12s ease"
              }}
              onMouseEnter={e => { e.currentTarget.style.color = shuffle ? "var(--v-accent)" : "rgba(255, 255, 255, 0.9)"; e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = shuffle ? "var(--v-accent)" : "rgba(255, 255, 255, 0.4)"; e.currentTarget.style.transform = "scale(1)"; }}
            >
              <Shuffle size={15}/>
              {shuffle && (
                <div style={{
                  position: "absolute",
                  bottom: "1px",
                  width: "3px",
                  height: "3px",
                  borderRadius: "50%",
                  background: "var(--v-accent)"
                }} />
              )}
            </button>
            <button onClick={handleSkipBack} title="Previous" style={{background:"none",border:"none",cursor:currentTrack?"pointer":"not-allowed",color:currentTrack?"#9e9894":"#2a2727",padding:"3px",display:"flex",transition:"color .12s,transform .1s"}}
              onMouseEnter={e=>{if(currentTrack)e.currentTarget.style.transform="scale(1.15)";}} onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>
              <SkipBack size={17}/>
            </button>
            <button onClick={togglePlayPause} disabled={!currentTrack}
              className="v-player-btn-play">
              {isLoadingTrack
                ? <svg width="20" height="20" viewBox="0 0 24 24" style={{animation:"spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite"}}>
                    <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(12,11,11,0.15)" strokeWidth="2.5"/>
                    <circle cx="12" cy="12" r="8.5" fill="none" stroke="#0c0b0b" strokeWidth="2.5" strokeDasharray="53.4" strokeDashoffset="36" strokeLinecap="round"/>
                  </svg>
                : isPlaying ? <Pause fill="currentColor" size={18}/> : <Play fill="currentColor" size={18} style={{marginLeft:"2px"}}/>}
            </button>
            <button onClick={handleSkipForward} title={queue.length > 0 ? `Next (${queue.length} in queue)` : "Next"} style={{background:"none",border:"none",cursor:(queue.length > 0 || (playlistContextRef && playlistContextRef.current !== null) || currentTrack)?"pointer":"not-allowed",color:(queue.length > 0 || (playlistContextRef && playlistContextRef.current !== null) || currentTrack)?"#9e9894":"#2a2727",padding:"3px",display:"flex",transition:"color .12s,transform .1s"}}
              onMouseEnter={e=>{if(queue.length > 0 || (playlistContextRef && playlistContextRef.current !== null) || currentTrack)e.currentTarget.style.transform="scale(1.15)";}} onMouseLeave={e=>(e.currentTarget.style.transform="scale(1)")}>
              <SkipForward size={17}/>
            </button>
            <button
              onClick={cycleRepeat}
              title={`Repeat: ${repeatMode === 'off' ? 'Off' : repeatMode === 'one' ? 'Repeat One' : 'Repeat All'}`}
              style={{
                position: "relative",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: repeatMode !== 'off' ? "var(--v-accent)" : "rgba(255, 255, 255, 0.4)",
                padding: "6px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                transition: "all .12s ease"
              }}
              onMouseEnter={e => { e.currentTarget.style.color = repeatMode !== 'off' ? "var(--v-accent)" : "rgba(255, 255, 255, 0.9)"; e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = repeatMode !== 'off' ? "var(--v-accent)" : "rgba(255, 255, 255, 0.4)"; e.currentTarget.style.transform = "scale(1)"; }}
            >
              {repeatMode === 'one' ? <Repeat1 size={15}/> : <Repeat size={15}/>}
              {repeatMode !== 'off' && (
                <div style={{
                  position: "absolute",
                  bottom: "1px",
                  width: "3px",
                  height: "3px",
                  borderRadius: "50%",
                  background: "var(--v-accent)"
                }} />
              )}
            </button>
            <button
              title={
                abLoop.a === null
                  ? 'Set A (loop start point)'
                  : abLoop.b === null
                  ? `Loop start: ${formatTime(abLoop.a)}. Click to set B (end point)`
                  : `Loop active: ${formatTime(abLoop.a)} → ${formatTime(abLoop.b)}. Click or right-click to clear`
              }
              onClick={() => {
                const curr = progressSecondsRef?.current ?? progressSeconds;
                if (abLoop.a === null) {
                  setAbLoop({ a: curr, b: null });
                  if (abLoopRef) abLoopRef.current = { a: curr, b: null };
                  showToast(`Loop A: ${formatTime(curr)}`);
                } else if (abLoop.b === null) {
                  const aVal = abLoop.a ?? 0;
                  if (Math.abs(curr - aVal) >= 0.5) {
                    const a = Math.min(aVal, curr);
                    const b = Math.max(aVal, curr);
                    setAbLoop({ a, b });
                    if (abLoopRef) abLoopRef.current = { a, b };
                    showToast(`Loop: ${formatTime(a)} → ${formatTime(b)}`);
                  } else {
                    showToast('Loop range must be at least 0.5s');
                  }
                } else {
                  setAbLoop({ a: null, b: null });
                  if (abLoopRef) abLoopRef.current = { a: null, b: null };
                  showToast('Loop cleared');
                }
              }}
              onContextMenu={e => {
                e.preventDefault();
                setAbLoop({ a: null, b: null });
                if (abLoopRef) abLoopRef.current = { a: null, b: null };
                showToast('Loop cleared');
              }}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: "2px",
                padding: "6px",
                borderRadius: "6px",
                border: "none",
                fontSize: "11px",
                fontWeight: 700,
                flexShrink: 0,
                cursor: "pointer",
                background: "none",
                color: (abLoop.b !== null || abLoop.a !== null) ? "var(--v-accent)" : "rgba(255, 255, 255, 0.4)",
                transition: "all .12s ease",
                lineHeight: 1
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = (abLoop.b !== null || abLoop.a !== null) ? "var(--v-accent)" : "rgba(255, 255, 255, 0.9)";
                e.currentTarget.style.transform = "scale(1.1)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = (abLoop.b !== null || abLoop.a !== null) ? "var(--v-accent)" : "rgba(255, 255, 255, 0.4)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <span>A·B</span>
              {abLoop.b !== null ? (
                <div style={{
                  position: "absolute",
                  bottom: "1px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "3px",
                  height: "3px",
                  borderRadius: "50%",
                  background: "var(--v-accent)"
                }} />
              ) : abLoop.a !== null ? (
                <div style={{
                  position: "absolute",
                  bottom: "1px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "3px",
                  height: "3px",
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.6)",
                  animation: "velunaPulse 1s ease-in-out infinite"
                }} />
              ) : null}
            </button>
          </div>
        </div>

        {(() => {
          const totalDuration = (trackDurationRef?.current) || trackDurationSeconds || (currentTrack ? parseDurationToSeconds(currentTrack.duration) : 0);
          const remainingSeconds = Math.max(0, totalDuration - progressSeconds);
          const tooltipPct = hoverPct !== null ? hoverPct : (isDraggingProgress ? calculateProgressPercent() : null);
          const tooltipTime = tooltipPct !== null ? formatTime(totalDuration * (tooltipPct / 100)) : '0:00';
          return (
            <div style={{width:"100%",display:"flex",alignItems:"center",gap:"10px"}}>
              <span className="v-progress-time" style={{textAlign:"right",minWidth:"34px"}}>
                {currentTrack ? formatTime(progressSeconds) : '0:00'}
              </span>
              <div
                ref={progressRef}
                className="v-progress-container"
                onMouseDown={e => {
                  if (!currentTrack) return;
                  if (isDraggingProgressRef) isDraggingProgressRef.current = true;
                  setIsDraggingProgress(true);
                  updateProgressFromEvent(e.clientX);
                  if (progressRef.current) {
                    const rect = progressRef.current.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    setHoverPct(pct * 100);
                  }
                }}
                onMouseEnter={e => {
                  if (!progressRef.current || !currentTrack) return;
                  const rect = progressRef.current.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setHoverPct(pct * 100);
                }}
                onMouseMove={e => {
                  if (!progressRef.current || !currentTrack) return;
                  const rect = progressRef.current.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setHoverPct(pct * 100);
                }}
                onMouseLeave={() => setHoverPct(null)}
              >
                <div className="v-progress-track">
                  {currentTrack && (
                    <div
                      className="v-progress-tooltip"
                      style={{
                        left: `${tooltipPct ?? 0}%`,
                        opacity: (hoverPct !== null || isDraggingProgress) ? 1 : undefined,
                        transform: (hoverPct !== null || isDraggingProgress) ? 'translateX(-50%) translateY(0)' : undefined
                      }}
                    >
                      {tooltipTime}
                    </div>
                  )}
                  {hoverPct !== null && (
                    <div
                      className="v-progress-ghost"
                      style={{ width: `${hoverPct}%` }}
                    />
                  )}
                  {waveformData.length > 0 && (
                    <WaveformBar
                      waveform={waveformData}
                      progressPercent={calculateProgressPercent()}
                      isDragging={isDraggingProgress}
                    />
                  )}
                  <div
                    className="v-progress-fill"
                    style={{
                      width: `${calculateProgressPercent()}%`,
                      transition: isDraggingProgress ? 'none' : 'width 0.2s linear'
                    }}
                  >
                    <div className="v-progress-thumb"/>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowRemainingTime(r => !r)}
                className="v-progress-time v-progress-time-btn"
                style={{minWidth:"34px",textAlign:"left",cursor:"pointer",background:"none",border:"none",padding:0}}
                title={showRemainingTime ? "Click to show total duration" : "Click to show remaining time"}
              >
                {currentTrack
                  ? (showRemainingTime ? `-${formatTime(remainingSeconds)}` : formatTime(totalDuration))
                  : '0:00'}
              </button>
            </div>
          );
        })()}
      </div>

      <div style={{width:"240px",maxWidth:"30%",minWidth:"140px",display:"flex",alignItems:"center",justifyContent:"flex-end",gap:"12px",flexShrink:1}}>
        {crossfadeSeconds>0&&(
          <span style={{fontSize:"9.5px",color:"#5c5755",fontWeight:700,fontVariantNumeric:"tabular-nums",flexShrink:0}} title={`Crossfade: ${crossfadeSeconds}s`}>
            ×{crossfadeSeconds}s
          </span>
        )}
        <button onClick={()=>{if(currentTrack)setShowLyrics(o=>!o);}} disabled={!currentTrack} title="Lyrics"
          style={{background:"none",border:"none",cursor:currentTrack?"pointer":"not-allowed",color:showLyrics?"var(--v-accent)":"rgba(255, 255, 255, 0.4)",flexShrink:0,display:"flex",padding:"3px",transition:"all .12s ease",opacity:currentTrack?1:0.4}}
          onMouseEnter={e=>{if(currentTrack)e.currentTarget.style.color=showLyrics?"var(--v-accent)":"rgba(255, 255, 255, 0.9)";}}
          onMouseLeave={e=>{e.currentTarget.style.color=showLyrics?"var(--v-accent)":"rgba(255, 255, 255, 0.4)";}}>
          <Mic2 size={16}/>
        </button>
        <div style={{position:"relative",flexShrink:0}} onClick={e => e.stopPropagation()}>
          <button onClick={() => setShowSleepPopover(o => !o)} title={sleepTimer > 0 ? `Sleep in ${Math.ceil(sleepTimer/60)}m` : 'Sleep Timer'}
            style={{background:"none",border:"none",cursor:"pointer",color:sleepTimer>0?"var(--v-accent)":showSleepPopover?"#e2ddd9":"rgba(255, 255, 255, 0.4)",flexShrink:0,display:"flex",padding:"3px",transition:"all .12s ease",transform:showSleepPopover?"scale(1.15)":"none"}}
            onMouseEnter={e=>{e.currentTarget.style.color=sleepTimer>0?"var(--v-accent)":"rgba(255, 255, 255, 0.9)";}}
            onMouseLeave={e=>{if(!showSleepPopover && sleepTimer<=0)e.currentTarget.style.color="rgba(255, 255, 255, 0.4)";}}>
            <Moon size={16} style={sleepTimer > 0 ? {animation:'velunaPulse 2s ease-in-out infinite'} : {}}/>
          </button>
          {showSleepPopover && (
            <div style={{position:"absolute",bottom:"calc(100% + 12px)",right:"0px",zIndex:9999}}>
              <SleepTimerPopover
                sleepTimer={sleepTimer}
                onSet={setSleepTimerMinutes}
                onCancel={cancelSleepTimer}
                onClose={() => setShowSleepPopover(false)}
              />
            </div>
          )}
        </div>
        <button onClick={toggleMute} title={volume===0?"Unmute":"Mute"}
          style={{background:"none",border:"none",cursor:"pointer",flexShrink:0,padding:"3px",color:volume===0?"#e05555":"rgba(255, 255, 255, 0.4)",display:"flex",transition:"all .12s ease"}}
          onMouseEnter={e=>(e.currentTarget.style.color=volume===0?"#ff7070":"rgba(255, 255, 255, 0.9)")}
          onMouseLeave={e=>(e.currentTarget.style.color=volume===0?"#e05555":"rgba(255, 255, 255, 0.4)")}>
          {volume===0 ? <VolumeX size={16}/> : <Volume2 size={16}/>}
        </button>
        <div style={{position:"relative",display:"flex",alignItems:"center",gap:"5px",flexShrink:0}}>
          <div ref={volumeRef}
            className="slider-track"
            style={{position:"relative",width:"72px",height:"4px",background:"#232020",borderRadius:"2px",cursor:"pointer"}}
            onMouseDown={e=>{setIsDraggingVolume(true);updateVolumeFromEvent(e.clientX);}}
            onMouseEnter={()=>setIsHoveringVolume(true)}
            onMouseLeave={()=>setIsHoveringVolume(false)}>
            <div style={{position:"absolute",top:0,left:0,height:"100%",borderRadius:"2px",pointerEvents:"none",width:`${volume}%`,background:volume>0?"var(--v-accent)":"#232020",transition:isDraggingVolume?"none":"width 0.15s ease-out"}}>
              <div className="slider-thumb" style={{position:"absolute",right:"-5px",top:"50%",transform:"translateY(-50%)",width:"11px",height:"11px",background:"#fff",borderRadius:"50%",opacity:0,pointerEvents:"none",transition:"opacity .12s"}}/>
            </div>
          </div>
          <div style={{
            position:"absolute",
            bottom:"14px",
            left:"50%",
            transform:"translateX(-50%)",
            background:"var(--v-bdr2)",
            border:"1px solid var(--v-bdr2)",
            borderRadius:"5px",
            padding:"2px 6px",
            fontSize:"10px",
            fontWeight:700,
            color:"#9e9894",
            pointerEvents:"none",
            whiteSpace:"nowrap",
            opacity: (isHoveringVolume || isDraggingVolume) ? 1 : 0,
            transition:"opacity .15s",
            zIndex:10
          }}>
            {Math.round(volume)}%
          </div>
        </div>
      </div>
    </div>
  );
});
