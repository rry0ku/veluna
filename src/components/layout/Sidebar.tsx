import React, { useState, useRef, useEffect } from 'react';
import {
  Home,
  HardDrive,
  BarChart2,
  Settings,
  ListOrdered,
  Zap,
  ListMusic,
  ChevronRight,
  Plus,
  Heart,
  FileOutput,
  Mic2,
  History,
} from 'lucide-react';
import { Playlist, CtxMenu, SettingsTab } from '../../types';

interface SidebarProps {
  activeNav: string;
  setActiveNav?: (nav: any) => void;
  navigateTo?: (nav: string) => void;
  performanceMode: boolean;
  setSettingsTab?: (tab: SettingsTab) => void;
  isQueueOpen: boolean;
  setIsQueueOpen: React.Dispatch<React.SetStateAction<boolean>>;
  queueLength: number;
  queuePulseKey: number;
  playlists: Playlist[];
  openPlaylistId: string | null;
  setOpenPlaylistId: (id: string | null) => void;
  openCtx: (e: React.MouseEvent, menu: Omit<CtxMenu, 'x' | 'y'>) => void;
  getPlaylistCover?: (p: Playlist) => string | null;
  setIsPlaylistModalOpen: (open: boolean) => void;
  setNewPlaylistName?: (name: string) => void;
  setNewPlaylistDesc?: (desc: string) => void;
  setShowCsvImportModal: (open: boolean) => void;
  setShowYtImportModal: (open: boolean) => void;
  handleImportPlaylistM3u?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  activeNav,
  setActiveNav,
  navigateTo: customNavigateTo,
  performanceMode,
  setSettingsTab,
  isQueueOpen,
  setIsQueueOpen,
  queueLength,
  queuePulseKey,
  playlists,
  openPlaylistId,
  setOpenPlaylistId,
  openCtx,
  getPlaylistCover: customGetPlaylistCover,
  setIsPlaylistModalOpen,
  setNewPlaylistName,
  setNewPlaylistDesc,
  setShowCsvImportModal,
  setShowYtImportModal,
  handleImportPlaylistM3u,
}) => {
  const navigateTo = setActiveNav || customNavigateTo || (() => {});
  const getPlaylistCover = customGetPlaylistCover || ((p: Playlist) => p.id === 'p1' ? null : ((p as any).customCover || p.tracks.find(t => t.cover)?.cover || null));
  const [sidebarPlaylistsExpanded, setSidebarPlaylistsExpanded] = useState(true);
  const [isPlaylistMenuOpen, setIsPlaylistMenuOpen] = useState(false);
  const playlistMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaylistMenuOpen) return;
    const clickH = (e: MouseEvent) => {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node)) {
        setIsPlaylistMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', clickH);
    return () => document.removeEventListener('mousedown', clickH);
  }, [isPlaylistMenuOpen]);

  return (
    <div style={{width:"180px", flexShrink:0, display:"flex", flexDirection:"column", background:"var(--v-bg0)", borderRight:"none", padding:"16px 10px 96px 10px", zIndex:50, overflow:"visible", position:"relative"}}>
      {performanceMode && (
        <div
          onClick={() => { navigateTo('settings'); setSettingsTab?.('appearance'); }}
          title="Low-Spec Mode active: Click to view in Settings"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "6px 10px",
            marginBottom: "8px",
            marginLeft: "2px",
            marginRight: "2px",
            borderRadius: "6px",
            background: "#161616",
            border: "1px solid #333333",
            color: "var(--v-accent)",
            fontSize: "10.5px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer"
          }}
        >
          <Zap size={12} style={{ fill: "currentColor" }} />
          <span>Eco Mode</span>
        </div>
      )}

      {/* Nav items */}
      <nav style={{display:"flex",flexDirection:"column",gap:"2px",flexShrink:0,padding:"0 2px"}}>
        <button onClick={() => navigateTo('home')}
          className={`v-nav-btn${activeNav==='home'?' v-nav-btn--active':''}`}>
          <span className="v-nav-icon"><Home size={18} style={activeNav==='home'?{color:'#c8c4c0'}:{color:'#4a4644'}} /></span>
          <span>Home</span>
        </button>

        <button onClick={() => navigateTo('artists')}
          className={`v-nav-btn${activeNav==='artists'||activeNav==='artist'?' v-nav-btn--active':''}`}>
          <span className="v-nav-icon"><Mic2 size={18} style={(activeNav==='artists'||activeNav==='artist')?{color:'#c8c4c0'}:{color:'#4a4644'}} /></span>
          <span>Artists</span>
        </button>

        <button onClick={() => navigateTo('downloads')}
          className={`v-nav-btn${activeNav==='downloads'?' v-nav-btn--active':''}`}>
          <span className="v-nav-icon"><HardDrive size={18} style={activeNav==='downloads'?{color:'#c8c4c0'}:{color:'#4a4644'}} /></span>
          <span>Offline</span>
        </button>
        <button onClick={() => navigateTo('stats')}
          className={`v-nav-btn${activeNav==='stats'?' v-nav-btn--active':''}`}>
          <span className="v-nav-icon"><BarChart2 size={18} style={activeNav==='stats'?{color:'#c8c4c0'}:{color:'#4a4644'}} /></span>
          <span>Stats</span>
        </button>

        <button onClick={() => navigateTo('history')}
          className={`v-nav-btn${activeNav==='history'?' v-nav-btn--active':''}`}>
          <span className="v-nav-icon"><History size={18} style={activeNav==='history'?{color:'#c8c4c0'}:{color:'#4a4644'}} /></span>
          <span>History</span>
        </button>

        <button onClick={() => { navigateTo('settings'); setSettingsTab?.('playback'); }}
          className={`v-nav-btn${activeNav==='settings'?' v-nav-btn--active':''}`}>
          <span className="v-nav-icon"><Settings size={18} style={activeNav==='settings'?{color:'#c8c4c0'}:{color:'#4a4644'}} /></span>
          <span>Settings</span>
        </button>

        <button onClick={() => setIsQueueOpen(o => !o)}
          className={`v-nav-btn${isQueueOpen?' v-nav-btn--active':''}`}>
          <span className="v-nav-icon"><ListOrdered size={18} style={isQueueOpen?{color:'#c8c4c0'}:{color:'#4a4644'}} /></span>
          <span style={{flex:1}}>Queue</span>
          {queueLength > 0 && <span key={queuePulseKey} className="queue-badge-pulse v-badge" style={{marginLeft:"auto"}}>{queueLength}</span>}
        </button>
      </nav>

        {/* Playlists section */}
        <div style={{marginTop:"6px",display:"flex",flexDirection:"column",flex:"1 1 0%",minHeight:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"2px 4px 10px",flexShrink:0}}>
            <button onClick={() => { navigateTo('playlists'); setOpenPlaylistId(null); }}
              style={{display:'flex',alignItems:'center',gap:'8px',padding:'4px 6px',borderRadius:'6px',border:'none',background:'transparent',cursor:'pointer',textAlign:'left',color:(activeNav==='playlists'||activeNav==='library')?'var(--v-fg)':'var(--v-fg3)',fontSize:'10px',fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',transition:'color .15s ease'}}
              onMouseEnter={e=>{if(activeNav!=='playlists'&&activeNav!=='library')e.currentTarget.style.color='var(--v-fg2)';}}
              onMouseLeave={e=>{if(activeNav!=='playlists'&&activeNav!=='library')e.currentTarget.style.color='var(--v-fg3)';}}>
              <ListMusic size={15} style={{color:(activeNav==='playlists'||activeNav==='library')?'var(--v-accent)':'var(--v-fg3)'}}/>
              <span style={{fontWeight:700,letterSpacing:'0.08em'}}>Playlists</span>
            </button>
            <div ref={playlistMenuRef} style={{display:'flex',alignItems:'center',gap:'2px',position:'relative'}}>
              <button onClick={e => { e.stopPropagation(); setSidebarPlaylistsExpanded(o => !o); }}
                style={{padding:"5px",border:"none",background:"transparent",cursor:"pointer",color:"var(--v-fg3)",borderRadius:"6px",display:"flex",alignItems:"center",justifyContent:"center",transition:'color .15s ease,background .15s ease'}}
                title={sidebarPlaylistsExpanded ? "Collapse playlists" : "Expand playlists"}
                onMouseEnter={e=>{e.currentTarget.style.color='var(--v-fg)';e.currentTarget.style.background='var(--v-bdr)';}}
                onMouseLeave={e=>{e.currentTarget.style.color='var(--v-fg3)';e.currentTarget.style.background='transparent';}}>
                <ChevronRight size={14} style={{transition:"transform .2s ease",transform:sidebarPlaylistsExpanded?"rotate(90deg)":"none"}}/>
              </button>
              <button onClick={e => { e.stopPropagation(); setIsPlaylistMenuOpen(o => !o); }}
                style={{padding:"5px",border:"none",background:"transparent",cursor:"pointer",color:isPlaylistMenuOpen?"var(--v-fg)":"var(--v-fg3)",borderRadius:"6px",display:"flex",alignItems:"center",justifyContent:"center",transition:'color .15s ease,background .15s ease'}} title="Add / Import Playlist"
                onMouseEnter={e=>{e.currentTarget.style.color='var(--v-fg)';e.currentTarget.style.background='var(--v-bdr)';}}
                onMouseLeave={e=>{if(!isPlaylistMenuOpen)e.currentTarget.style.color='var(--v-fg3)';e.currentTarget.style.background='transparent';}}>
                <Plus size={15} />
              </button>

              {isPlaylistMenuOpen && (
                <div className="v-sidebar-playlist-menu">
                  <button
                    onClick={e => { e.stopPropagation(); setIsPlaylistMenuOpen(false); setNewPlaylistName?.(''); setNewPlaylistDesc?.(''); setIsPlaylistModalOpen(true); }}
                    className="v-sidebar-playlist-menu-item"
                  >
                    <Plus size={14} style={{color:'var(--v-fg2)',flexShrink:0}} />
                    <span>New Playlist</span>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setIsPlaylistMenuOpen(false); setShowCsvImportModal(true); }}
                    className="v-sidebar-playlist-menu-item"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#1DB954" style={{flexShrink:0}}>
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                    <span>From Spotify</span>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setIsPlaylistMenuOpen(false); setShowYtImportModal(true); }}
                    className="v-sidebar-playlist-menu-item"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" style={{flexShrink:0}}>
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#ff0000"/>
                      <polygon points="9.545,8.432 15.818,12 9.545,15.568" fill="#ffffff"/>
                    </svg>
                    <span>From YouTube</span>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setIsPlaylistMenuOpen(false); handleImportPlaylistM3u?.(); }}
                    className="v-sidebar-playlist-menu-item"
                  >
                    <FileOutput size={13} style={{color:'var(--v-fg2)',flexShrink:0}} />
                    <span>From M3U File</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          {sidebarPlaylistsExpanded && (
            <div style={{flex:"1 1 0%",overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:"var(--v-bdr2) transparent",padding:"0 2px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:"2px",paddingBottom:"8px"}}>
                {playlists.map(pl => {
                  const isOpen = openPlaylistId === pl.id && (activeNav === 'playlists' || activeNav === 'library');
                  const cover = getPlaylistCover(pl);
                  const isLiked = pl.id === 'p1';
                  return (
                    <button key={pl.id}
                      onClick={() => { setOpenPlaylistId(pl.id); navigateTo('playlists'); }}
                      onContextMenu={e => openCtx(e, { type: 'sidebar-playlist', playlist: pl })}
                      className={`v-pl-item${isOpen?' v-pl-item--active':''}`}>
                      <div className="v-pl-item__art" style={isLiked ? { background: 'linear-gradient(135deg, rgba(224, 85, 85, 0.25) 0%, rgba(140, 30, 80, 0.15) 100%)', borderColor: 'rgba(224, 85, 85, 0.2)' } : undefined}>
                        {cover ? <img src={cover} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                          : isLiked ? <Heart size={14} style={{color:'#e05555',fill:'rgba(224,85,85,0.3)'}}/>
                          : <ListMusic size={14} style={{color:isOpen?'var(--v-accent)':'#8a807c'}} />}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:'1px',flex:1,minWidth:0}}>
                        <span style={{fontSize:'12.5px',fontWeight:isOpen?700:500,color:isOpen?'#ffffff':isLiked?'#e2ddd9':'#a8a29e',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',transition:'color .15s ease'}}>{pl.name}</span>
                        <span style={{fontSize:'10px',color:isOpen?'rgba(255,255,255,0.6)':'#5c5755'}}>{pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
    </div>
  );
});
