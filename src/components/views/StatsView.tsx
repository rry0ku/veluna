import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BarChart2, Clock, ListMusic, Music, Play } from 'lucide-react';
import { Track, Playlist, NavView } from '../../types';
import { GENRES, matchGenreTrack } from '../../constants';
import { getTrackGradient, cleanArtist, saveLS, globalArtistAvatarCache, handleThumbnailError } from '../../utils';

interface StatsViewProps {
  listenSecs: Record<string, number>;
  setListenSecs: (v: Record<string, number>) => void;
  playCounts: Record<string, number>;
  setPlayCounts: (v: Record<string, number>) => void;
  dailyPlays: Record<string, number>;
  setDailyPlays: (v: Record<string, number>) => void;
  firstSeen: Record<string, string>;
  setFirstSeen: (v: Record<string, string>) => void;
  playHistory: Track[];
  setPlayHistory: React.Dispatch<React.SetStateAction<Track[]>>;
  listeningHistory: { url: string; playedAt: string; secs: number }[];
  setListeningHistory: React.Dispatch<React.SetStateAction<{ url: string; playedAt: string; secs: number }[]>>;
  statsTimeRange: 'all' | '7days';
  setStatsTimeRange: (r: 'all' | '7days') => void;
  quickPicks: Track[];
  playlists: Playlist[];
  handlePlayInContext: (track: Track, list: Track[]) => void | Promise<void>;
  setSearchQuery: (q: string) => void;
  searchMusic: (override?: string) => Promise<void>;
  setActiveNav: (nav: NavView) => void;
  artistThumbs: Record<string, string>;
  setConfirmModal: (modal: { message: string; onConfirm: () => void } | null) => void;
  showToast: (msg: string) => void;
  onArtistClick?: (artistName: string, avatarUrl?: string) => void;
}

function safeEventDate(raw?: string): Date {
  if (!raw) return new Date();
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    const ms = num < 1e11 ? num * 1000 : num;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? new Date() : d;
}

export const StatsView: React.FC<StatsViewProps> = React.memo(({
  listenSecs,
  setListenSecs,
  playCounts,
  setPlayCounts,
  dailyPlays,
  setDailyPlays,
  firstSeen: _firstSeen,
  setFirstSeen,
  playHistory,
  setPlayHistory,
  listeningHistory,
  setListeningHistory,
  statsTimeRange,
  setStatsTimeRange,
  quickPicks,
  playlists,
  handlePlayInContext,
  setSearchQuery,
  searchMusic,
  setActiveNav,
  artistThumbs,
  setConfirmModal,
  showToast,
  onArtistClick,
}) => {
  const totalSecs = Object.values(listenSecs).reduce((s: number, n) => s + (n as number), 0);
  const totalPlays = Object.values(playCounts).reduce((s: number, n) => s + (n as number), 0);

  const allKnownTracksMap = useMemo(() => {
    const map = new Map<string, Track>();
    [...quickPicks, ...playHistory, ...playlists.flatMap(p => p?.tracks || [])].forEach(t => {
      if (t && t.url) map.set(t.url, t);
    });
    return map;
  }, [quickPicks, playHistory, playlists]);

  let currentPlayCounts = playCounts;
  let currentTotalSecs = totalSecs;
  let currentTotalPlays = totalPlays;

  if (statsTimeRange !== 'all') {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 7);
    limitDate.setHours(0, 0, 0, 0);
    const limitMs = limitDate.getTime();

    const rangeCounts: Record<string, number> = {};
    let rangeTotalSecs = 0;
    let rangeTotalPlays = 0;

    listeningHistory.forEach(ev => {
      const evTime = safeEventDate(ev.playedAt).getTime();
      if (evTime >= limitMs) {
        rangeCounts[ev.url] = (rangeCounts[ev.url] || 0) + 1;
        rangeTotalSecs += ev.secs;
        rangeTotalPlays += 1;
      }
    });

    currentPlayCounts = rangeCounts;
    currentTotalSecs = rangeTotalSecs;
    currentTotalPlays = rangeTotalPlays;
  }

  const hrs = Math.floor(currentTotalSecs / 3600);
  const mins = Math.floor((currentTotalSecs % 3600) / 60);

  const topTracks: { track: Track; count: number }[] = Object.entries(currentPlayCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 5)
    .reduce((acc: { track: Track; count: number }[], [url, count]) => {
      let track = allKnownTracksMap.get(url);
      if (!track && url.startsWith('http')) {
        const ytId = url.match(/(?:[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1] || '';
        if (ytId) {
          track = {
            id: 0,
            title: 'YouTube Track',
            artist: 'YouTube',
            duration: '0:00',
            url,
            cover: `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`,
          };
        }
      }
      if (track) acc.push({ track, count: count as number });
      return acc;
    }, []);

  const artistCounts: Record<string, number> = {};
  Object.entries(currentPlayCounts).forEach(([url, count]) => {
    const artist = allKnownTracksMap.get(url)?.artist;
    if (artist && artist.trim()) {
      artistCounts[artist] = (artistCounts[artist] || 0) + (count as number);
    }
  });
  const topArtists: [string, number][] = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5);

  const [topArtistAvatars, setTopArtistAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    let isCancelled = false;
    const initial: Record<string, string> = {};
    const missing: string[] = [];

    topArtists.forEach(([artist]) => {
      const clean = cleanArtist(artist).trim();
      const cached = globalArtistAvatarCache.get(clean.toLowerCase()) || artistThumbs[clean] || artistThumbs[artist];
      if (cached) {
        initial[artist] = cached;
      } else {
        missing.push(clean);
      }
    });

    setTopArtistAvatars(initial);

    if (missing.length === 0) return;

    const fetchMissing = async () => {
      for (const name of missing) {
        if (isCancelled) break;
        try {
          const res = await invoke<string>('search_youtube_artists', { query: name });
          const lines = res.trim().split('\n').filter(Boolean);
          if (lines.length > 0) {
            const parts = lines[0].split('====');
            const avatar = parts[1]?.trim() || '';
            if (avatar.startsWith('http')) {
              globalArtistAvatarCache.set(name.toLowerCase(), avatar);
              if (!isCancelled) {
                setTopArtistAvatars(prev => ({ ...prev, [name]: avatar }));
              }
            }
          }
        } catch {}
      }
    };

    fetchMissing();
    return () => { isCancelled = true; };
  }, [topArtists, artistThumbs]);

  const topGenres = useMemo(() => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < GENRES.length; i++) { counts[GENRES[i].id] = 0; }
    allKnownTracksMap.forEach(track => {
      const playCount = currentPlayCounts[track.url] || 0;
      if (playCount > 0) {
        for (let i = 0; i < GENRES.length; i++) {
          const g = GENRES[i];
          if (matchGenreTrack(track, g)) {
            counts[g.id] += playCount;
          }
        }
      }
    });
    return GENRES
      .map(g => ({ label: g.label, score: counts[g.id] }))
      .filter(g => g.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [allKnownTracksMap, currentPlayCounts]);

  const chartDaysCount = statsTimeRange === '7days' ? 7 : 30;
  const now = new Date();
  const days = Array.from({ length: chartDaysCount }, (_, i) => {
    const d = new Date();
    d.setDate(now.getDate() - (chartDaysCount - 1 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      label: chartDaysCount === 7
        ? d.toLocaleDateString('en', { weekday: 'short' })
        : d.getDate().toString(),
      count: (dailyPlays[key] as number) || 0
    };
  });
  const maxDay = Math.max(...days.map(d => d.count), 1);

  const resetStats = () => {
    setConfirmModal({
      message: 'Reset all stats? This will clear play counts, listen time, history, and daily plays. Cannot be undone.',
      onConfirm: () => {
        setPlayCounts({}); saveLS('vg_playCounts', {});
        setListenSecs({}); saveLS('vg_listenSecs', {});
        setDailyPlays({}); saveLS('vg_dailyPlays', {});
        setFirstSeen({}); saveLS('vg_firstSeen', {});
        setPlayHistory([]); saveLS('vg_playHistory', []);
        setListeningHistory([]); saveLS('vg_listeningHistory', []);
        showToast('Stats reset');
      }
    });
  };

  const hourCounts = Array(24).fill(0);
  const targetHistory = statsTimeRange === 'all' ? listeningHistory : listeningHistory.filter(ev => {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 7);
    limitDate.setHours(0, 0, 0, 0);
    return safeEventDate(ev.playedAt).getTime() >= limitDate.getTime();
  });
  targetHistory.forEach(ev => {
    const hr = safeEventDate(ev.playedAt).getHours();
    hourCounts[hr]++;
  });
  const maxHour = hourCounts.reduce((maxIdx, val, idx, arr) => val > arr[maxIdx] ? idx : maxIdx, 0);
  let timeOfDay = 'Night';
  if (maxHour >= 5 && maxHour < 12) timeOfDay = 'Morning';
  else if (maxHour >= 12 && maxHour < 17) timeOfDay = 'Afternoon';
  else if (maxHour >= 17 && maxHour < 22) timeOfDay = 'Evening';

  const uniqueArtists = new Set(targetHistory.map(ev => allKnownTracksMap.get(ev.url)?.artist).filter(Boolean));
  const uniqueTracksCount = new Set(targetHistory.map(ev => ev.url)).size;
  const loyaltyIndex = targetHistory.length > 0 && uniqueTracksCount > 0 ? (targetHistory.length / uniqueTracksCount).toFixed(1) : '1.0';

  const hasAnyStats = totalPlays > 0 || totalSecs > 0 || Object.keys(dailyPlays).some(k => (dailyPlays[k] as number) > 0);
  if (!hasAnyStats) {
    return (
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"12px"}}>
        <BarChart2 size={36} style={{color:"var(--v-fg3)"}} strokeWidth={1}/>
        <p style={{fontSize:"12px",color:"var(--v-fg2)"}}>Play something to start tracking stats</p>
      </div>
    );
  }

  const icons = {
    'Time Listened': <Clock size={16} style={{color: 'var(--v-fg3)'}} />,
    'Tracks Played': <Play size={16} style={{color: 'var(--v-fg3)'}} />,
    'Unique Tracks': <ListMusic size={16} style={{color: 'var(--v-fg3)'}} />
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar" style={{padding:"24px 30px 140px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"18px"}}>
        <h1 style={{fontSize:"18px",fontWeight:800,color:"var(--v-fg)",margin:0}}>Stats</h1>
        <button onClick={resetStats}
          style={{fontSize:"11px",color:"var(--v-fg2)",cursor:"pointer",padding:"5px 10px",borderRadius:"7px",border:"1px solid var(--v-bdr2)",background:"transparent",transition:"color .12s,border-color .12s"}}
          onMouseEnter={e=>{e.currentTarget.style.color="#b05555";e.currentTarget.style.borderColor="rgba(180,40,40,0.3)"}}
          onMouseLeave={e=>{e.currentTarget.style.color="var(--v-fg2)";e.currentTarget.style.borderColor="var(--v-bdr2)"}}>
          Reset
        </button>
      </div>

      <div style={{display:"flex",gap:"8px",marginBottom:"20px"}}>
        {(['all', '7days'] as const).map(range => {
          const label = range === 'all' ? 'All Time' : 'Last 7 Days';
          const active = statsTimeRange === range;
          return (
            <button key={range} onClick={() => setStatsTimeRange(range)}
              style={{
                padding: "6px 12px",
                borderRadius: "7px",
                border: active ? "1px solid var(--v-bdr3)" : "1px solid transparent",
                background: active ? "var(--v-bg3)" : "transparent",
                color: active ? "var(--v-fg)" : "var(--v-fg3)",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all .12s"
              }}
              onMouseEnter={e => { if(!active) e.currentTarget.style.color = "var(--v-fg2)"; }}
              onMouseLeave={e => { if(!active) e.currentTarget.style.color = "var(--v-fg3)"; }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginBottom:'28px'}}>
        {([
          { label: 'Time Listened', value: hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`, sub: statsTimeRange === 'all' ? 'total' : 'in range' },
          { label: 'Tracks Played', value: currentTotalPlays.toLocaleString(), sub: statsTimeRange === 'all' ? 'total' : 'in range' },
          { label: 'Unique Tracks', value: Object.keys(currentPlayCounts).length.toLocaleString(), sub: statsTimeRange === 'all' ? 'total' : 'in range' },
        ] as { label: string; value: string; sub: string }[]).map(({ label, value, sub }) => (
          <div key={label} className="v-stat-card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div className="v-stat-card__label">{label}</div>
              {icons[label as keyof typeof icons]}
            </div>
            <div className="v-stat-card__value">{value}</div>
            <div className="v-stat-card__sub">{sub}</div>
          </div>
        ))}
      </div>

      <div style={{marginBottom:"20px"}}>
        <div className="v-section-head">
          <h2>{chartDaysCount === 7 ? 'Last 7 Days' : 'Last 30 Days'}</h2>
          <span style={{fontSize:"11px",color:"var(--v-fg3)",marginLeft:"auto"}}>{days.reduce((s,d)=>s+d.count,0)} plays</span>
        </div>
        <div style={{background:"rgba(255, 255, 255, 0.015)",border:"1px solid rgba(255, 255, 255, 0.03)",borderRadius:"16px",padding:"20px 20px 24px 20px",boxShadow:"0 4px 20px rgba(0, 0, 0, 0.15)"}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:chartDaysCount === 30 ? "4px" : "8px",height:"130px"}}>
            {days.map(({ label, count }, di) => {
              const isToday = di === days.length - 1;
              const barH = count === 0 ? 6 : Math.max(8, Math.round((count / maxDay) * 110));
              return (
                <div key={`${label}-${di}`}
                  style={{
                    flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",gap:"4px",height:"100%",
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => {
                    const tooltip = e.currentTarget.querySelector<HTMLElement>('.bar-tooltip');
                    if (tooltip) { tooltip.style.opacity = '1'; tooltip.style.transform = 'translateY(-4px)'; }
                    const bar = e.currentTarget.querySelector<HTMLElement>('.chart-bar');
                    if (bar) bar.style.filter = 'brightness(1.2)';
                  }}
                  onMouseLeave={e => {
                    const tooltip = e.currentTarget.querySelector<HTMLElement>('.bar-tooltip');
                    if (tooltip) { tooltip.style.opacity = '0'; tooltip.style.transform = 'none'; }
                    const bar = e.currentTarget.querySelector<HTMLElement>('.chart-bar');
                    if (bar) bar.style.filter = 'none';
                  }}
                >
                  <span className="bar-tooltip" style={{
                    position: 'absolute',
                    bottom: `${barH + 24}px`,
                    fontSize: "11px",
                    fontWeight: 700,
                    background: 'var(--v-bg3)',
                    border: '1px solid var(--v-bdr3)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: 'var(--v-fg)',
                    opacity: 0,
                    pointerEvents: 'none',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    zIndex: 10
                  }}>
                    {count} play{count !== 1 ? 's' : ''}
                  </span>
                  <div className="chart-bar" style={{
                      width:'100%',height:`${barH}px`,borderRadius:'6px 6px 0 0',
                      background:count===0?'rgba(255,255,255,0.02)':'var(--v-accent)',
                      opacity:count===0?0.4:isToday?1:0.25,
                      transition:'height .5s cubic-bezier(0.2,0,0,1), filter .15s ease, opacity .15s ease',
                    }} />
                  <span style={{fontSize:chartDaysCount === 30 ? "8.5px" : "10px",fontWeight:600,color:isToday?"var(--v-fg2)":"var(--v-fg3)"}}>{label}</span>
                  {isToday && chartDaysCount === 7 && <span style={{position:'absolute',bottom:'-14px',fontSize:'8px',color:'var(--v-accent)',opacity:0.5,fontWeight:700,whiteSpace:'nowrap'}}>TODAY</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"16px",marginBottom:"20px"}}>
        <div className="v-stat-card" style={{display:"flex",flexDirection:"column",gap:"4px"}}>
          <span className="v-stat-card__label">Favorite Time</span>
          <span className="v-stat-card__value" style={{fontSize:"18px", marginTop: "4px"}}>{timeOfDay}</span>
          <span className="v-stat-card__sub" style={{marginTop: "2px"}}>Peak listening hour: {maxHour}:00</span>
        </div>
        <div className="v-stat-card" style={{display:"flex",flexDirection:"column",gap:"4px"}}>
          <span className="v-stat-card__label">Unique Artists</span>
          <span className="v-stat-card__value" style={{fontSize:"18px", marginTop: "4px"}}>{uniqueArtists.size}</span>
          <span className="v-stat-card__sub" style={{marginTop: "2px"}}>{statsTimeRange === 'all' ? 'Explored in history' : 'Explored in range'}</span>
        </div>
        <div className="v-stat-card" style={{display:"flex",flexDirection:"column",gap:"4px"}}>
          <span className="v-stat-card__label">Loyalty Index</span>
          <span className="v-stat-card__value" style={{fontSize:"18px", marginTop: "4px"}}>{loyaltyIndex}×</span>
          <span className="v-stat-card__sub" style={{marginTop: "2px"}}>{statsTimeRange === 'all' ? 'Avg plays per track' : 'Avg plays per track in range'}</span>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:topGenres.length > 0 ? "1fr 1fr 1fr" : "1fr 1fr",gap:"16px"}}>
        {topTracks.length > 0 && (
          <div>
            <div className="v-section-head">
              <h2>Top Tracks</h2>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
              {topTracks.map(({ track, count }, i) => (
                <div key={track.url}
                  onClick={() => handlePlayInContext(track, topTracks.map(x => x.track))}
                  className="v-track">
                  <div className="v-track__num">{i+1}</div>
                  <div className="v-track__art" style={{
                    position: 'relative',
                    background: getTrackGradient(track.title, track.artist),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Music className="track-fallback-icon" size={16} style={{position: 'absolute', color: 'rgba(255,255,255,0.25)', display: track.cover ? 'none' : 'block'}} />
                    {track.cover && (
                      <img
                        src={track.cover}
                        alt=""
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          transform: typeof track.cover === 'string' && (track.cover.includes('ytimg.com') || track.cover.includes('googleusercontent.com')) ? 'scale(1.35)' : 'none'
                        }}
                        onError={handleThumbnailError}
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div className="v-track__info">
                    <div className="v-track__title">{track.title}</div>
                    <div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'3px'}}>
                      <div style={{flex:1,height:'2px',background:'var(--v-bg3)',borderRadius:'1px',overflow:'hidden'}}>
                        <div style={{height:'100%',background:'var(--v-accent)',borderRadius:'1px',width:`${(count/(topTracks[0]?.count||1))*100}%`}}/>
                      </div>
                      <span style={{fontSize:'10px',color:'var(--v-fg2)',fontVariantNumeric:'tabular-nums',flexShrink:0}}>{count}×</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {topArtists.length > 0 && (
          <div>
            <div className="v-section-head">
              <h2>Top Artists</h2>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
              {topArtists.map(([rawArtist, count], i) => {
                const artist = cleanArtist(rawArtist) || rawArtist;
                const thumb = topArtistAvatars[artist] || topArtistAvatars[rawArtist] || globalArtistAvatarCache.get(artist.toLowerCase()) || artistThumbs[artist] || artistThumbs[rawArtist];
                return (
                  <div
                    key={rawArtist}
                    className="v-track"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (onArtistClick) {
                        onArtistClick(artist, thumb);
                      } else {
                        setSearchQuery(artist);
                        searchMusic(artist);
                        setActiveNav('home');
                      }
                    }}
                  >
                    <div className="v-track__num">{i+1}</div>
                    <div style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "50%",
                      background: getTrackGradient(artist, 'artist'),
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      overflow: "hidden",
                      position: "relative",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)"
                    }}>
                      <Music size={14} style={{ position: 'absolute', color: 'rgba(255, 255, 255, 0.25)' }} />
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={artist}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            position: "absolute",
                            inset: 0,
                            borderRadius: "50%"
                          }}
                          onError={e => { e.currentTarget.style.display = 'none'; }}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "rgba(255, 255, 255, 0.7)" }}>
                          {artist.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="v-track__info">
                      <div className="v-track__title" style={{ transition: 'color 0.12s ease' }}>{artist}</div>
                      <div style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"3px"}}>
                        <div style={{flex:1,height:"2px",background:"var(--v-bg3)",borderRadius:"1px",overflow:"hidden"}}>
                          <div style={{height:"100%",background:"var(--v-accent)",borderRadius:"1px",width:`${(count/(topArtists[0]?.[1]||1))*100}%`}}/>
                        </div>
                        <span style={{fontSize:"10px",color:"var(--v-fg2)",fontVariantNumeric:"tabular-nums",flexShrink:0}}>{count}×</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {topGenres.length > 0 && (
          <div>
            <div className="v-section-head">
              <h2>Top Genres</h2>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
              {topGenres.map(({ label, score }, i) => (
                <div key={label} className="v-track" style={{cursor:"pointer"}}
                  onClick={() => { setSearchQuery(label); searchMusic(label); setActiveNav('home'); }}>
                  <div className="v-track__num">{i+1}</div>
                  <div className="v-track__info" style={{paddingLeft:"4px"}}>
                    <div className="v-track__title">{label}</div>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"3px"}}>
                      <div style={{flex:1,height:"2px",background:"var(--v-bg3)",borderRadius:"1px",overflow:"hidden"}}>
                        <div style={{height:"100%",background:"var(--v-accent)",borderRadius:"1px",width:`${(score/(topGenres[0]?.score||1))*100}%`}}/>
                      </div>
                      <span style={{fontSize:"10px",color:"var(--v-fg2)",fontVariantNumeric:"tabular-nums",flexShrink:0}}>{score} plays</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {playHistory.length > 0 && (
        <div style={{marginTop:"16px"}}>
          <div className="v-section-head">
            <h2>Recent Plays</h2>
            <button onClick={() => { setPlayHistory([]); saveLS('vg_playHistory', []); }}
              style={{marginLeft:"auto",fontSize:"11px",color:"var(--v-fg3)",background:"none",border:"none",cursor:"pointer",transition:"color .12s"}}
              onMouseEnter={e=>(e.currentTarget.style.color="var(--v-fg2)")}
              onMouseLeave={e=>(e.currentTarget.style.color="var(--v-fg3)")}>Clear</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
            {playHistory.slice(0, 8).map((track: Track, i: number) => (
              <div key={track.url + i}
                onClick={() => handlePlayInContext(track, playHistory.slice(0, 8))}
                className="v-track">
                <div className="v-track__art" style={{
                  position: 'relative',
                  background: getTrackGradient(track.title, track.artist),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Music className="track-fallback-icon" size={16} style={{position: 'absolute', color: 'rgba(255,255,255,0.25)', display: track.cover ? 'none' : 'block'}} />
                  {track.cover && (
                    <img
                      src={track.cover}
                      alt=""
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: typeof track.cover === 'string' && (track.cover.includes('ytimg.com') || track.cover.includes('googleusercontent.com')) ? 'scale(1.35)' : 'none'
                      }}
                      onError={handleThumbnailError}
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="v-track__info">
                  <div className="v-track__title">{track.title}</div>
                  {cleanArtist(track.artist) && <div className="v-track__artist">{cleanArtist(track.artist)}</div>}
                </div>
                <Play size={12} style={{color:'var(--v-accent)',flexShrink:0}}/>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
