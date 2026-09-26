import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Loader2,
  Mic2,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Track, RepeatMode, LyricsData } from '../../types';
import { formatTime, parseTrackMeta, parseArtistParts, handleThumbnailError } from '../../utils';

interface LyricsViewProps {
  showLyrics: boolean;
  setShowLyrics: (v: boolean) => void;
  currentTrack: Track | null;
  getTrackCover: (track: Track | null | undefined) => string;
  progressSeconds: number;
  trackDurationSeconds: number;
  shuffle: boolean;
  toggleShuffle: () => void;
  handleSkipBack: () => void;
  togglePlayPause: () => void;
  isLoadingTrack: boolean;
  isPlaying: boolean;
  handleSkipForward: () => void;
  repeatMode: RepeatMode;
  cycleRepeat: () => void;
  volume: number;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  lyricsLoading: boolean;
  lyricsData: LyricsData | null;
  lyricsScrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onArtistClick?: (artistName: string) => void;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  showLyrics,
  setShowLyrics,
  currentTrack,
  getTrackCover,
  progressSeconds,
  trackDurationSeconds,
  shuffle,
  toggleShuffle,
  handleSkipBack,
  togglePlayPause,
  isLoadingTrack,
  isPlaying,
  handleSkipForward,
  repeatMode,
  cycleRepeat,
  volume,
  setVolume,
  toggleMute,
  lyricsLoading,
  lyricsData,
  lyricsScrollContainerRef,
  onArtistClick,
}) => {
  React.useEffect(() => {
    if (!showLyrics) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowLyrics(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLyrics, setShowLyrics]);

  if (!showLyrics || !currentTrack) return null;

  const lines = lyricsData?.lines || [];
  let currentIdx = lines.length > 0 ? lines.length - 1 : 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time > progressSeconds) {
      currentIdx = Math.max(0, i - 1);
      break;
    }
  }
  const pct = trackDurationSeconds > 0 ? Math.min((progressSeconds / trackDurationSeconds) * 100, 100) : 0;
  const remaining = trackDurationSeconds - progressSeconds;

  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",userSelect:"none",background:"var(--v-bg0)"}}>
      {/* Background layers */}
      {getTrackCover(currentTrack) && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', inset: '-40px',
          backgroundImage: `url(${getTrackCover(currentTrack)})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(45px) saturate(1.6) brightness(0.65)',
          transform: 'translateZ(0)',
          willChange: 'transform',
          opacity: 0.88,
        }} />
      )}
      <div style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: "radial-gradient(circle at 70% 50%, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.45) 70%)"
      }}/>

      {/* Left panel: centered and responsive */}
      <div className="custom-scrollbar" style={{position:"relative",zIndex:10,width:"clamp(260px, 30vw, 360px)",flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",gap:"12px",maxHeight:"100vh",overflowY:"auto",boxSizing:"border-box"}}>

        {/* Close button */}
        <button onClick={()=>setShowLyrics(false)}
          style={{position:"absolute",top:"20px",left:"20px",width:"34px",height:"34px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",border:"1px solid rgba(255,255,255,0.1)",cursor:"pointer",color:"rgba(255,255,255,0.6)",background:"rgba(255,255,255,0.06)",transition:"color .15s,background .15s,border-color .15s"}}
          onMouseEnter={e=>{e.currentTarget.style.color="#fff";e.currentTarget.style.background="rgba(255,255,255,0.12)";e.currentTarget.style.borderColor="rgba(255,255,255,0.18)";}}
          onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.6)";e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";}}>
          <X size={16} />
        </button>

        {/* Album art */}
        <div style={{width:"clamp(130px, 24vh, 220px)",height:"clamp(130px, 24vh, 220px)",borderRadius:"12px",overflow:"hidden",flexShrink:0,boxShadow:"0 24px 64px rgba(0,0,0,0.65)",position:"relative",marginTop:"12px"}}>
          {getTrackCover(currentTrack)
            ? <img src={getTrackCover(currentTrack)} alt={currentTrack.title} onError={handleThumbnailError} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            : <div style={{width:"100%",height:"100%",background:"var(--v-bdr2)",display:"flex",alignItems:"center",justifyContent:"center"}}><Music size={32} style={{color:"var(--v-fg3)"}}/></div>}
        </div>

        {/* Track info */}
        {(() => {
          const meta = parseTrackMeta(currentTrack.title, currentTrack.artist);
          return (
            <div style={{width:"100%",display:"flex",flexDirection:"column",gap:"2px",textAlign:"center"}}>
              <p style={{fontSize:"16px",fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",margin:0,letterSpacing:"-0.01em"}}>{meta.title || currentTrack.title}</p>
              <p
                style={{
                  fontSize:"12.5px",
                  color:"rgba(255,255,255,0.5)",
                  margin:0,
                  overflow:"hidden",
                  textOverflow:"ellipsis",
                  whiteSpace:"nowrap",
                  lineHeight: "1.2"
                }}
              >
                {(() => {
                  const artistParts = parseArtistParts(meta.artist || currentTrack.artist);
                  const canClickAny = Boolean(onArtistClick && !currentTrack.url.startsWith('local://'));
                  return artistParts.map((part, idx) => {
                    if (part.isSeparator) {
                      return (
                        <span key={idx} style={{ color: "rgba(255,255,255,0.5)", pointerEvents: "none" }}>
                          {part.name}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={idx}
                        onClick={() => {
                          if (canClickAny && onArtistClick) {
                            setShowLyrics(false);
                            onArtistClick(part.name);
                          }
                        }}
                        onMouseEnter={e => {
                          if (canClickAny) {
                            e.currentTarget.style.color = '#ffffff';
                            e.currentTarget.style.textDecoration = 'underline';
                          }
                        }}
                        onMouseLeave={e => {
                          if (canClickAny) {
                            e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
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
              </p>
            </div>
          );
        })()}

        {/* Progress bar */}
        <div style={{width:"100%",display:"flex",flexDirection:"column",gap:"5px"}}>
          <div className="slider-track" style={{position:"relative",width:"100%",height:"4px",borderRadius:"2px",cursor:"pointer",background:"rgba(255,255,255,0.18)"}}
            onMouseDown={e => {
              const track = e.currentTarget as HTMLElement;
              const update = (clientX: number) => {
                const rect = track.getBoundingClientRect();
                const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (trackDurationSeconds || 0);
                invoke('seek_audio', { time: t }).catch(() => {});
              };
              update(e.clientX);
              const onMove = (ev: MouseEvent) => update(ev.clientX);
              const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}>
            <div style={{position:"absolute",top:0,left:0,height:"100%",borderRadius:"2px",pointerEvents:"none",width:`${pct}%`,background:"#ffffff",transition:"width 0.5s linear"}}>
              <div className="slider-thumb" style={{position:"absolute",right:"-5px",top:"50%",transform:"translateY(-50%)",width:"11px",height:"11px",background:"#fff",borderRadius:"50%",opacity:0,pointerEvents:"none",transition:"opacity .12s"}}/>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",fontVariantNumeric:"tabular-nums",color:"rgba(255,255,255,0.35)"}}>
            <span>{formatTime(progressSeconds)}</span>
            <span>-{formatTime(Math.max(0, remaining))}</span>
          </div>
        </div>

        {/* Playback controls */}
        <div style={{display:"flex",alignItems:"center",gap:"20px"}}>
          <button onClick={toggleShuffle} title="Shuffle"
            style={{position:"relative",color:shuffle?"#ffffff":"rgba(255,255,255,0.35)",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",padding:"3px",transition:"color .12s"}}
            onMouseEnter={e=>e.currentTarget.style.color="#ffffff"} onMouseLeave={e=>e.currentTarget.style.color=shuffle?"#ffffff":"rgba(255,255,255,0.35)"}>
            <Shuffle size={16}/>
            {shuffle && (
              <div style={{
                position: "absolute",
                bottom: "-2px",
                width: "3px",
                height: "3px",
                borderRadius: "50%",
                background: "#ffffff"
              }} />
            )}
          </button>
          <button onClick={handleSkipBack} style={{color:"rgba(255,255,255,0.6)",background:"none",border:"none",cursor:"pointer",display:"flex",transition:"color .12s"}}
            onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.6)"}>
            <SkipBack size={20} fill="currentColor"/>
          </button>
          <button onClick={togglePlayPause}
            style={{width:"44px",height:"44px",borderRadius:"50%",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",border:"none",cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.5)",transition:"transform .1s"}}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.06)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
            {isLoadingTrack
              ? <svg width="20" height="20" viewBox="0 0 24 24" style={{animation:"spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite"}}>
                  <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="2.5"/>
                  <circle cx="12" cy="12" r="8.5" fill="none" stroke="#000" strokeWidth="2.5" strokeDasharray="53.4" strokeDashoffset="36" strokeLinecap="round"/>
                </svg>
              : isPlaying ? <Pause fill="#000" stroke="#000" size={18}/> : <Play fill="#000" stroke="#000" size={18} style={{marginLeft:"2px"}}/>}
          </button>
          <button onClick={handleSkipForward} style={{color:"rgba(255,255,255,0.6)",background:"none",border:"none",cursor:"pointer",display:"flex",transition:"color .12s"}}
            onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.6)"}>
            <SkipForward size={20} fill="currentColor"/>
          </button>
          <button
            onClick={cycleRepeat}
            title={`Repeat: ${repeatMode === 'off' ? 'Off' : repeatMode === 'one' ? 'Repeat One' : 'Repeat All'}`}
            style={{
              position: "relative",
              color: repeatMode !== 'off' ? "#ffffff" : "rgba(255,255,255,0.45)",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              transition: "all .12s ease"
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#ffffff"}
            onMouseLeave={e => e.currentTarget.style.color = repeatMode !== 'off' ? "#ffffff" : "rgba(255,255,255,0.45)"}
          >
            {repeatMode === 'one' ? <Repeat1 size={17}/> : <Repeat size={17}/>}
            {repeatMode !== 'off' && (
              <div style={{
                position: "absolute",
                bottom: "0px",
                width: "3px",
                height: "3px",
                borderRadius: "50%",
                background: "#ffffff"
              }} />
            )}
          </button>
        </div>

        {/* Volume slider */}
        <div style={{width:"100%",display:"flex",alignItems:"center",gap:"8px"}}>
          <button onClick={toggleMute} title={volume===0?"Unmute":"Mute"}
            style={{background:"none",border:"none",cursor:"pointer",flexShrink:0,padding:"2px",color:volume===0?"#e05555":"rgba(255,255,255,0.45)",display:"flex",transition:"all .12s ease"}}
            onMouseEnter={e=>e.currentTarget.style.color=volume===0?"#ff7070":"rgba(255,255,255,0.8)"}
            onMouseLeave={e=>e.currentTarget.style.color=volume===0?"#e05555":"rgba(255,255,255,0.45)"}>
            {volume===0 ? <VolumeX size={14}/> : <Volume2 size={14}/>}
          </button>
          <div style={{flex:1}}>
            <div className="slider-track" style={{position:"relative",width:"100%",height:"3px",borderRadius:"2px",cursor:"pointer",background:"rgba(255,255,255,0.18)"}}
              onMouseDown={e => {
                const track = e.currentTarget as HTMLElement;
                const update = (clientX: number) => {
                  const rect = track.getBoundingClientRect();
                  const v = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
                  setVolume(v);
                  invoke('set_volume', { volume: v }).catch(() => {});
                };
                update(e.clientX);
                const onMove = (ev: MouseEvent) => update(ev.clientX);
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}>
              <div style={{position:"absolute",top:0,left:0,height:"100%",borderRadius:"2px",pointerEvents:"none",width:`${volume}%`,background:volume>0?"#ffffff":"rgba(255,255,255,0.18)",transition:"none"}}>
                <div className="slider-thumb" style={{position:"absolute",right:"-5px",top:"50%",transform:"translateY(-50%)",width:"10px",height:"10px",background:"#fff",borderRadius:"50%",opacity:0,pointerEvents:"none",transition:"opacity .12s"}}/>
              </div>
            </div>
          </div>
          <button onClick={() => { setVolume(100); invoke('set_volume', { volume: 100 }).catch(() => {}); }} title="Max Volume"
            style={{background:"none",border:"none",cursor:"pointer",flexShrink:0,padding:"2px",color:"rgba(255,255,255,0.45)",display:"flex",transition:"color .12s"}}
            onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.45)"}>
            <Volume2 size={14}/>
          </button>
        </div>
      </div>

      {/* Lyrics panel */}
      <div style={{position:"relative",zIndex:10,flex:1,overflow:"hidden"}}>
        {lyricsLoading ? (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"16px",height:"100%"}}>
            <Loader2 size={26} style={{color:"#ffffff",animation:"spin 1s linear infinite"}}/>
            <p style={{fontSize:"13.5px",color:"rgba(255,255,255,0.5)",fontWeight:500}}>Fetching lyrics...</p>
          </div>
        ) : lines.length > 0 ? (
          <div style={{position:"relative",height:"100%"}}>
            <div style={{height:"100%",overflowY:"auto",padding:"calc(50vh - 40px) 44px",scrollbarWidth:"none",boxSizing:"border-box"}}
              ref={lyricsScrollContainerRef}>
              {lines.map((line: { time: number; text: string }, idx: number) => {
                const isCurrent = idx === currentIdx;
                const isPast = idx < currentIdx;
                const distance = Math.abs(idx - currentIdx);
                const futureOpacity = distance <= 1 ? 0.45 : distance <= 2 ? 0.35 : distance <= 3 ? 0.25 : 0.18;
                const pastOpacity = distance <= 1 ? 0.3 : distance <= 2 ? 0.22 : 0.15;
                return (
                  <p key={idx}
                    data-active={isCurrent?'true':'false'}
                    onClick={async()=>{await invoke('seek_audio',{time:line.time}).catch(()=>{});}}
                    onMouseEnter={e=>{if(!isCurrent)(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,0.85)';}}
                    onMouseLeave={e=>{if(!isCurrent){(e.currentTarget as HTMLElement).style.color=isPast?`rgba(255,255,255,${pastOpacity})`:`rgba(255,255,255,${futureOpacity})`;}}}
                    style={{
                      cursor:"pointer",lineHeight:1.45,padding:"10px 0",userSelect:"none",margin:0,
                      fontSize: isCurrent ? 'clamp(1.35rem, 2.5vw, 1.75rem)' : 'clamp(1.15rem, 2vw, 1.45rem)',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      maxWidth: 'calc(100% - 48px)',
                      letterSpacing: '-0.01em',
                      fontWeight: isCurrent ? 800 : 600,
                      fontStyle: 'normal',
                      color: isCurrent ? '#ffffff' : isPast ? `rgba(255,255,255,${pastOpacity})` : `rgba(255,255,255,${futureOpacity})`,
                      transition: 'color 0.3s ease, font-size 0.3s ease, font-weight 0.3s ease',
                      textShadow: 'none',
                    }}>
                    {line.text || '\u00A0'}
                  </p>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"14px",height:"100%",color:"rgba(255,255,255,0.25)"}}>
            <div style={{width:"56px",height:"56px",borderRadius:"50%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Mic2 size={24} strokeWidth={1.5} style={{color:"rgba(255,255,255,0.3)"}}/>
            </div>
            <div style={{textAlign:"center"}}>
              <p style={{fontSize:"15px",fontWeight:600,color:"rgba(255,255,255,0.5)",margin:0}}>No lyrics found</p>
              <p style={{fontSize:"12.5px",color:"rgba(255,255,255,0.2)",margin:"4px 0 0"}}>Try Genius or AZLyrics</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
