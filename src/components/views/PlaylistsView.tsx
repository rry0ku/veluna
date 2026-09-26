import React, { useRef, useState, useMemo } from 'react';
import {
  Check,
  CheckCircle,
  FileOutput,
  Heart,
  ImagePlus,
  LayoutGrid,
  List,
  ListMusic,
  Music,
  Pencil,
  Play,
  PlusCircle,
  Search,
  Trash2,
  X,
  ArrowUpDown,
  Layers,
} from 'lucide-react';
import { Track, Playlist, CtxMenu } from '../../types';
import { getTrackGradient, saveLS, cleanArtist, parseDurationToSeconds, findDuplicateTracks, getTrackCoverUrl, handleThumbnailError } from '../../utils';
import { TrackRow } from '../TrackRow';
import { ThemedSelect } from '../ThemedSelect';
import { BatchActionBar } from '../BatchActionBar';
import { VirtualTrackList } from '../VirtualTrackList';
import { useMultiSelect } from '../../hooks/useMultiSelect';

interface PlaylistsViewProps {
  openPlaylistId: string | null;
  setOpenPlaylistId: (id: string | null) => void;
  playlists: Playlist[];
  setPlaylists: React.Dispatch<React.SetStateAction<Playlist[]>>;
  getPlaylistCover?: (p: Playlist) => string | null;
  handlePlaylistCoverUpload?: (pid: string) => void;
  handleCoverUpload?: (pid: string) => void;
  removePlaylistCover?: (pid: string) => void;
  playAll?: (list: Track[]) => void;
  setRenamingPlaylist: (p: Playlist | null) => void;
  setRenameVal: (name: string) => void;
  setRenameDescVal: (desc: string) => void;
  deletePlaylist?: (id: string) => void;
  setPlaylistDeleteModal?: (modal: { ids: string[]; names: string[] } | null) => void;
  playlistSearchQ: string;
  setPlaylistSearchQ: (q: string) => void;
  removeFromPlaylist?: (pid: string, url: string) => void;
  currentTrack: Track | null;
  hoveredTrackUrl?: string | null;
  setHoveredTrackUrl?: (url: string | null) => void;
  loadingTrackUrl: string | null;
  isLoadingTrack: boolean;
  isPlaying: boolean;
  isTrackLiked: (url: string) => boolean;
  downloadingTracks: Record<string, number>;
  handlePlayTrack?: (track: Track) => Promise<void>;
  handlePlayInContext: (track: Track, list: Track[]) => void | Promise<void>;
  prefetchOnHover?: (url: string) => void;
  toggleLikeTrack: (track: Track) => void;
  handleDownload: (track: Track) => void;
  openCtx: (e: React.MouseEvent, menu: Omit<CtxMenu, 'x' | 'y'>) => void;
  isPlaylistMultiSelect: boolean;
  setIsPlaylistMultiSelect: (v: boolean) => void;
  selectedPlaylistIds: string[];
  setSelectedPlaylistIds: React.Dispatch<React.SetStateAction<string[]>>;
  requestDeleteSelectedPlaylists?: () => void;
  playlistViewMode: 'grid' | 'list';
  setPlaylistViewMode: (mode: 'grid' | 'list') => void;
  setIsPlaylistModalOpen: (open: boolean) => void;
  setNewPlaylistName?: (name: string) => void;
  setNewPlaylistDesc?: (desc: string) => void;
  setShowDuplicatesPlaylist?: (p: Playlist | null) => void;
  setBulkEditPlaylist?: (p: Playlist | null) => void;
  movePlaylistTrack?: (from: number, to: number) => void;
  movePlaylist?: (from: number, to: number) => void;
  dragPlaylistCardIdx?: React.MutableRefObject<number | null>;
  dragOverPlaylistCardIdx?: number | null;
  setDragOverPlaylistCardIdx?: (idx: number | null) => void;
  dragOverPlaylistCardIdxRef?: React.MutableRefObject<number | null>;
  dragPlaylistCardIdxState?: number | null;
  setDragPlaylistCardIdxState?: (idx: number | null) => void;
  listenSecs?: Record<string, number>;
  playCounts?: Record<string, number>;
  playHistory?: Track[];
  setPlayHistory?: React.Dispatch<React.SetStateAction<Track[]>>;
  setShowCsvImportModal: (show: boolean) => void;
  setShowYtImportModal: (show: boolean) => void;
  handleImportPlaylistM3u: () => void;
  showToast: (msg: string) => void;
  addToQueue?: (tracks: Track | Track[]) => void;
  onArtistClick?: (artistName: string) => void;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = React.memo(({
  openPlaylistId,
  setOpenPlaylistId,
  playlists,
  setPlaylists,
  getPlaylistCover: customGetPlaylistCover,
  handlePlaylistCoverUpload,
  handleCoverUpload: customHandleCoverUpload,
  removePlaylistCover: _removePlaylistCover,
  playAll: customPlayAll,
  setRenamingPlaylist,
  setRenameVal,
  setRenameDescVal,
  deletePlaylist: customDeletePlaylist,
  setPlaylistDeleteModal,
  playlistSearchQ,
  setPlaylistSearchQ,
  removeFromPlaylist: customRemoveFromPlaylist,
  currentTrack,
  hoveredTrackUrl: customHoveredTrackUrl,
  setHoveredTrackUrl: customSetHoveredTrackUrl,
  loadingTrackUrl,
  isLoadingTrack,
  isPlaying,
  isTrackLiked,
  downloadingTracks,
  handlePlayTrack: _handlePlayTrack,
  handlePlayInContext,
  prefetchOnHover: customPrefetchOnHover,
  toggleLikeTrack,
  handleDownload,
  openCtx,
  isPlaylistMultiSelect,
  setIsPlaylistMultiSelect,
  selectedPlaylistIds,
  setSelectedPlaylistIds,
  requestDeleteSelectedPlaylists: customRequestDelete,
  playlistViewMode,
  setPlaylistViewMode,
  setIsPlaylistModalOpen,
  setNewPlaylistName,
  setNewPlaylistDesc,
  setShowDuplicatesPlaylist: _setShowDuplicatesPlaylist,
  setBulkEditPlaylist: _setBulkEditPlaylist,
  movePlaylistTrack: _movePlaylistTrack,
  movePlaylist: _movePlaylist,
  dragPlaylistCardIdx: _dragPlaylistCardIdx,
  dragOverPlaylistCardIdx: _dragOverPlaylistCardIdx,
  setDragOverPlaylistCardIdx: _setDragOverPlaylistCardIdx,
  dragOverPlaylistCardIdxRef: _dragOverPlaylistCardIdxRef,
  dragPlaylistCardIdxState: _dragPlaylistCardIdxState,
  setDragPlaylistCardIdxState: _setDragPlaylistCardIdxState,
  listenSecs = {},
  playCounts = {},
  playHistory = [],
  setPlayHistory,
  setShowCsvImportModal,
  setShowYtImportModal,
  handleImportPlaylistM3u,
  showToast,
  addToQueue,
  onArtistClick,
}) => {
  const [internalHoveredTrackUrl, setInternalHoveredTrackUrl] = useState<string | null>(null);
  const [playlistSortBy, setPlaylistSortBy] = useState<'default' | 'title_asc' | 'title_desc' | 'artist_asc' | 'duration_asc' | 'duration_desc'>('default');
  const hoveredTrackUrl = customHoveredTrackUrl !== undefined ? customHoveredTrackUrl : internalHoveredTrackUrl;
  const setHoveredTrackUrl = customSetHoveredTrackUrl || setInternalHoveredTrackUrl;
  const prefetchOnHover = customPrefetchOnHover || (() => {});

  const {
    selectedUrls: selectedTrackUrls,
    isMultiSelectActive: isTrackMultiSelectActive,
    toggleSelect: toggleTrackSelect,
    clearSelection: clearTrackSelection,
  } = useMultiSelect();

  React.useEffect(() => {
    clearTrackSelection();
  }, [openPlaylistId, clearTrackSelection]);

  const getPlaylistCover = customGetPlaylistCover || ((playlist: Playlist) => {
    if (playlist.id === 'p1') return null;
    if (playlist.customCover) return playlist.customCover;
    const firstWithCover = playlist.tracks.find(t => getTrackCoverUrl(t));
    return firstWithCover ? getTrackCoverUrl(firstWithCover) : null;
  });

  const playAll = customPlayAll || ((list: Track[]) => {
    if (list.length > 0) handlePlayInContext(list[0], list);
  });

  const deletePlaylist = customDeletePlaylist || ((id: string) => {
    const pl = playlists.find(p => p.id === id);
    if (!pl || id === 'p1') return;
    if (setPlaylistDeleteModal) {
      setPlaylistDeleteModal({ ids: [id], names: [pl.name] });
    }
  });

  const removeFromPlaylist = customRemoveFromPlaylist || ((pid: string, url: string) => {
    setPlaylists(prev => prev.map(p => {
      if (p.id !== pid) return p;
      return { ...p, tracks: p.tracks.filter(t => t.url !== url) };
    }));
    showToast('Removed from playlist');
  });

  const requestDeleteSelectedPlaylists = customRequestDelete || (() => {
    const validIds = selectedPlaylistIds.filter(id => id !== 'p1');
    if (validIds.length === 0) return;
    const names = validIds.map(id => playlists.find(p => p.id === id)?.name || 'Playlist');
    if (setPlaylistDeleteModal) {
      setPlaylistDeleteModal({ ids: validIds, names });
    }
  });

  const handleCoverUpload = customHandleCoverUpload || ((pid: string) => {
    if (handlePlaylistCoverUpload) handlePlaylistCoverUpload(pid);
  });
  const dragPlaylistIdx = useRef<number | null>(null);
  const dragOverPlaylistIdxRef = useRef<number | null>(null);
  const [dragOverPlaylistIdx, setDragOverPlaylistIdx] = useState<number | null>(null);

  const dragPlaylistCardIdx = useRef<number | null>(null);
  const dragOverPlaylistCardIdxRef = useRef<number | null>(null);
  const [dragOverPlaylistCardIdx, setDragOverPlaylistCardIdx] = useState<number | null>(null);
  const [dragPlaylistCardIdxState, setDragPlaylistCardIdxState] = useState<number | null>(null);

  const openPlaylist = playlists.find(p => p.id === openPlaylistId) || null;

  const filteredTracks = useMemo(() => {
    if (!openPlaylist) return [];
    const q = playlistSearchQ.trim().toLowerCase();
    let list = q
      ? openPlaylist.tracks.filter(t => {
          const title = (t.title || '').toLowerCase();
          const artist = (t.artist || '').toLowerCase();
          return title.includes(q) || artist.includes(q);
        })
      : [...openPlaylist.tracks];

    if (playlistSortBy === 'title_asc') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (playlistSortBy === 'title_desc') {
      list.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    } else if (playlistSortBy === 'artist_asc') {
      list.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    } else if (playlistSortBy === 'duration_asc') {
      list.sort((a, b) => parseDurationToSeconds(a.duration) - parseDurationToSeconds(b.duration));
    } else if (playlistSortBy === 'duration_desc') {
      list.sort((a, b) => parseDurationToSeconds(b.duration) - parseDurationToSeconds(a.duration));
    }
    return list;
  }, [openPlaylist?.tracks, playlistSearchQ, playlistSortBy]);

  return (
    <>
      {openPlaylist ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar" style={{padding:"24px 30px 140px",zIndex:10,position:"relative"}}>
          {getPlaylistCover(openPlaylist) ? (
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "360px",
              overflow: "hidden",
              pointerEvents: "none",
              zIndex: 0
            }}>
              <div style={{
                position: "absolute",
                inset: "-25px",
                backgroundImage: `url(${getPlaylistCover(openPlaylist)})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(50px) brightness(0.35) saturate(1.3)",
                transform: "scale(1.1)",
                opacity: 0.8
              }} />
              <div style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(12,11,11,0.3) 0%, rgba(12,11,11,0.92) 80%, var(--v-bg0) 100%)"
              }} />
            </div>
          ) : (
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "360px",
              background: openPlaylist.id === "p1"
                ? "linear-gradient(180deg, rgba(224,85,85,0.08) 0%, rgba(0,0,0,0) 100%)"
                : "linear-gradient(180deg, rgba(226,221,217,0.05) 0%, rgba(0,0,0,0) 100%)",
              pointerEvents: "none",
              zIndex: 0
            }} />
          )}

          <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"flex-end",gap:"24px",marginBottom:"28px"}}>
            <div style={{
              width:"140px",
              height:"140px",
              borderRadius:"16px",
              background:openPlaylist.id==="p1"?"linear-gradient(135deg,rgba(140,30,30,0.4) 0%,rgba(140,30,30,0.1) 100%)":"var(--v-bg3)",
              border:"1px solid var(--v-bdr3)",
              boxShadow:"0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02)",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              flexShrink:0,
              position:"relative",
              overflow:"hidden",
              cursor:openPlaylist.id!=="p1"?"pointer":"default",
              transition:"transform 0.3s cubic-bezier(0.2,0,0,1)"
            }}
              onClick={()=>openPlaylist.id!=='p1'&&handleCoverUpload(openPlaylist.id)}
              onMouseEnter={e=>{
                if(openPlaylist.id!=='p1') {
                  e.currentTarget.style.transform="scale(1.03)";
                  const ov=e.currentTarget.querySelector('.pl-cover-ov') as HTMLElement;
                  if(ov)ov.style.opacity='1';
                }
              }}
              onMouseLeave={e=>{
                if(openPlaylist.id!=='p1') {
                  e.currentTarget.style.transform="scale(1)";
                  const ov=e.currentTarget.querySelector('.pl-cover-ov') as HTMLElement;
                  if(ov)ov.style.opacity='0';
                }
              }}>
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:openPlaylist.id==='p1'?'linear-gradient(135deg,rgba(140,30,30,0.4) 0%,rgba(140,30,30,0.1) 100%)':'transparent'}}>
                {openPlaylist.id==='p1'?<Heart size={56} style={{color:'#e05555',fill:'rgba(224,85,85,0.25)'}}/>:<ListMusic size={56} style={{color:'var(--v-fg3)'}}/>}
              </div>
              {getPlaylistCover(openPlaylist) && (
                <img src={getPlaylistCover(openPlaylist)!} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.currentTarget.style.display='none';}} alt=""/>
              )}
              {openPlaylist.id !== 'p1' && <div className="pl-cover-ov" style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)",opacity:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"opacity .15s",zIndex:5}}><ImagePlus size={24} style={{color:"var(--v-fg)"}}/></div>}
            </div>
            <div style={{flex:1,minWidth:0,paddingBottom:"4px"}}>
              <span style={{
                fontSize:"10.5px",
                fontWeight:700,
                letterSpacing:".18em",
                textTransform:"uppercase",
                color:openPlaylist.id==='p1'?'#ff5e5e':'var(--v-fg2)',
                display:"block",
                marginBottom:"6px"
              }}>
                Playlist
              </span>
              <h2 style={{
                fontSize:"32px",
                fontWeight:900,
                color:"var(--v-fg)",
                overflow:"hidden",
                textOverflow:"ellipsis",
                whiteSpace:"nowrap",
                margin:0,
                letterSpacing:"-0.02em"
              }}>
                {openPlaylist.name}
              </h2>
              {openPlaylist.description && openPlaylist.description.trim() && (
                <p style={{
                  fontSize:"13px",
                  color:"var(--v-fg2)",
                  marginTop:"6px",
                  marginBottom:0,
                  lineHeight:"1.4",
                  maxWidth:"600px",
                  overflowWrap:"anywhere"
                }}>
                  {openPlaylist.description}
                </p>
              )}
              <div style={{
                display:"flex",
                alignItems:"center",
                gap:"6px",
                fontSize:"12px",
                color:"var(--v-fg3)",
                marginTop:"8px"
              }}>
                <span style={{fontWeight:600,color:"var(--v-fg2)"}}>{openPlaylist.tracks.length} {openPlaylist.tracks.length===1?'song':'songs'}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"10px",marginTop:"18px"}}>
                <button onClick={()=>playAll(openPlaylist.tracks)} disabled={!openPlaylist.tracks.length}
                  style={{
                    display:"flex",
                    alignItems:"center",
                    gap:"8px",
                    padding:"9px 20px",
                    background:"var(--v-accent)",
                    color:"var(--v-bg0)",
                    fontWeight:800,
                    borderRadius:"9999px",
                    border:"none",
                    cursor:"pointer",
                    fontSize:"13px",
                    opacity:openPlaylist.tracks.length?1:0.4,
                    boxShadow:"0 4px 15px rgba(0, 0, 0, 0.25)",
                    transition:"all 0.2s cubic-bezier(0.2,0,0,1)"
                  }}
                  onMouseEnter={e=>{
                    if(openPlaylist.tracks.length){
                      e.currentTarget.style.transform="translateY(-1px)";
                      e.currentTarget.style.boxShadow="0 6px 20px rgba(0, 0, 0, 0.4)";
                    }
                  }}
                  onMouseLeave={e=>{
                    e.currentTarget.style.transform="translateY(0)";
                    e.currentTarget.style.boxShadow="0 4px 15px rgba(0, 0, 0, 0.25)";
                  }}>
                  <Play size={16} fill="currentColor"/> Play All
                </button>

                {(() => {
                  const duplicates = findDuplicateTracks(openPlaylist.tracks);
                  const dupes = duplicates.length;

                  if (dupes > 0) {
                    return (
                      <button
                        onClick={() => {
                          const dupeIndices = new Set(duplicates.map(d => d.originalIndex));
                          const cleanedTracks = openPlaylist.tracks.filter((_, idx) => !dupeIndices.has(idx));
                          setPlaylists(prev => prev.map(p => {
                            if (p.id !== openPlaylist.id) return p;
                            return { ...p, tracks: cleanedTracks };
                          }));
                          showToast(`Removed ${dupes} duplicate track${dupes > 1 ? 's' : ''}`);
                        }}
                        title={`Remove ${dupes} duplicate track${dupes > 1 ? 's' : ''}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "9px 16px",
                          color: "var(--v-accent)",
                          borderRadius: "9999px",
                          background: "var(--v-bg3)",
                          border: "1px solid var(--v-bdr3)",
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all .2s cubic-bezier(0.2,0,0,1)"
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = "var(--v-bg4)";
                          e.currentTarget.style.borderColor = "var(--v-accent)";
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = "var(--v-bg3)";
                          e.currentTarget.style.borderColor = "var(--v-bdr3)";
                          e.currentTarget.style.transform = "translateY(0)";
                        }}
                      >
                        <Layers size={14} /> Remove {dupes} Duplicate{dupes > 1 ? 's' : ''}
                      </button>
                    );
                  }
                  return null;
                })()}

                {openPlaylist.id !== 'p1' && (
                  <button onClick={()=>{setRenamingPlaylist(openPlaylist);setRenameVal(openPlaylist.name);setRenameDescVal(openPlaylist.description);}}
                    style={{
                      display:"flex",
                      alignItems:"center",
                      gap:"6px",
                      padding:"9px 16px",
                      color:"var(--v-fg)",
                      borderRadius:"9999px",
                      background:"var(--v-bg3)",
                      border:"1px solid var(--v-bdr3)",
                      fontSize:"13px",
                      fontWeight:600,
                      cursor:"pointer",
                      transition:"all .2s cubic-bezier(0.2,0,0,1)"
                    }}
                    onMouseEnter={e=>{
                      e.currentTarget.style.background="var(--v-bg4)";
                      e.currentTarget.style.borderColor="var(--v-bdr2)";
                      e.currentTarget.style.transform="translateY(-1px)";
                    }}
                    onMouseLeave={e=>{
                      e.currentTarget.style.background="var(--v-bg3)";
                      e.currentTarget.style.borderColor="var(--v-bdr3)";
                      e.currentTarget.style.transform="translateY(0)";
                    }}>
                    <Pencil size={14}/> Edit
                  </button>
                )}
                {openPlaylist.id !== 'p1' && (
                  <button onClick={()=>{deletePlaylist(openPlaylist.id);setOpenPlaylistId(null);}}
                    style={{
                      display:"flex",
                      alignItems:"center",
                      gap:"6px",
                      padding:"9px 16px",
                      color:"#ff7070",
                      borderRadius:"9999px",
                      background:"rgba(220,60,60,0.02)",
                      border:"1px solid rgba(220,60,60,0.08)",
                      fontSize:"13px",
                      fontWeight:600,
                      cursor:"pointer",
                      transition:"all .2s cubic-bezier(0.2,0,0,1)"
                    }}
                    onMouseEnter={e=>{
                      e.currentTarget.style.background="rgba(220, 60, 60, 0.15)";
                      e.currentTarget.style.borderColor="rgba(220, 60, 60, 0.3)";
                      e.currentTarget.style.transform="translateY(-1px)";
                    }}
                    onMouseLeave={e=>{
                      e.currentTarget.style.background="rgba(220,60,60,0.02)";
                      e.currentTarget.style.borderColor="rgba(220,60,60,0.08)";
                      e.currentTarget.style.transform="translateY(0)";
                    }}>
                    <Trash2 size={14}/> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
          {openPlaylist.tracks.length === 0
            ? <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"140px",color:"var(--v-fg3)",gap:"10px",position:"relative",zIndex:1}}><Music size={28} strokeWidth={1}/><p style={{fontSize:"13px",color:"var(--v-fg2)"}}>No tracks yet.</p></div>
            : (
                <>
                  <div style={{display:"flex",flexDirection:"column",gap:"4px",position:"relative",zIndex:1}}>
                    <div style={{
                      display:"flex",
                      alignItems:"center",
                      gap:"10px",
                      marginBottom:"14px",
                      flexWrap:"wrap"
                    }}>
                      <div style={{position:"relative",flex:1,minWidth:"200px"}}>
                        <Search size={14} style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",color:"var(--v-fg3)",pointerEvents:"none"}} />
                        <input
                          type="text"
                          value={playlistSearchQ}
                          onChange={e => setPlaylistSearchQ(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); }}
                          placeholder="Filter songs in playlist..."
                          style={{
                            width:"100%",
                            background:"var(--v-bg2)",
                            border:"1px solid var(--v-bdr2)",
                            borderRadius:"10px",
                            padding:"8px 34px",
                            fontSize:"12.5px",
                            color:"var(--v-fg)",
                            outline:"none",
                            boxSizing:"border-box",
                            transition:"all 0.2s cubic-bezier(0.2,0,0,1)"
                          }}
                          onFocus={e => {
                            e.currentTarget.style.background = "var(--v-bg3)";
                            e.currentTarget.style.borderColor = "var(--v-bdr3)";
                          }}
                          onBlur={e => {
                            e.currentTarget.style.background = "var(--v-bg2)";
                            e.currentTarget.style.borderColor = "var(--v-bdr2)";
                          }}
                        />
                        {playlistSearchQ && (
                          <button onClick={() => setPlaylistSearchQ('')} style={{position:"absolute",right:"10px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--v-fg3)",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      <ThemedSelect
                        value={playlistSortBy}
                        onChange={v => setPlaylistSortBy(v as any)}
                        icon={<ArrowUpDown size={13} style={{ color: "var(--v-accent)" }} />}
                        options={[
                          { value: 'default', label: 'Default Order' },
                          { value: 'title_asc', label: 'Title (A → Z)' },
                          { value: 'title_desc', label: 'Title (Z → A)' },
                          { value: 'artist_asc', label: 'Artist (A → Z)' },
                          { value: 'duration_asc', label: 'Duration (Shortest)' },
                          { value: 'duration_desc', label: 'Duration (Longest)' },
                        ]}
                      />
                    </div>
                    <div style={{
                      display:"flex",
                      alignItems:"center",
                      padding:"8px 12px",
                      color:"var(--v-fg3)",
                      fontSize:"11px",
                      fontWeight:700,
                      letterSpacing:"0.1em",
                      textTransform:"uppercase",
                      borderBottom:"1px solid var(--v-bdr2)",
                      marginBottom:"6px"
                    }}>
                      {!playlistSearchQ && <div style={{ width: "22px", flexShrink: 0 }} />}
                      <div style={{ width: "30px", flexShrink: 0, textAlign: "center" }}>#</div>
                      <div style={{ width: "50px", flexShrink: 0, marginLeft: "14px" }} />
                      <div style={{ flex: 1, minWidth: 0, paddingLeft: "14px" }}>Title</div>
                      <div style={{ width: "150px", textAlign: "right", paddingRight: "12px" }}>Duration</div>
                    </div>
                    {filteredTracks.length === 0 ? (
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"110px",color:"var(--v-fg3)",gap:"7px"}}>
                        <Search size={24} strokeWidth={1} />
                        <p style={{fontSize:"13px",color:"var(--v-fg2)"}}>No results for "{playlistSearchQ}"</p>
                      </div>
                    ) : (
                      <VirtualTrackList
                        items={filteredTracks}
                        itemHeight={56}
                        keyExtractor={(t, i) => `${t.url}_${i}`}
                        renderItem={(t, i) => {
                          const origIdx = openPlaylist.tracks.indexOf(t);
                          const enrichedTrack = { ...t, cover: getTrackCoverUrl(t) };
                          return (
                            <div
                              key={enrichedTrack.url + origIdx}
                              style={{position:"relative",display:"flex",alignItems:"center",gap:"3px",height:"56px",boxSizing:"border-box"}}
                              onMouseEnter={() => {
                                if (dragPlaylistIdx.current !== null) {
                                  dragOverPlaylistIdxRef.current = origIdx;
                                  setDragOverPlaylistIdx(origIdx);
                                }
                              }}
                            >
                              {dragOverPlaylistIdx === origIdx && dragPlaylistIdx.current !== null && dragPlaylistIdx.current !== origIdx && (
                                <div style={{position:"absolute",top:0,left:"32px",right:0,height:"2px",background:"var(--v-accent)",borderRadius:"1px",zIndex:10,pointerEvents:"none"}}/>
                              )}
                              {!playlistSearchQ && (
                                <div
                                  style={{padding:"4px 6px",cursor:"grab",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:0.2,transition:"opacity .12s"}}
                                  onMouseEnter={e=>(e.currentTarget.style.opacity="0.7")}
                                  onMouseLeave={e=>(e.currentTarget.style.opacity="0.2")}
                                  onMouseDown={e => {
                                    e.preventDefault();
                                    dragPlaylistIdx.current = origIdx;
                                    dragOverPlaylistIdxRef.current = origIdx;
                                    setDragOverPlaylistIdx(origIdx);
                                    const onUp = () => {
                                      const from = dragPlaylistIdx.current;
                                      const to = dragOverPlaylistIdxRef.current;
                                      dragPlaylistIdx.current = null;
                                      dragOverPlaylistIdxRef.current = null;
                                      setDragOverPlaylistIdx(null);
                                      window.removeEventListener('mouseup', onUp);
                                      if (from === null || to === null || from === to) return;
                                      setPlaylists(prev => prev.map(pl => {
                                        if (pl.id !== openPlaylist.id) return pl;
                                        const arr = [...pl.tracks];
                                        const [moved] = arr.splice(from, 1);
                                        arr.splice(to, 0, moved);
                                        return { ...pl, tracks: arr };
                                      }));
                                    };
                                    window.addEventListener('mouseup', onUp);
                                  }}
                                >
                                  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" style={{color:"var(--v-fg3)"}}>
                                    <circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/>
                                    <circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/>
                                    <circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/>
                                  </svg>
                                </div>
                              )}
                              <div style={{flex:1,minWidth:0}}>
                                <TrackRow
                                  track={enrichedTrack}
                                  index={i}
                                  showRemove
                                  onRemove={() => removeFromPlaylist(openPlaylist.id, enrichedTrack.url)}
                                  isActive={currentTrack?.url === enrichedTrack.url}
                                  isHovered={hoveredTrackUrl === enrichedTrack.url}
                                  isLoadingTrack={loadingTrackUrl === enrichedTrack.url || (currentTrack?.url === enrichedTrack.url && isLoadingTrack)}
                                  isPlaying={isPlaying}
                                  isLiked={isTrackLiked(enrichedTrack.url)}
                                  isDownloading={(downloadingTracks[enrichedTrack.url] ?? 0)}
                                  isSelected={selectedTrackUrls.has(enrichedTrack.url)}
                                  isMultiSelectActive={isTrackMultiSelectActive}
                                  onPlay={() => handlePlayInContext(enrichedTrack, openPlaylist.tracks)}
                                  onHoverEnter={() => { setHoveredTrackUrl(enrichedTrack.url); prefetchOnHover(enrichedTrack.url); }}
                                  onHoverLeave={() => setHoveredTrackUrl(null)}
                                  onLike={() => toggleLikeTrack(enrichedTrack)}
                                  onDownload={() => handleDownload(enrichedTrack)}
                                  onCtx={e => openCtx(e, { type: 'track', track: enrichedTrack })}
                                  onSelectToggle={e => toggleTrackSelect(enrichedTrack, i, e, openPlaylist.tracks)}
                                  onArtistClick={onArtistClick}
                                />
                              </div>
                            </div>
                          );
                        }}
                      />
                    )}
                  </div>
                  {isTrackMultiSelectActive && (
                    <BatchActionBar
                      selectedTracks={openPlaylist.tracks.filter(t => selectedTrackUrls.has(t.url))}
                      playlists={playlists}
                      isPlaylistView={true}
                      onClearSelection={clearTrackSelection}
                      onPlaySelected={() => {
                        const selected = openPlaylist.tracks.filter(t => selectedTrackUrls.has(t.url));
                        if (selected.length > 0) {
                          handlePlayInContext(selected[0], selected);
                        }
                        clearTrackSelection();
                      }}
                      onQueueSelected={() => {
                        const selected = openPlaylist.tracks.filter(t => selectedTrackUrls.has(t.url));
                        if (selected.length > 0 && addToQueue) {
                          addToQueue(selected);
                          showToast(`Added ${selected.length} track${selected.length > 1 ? 's' : ''} to queue`);
                        }
                        clearTrackSelection();
                      }}
                      onAddToPlaylist={(targetPlaylistId) => {
                        const selected = openPlaylist.tracks.filter(t => selectedTrackUrls.has(t.url) && !t.url.startsWith('local://'));
                        if (selected.length === 0) {
                          showToast('Offline tracks cannot be added to playlists');
                          clearTrackSelection();
                          return;
                        }
                        setPlaylists(prev => prev.map(p => {
                          if (p.id !== targetPlaylistId) return p;
                          const existingUrls = new Set(p.tracks.map(t => t.url));
                          const newTracks = selected.filter(t => !existingUrls.has(t.url));
                          return { ...p, tracks: [...p.tracks, ...newTracks] };
                        }));
                        showToast(`Added ${selected.length} tracks to playlist`);
                        clearTrackSelection();
                      }}
                      onDeleteSelected={() => {
                        const selected = new Set(selectedTrackUrls);
                        setPlaylists(prev => prev.map(p => {
                          if (p.id !== openPlaylist.id) return p;
                          return { ...p, tracks: p.tracks.filter(t => !selected.has(t.url)) };
                        }));
                        showToast(`Removed ${selected.size} track${selected.size > 1 ? 's' : ''} from playlist`);
                        clearTrackSelection();
                      }}
                      onDownloadSelected={() => {
                        const selected = openPlaylist.tracks.filter(t => selectedTrackUrls.has(t.url));
                        selected.forEach(t => handleDownload(t));
                        showToast(`Queued ${selected.length} downloads`);
                        clearTrackSelection();
                      }}
                    />
                  )}
                </>
              )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar" style={{padding:"24px 30px 140px",zIndex:10}}>
          <div className="v-library-container">
            <div className="v-library-main">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'24px',flexWrap:'wrap',gap:'12px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                  <h2 style={{fontSize:'20px',fontWeight:800,color:'#e2ddd9',margin:0}}>Playlists</h2>
                  {isPlaylistMultiSelect && (
                    <span style={{
                      fontSize:'11.5px',
                      fontWeight:700,
                      color:'var(--v-accent)',
                      background:'rgba(255,255,255,0.04)',
                      border:'1px solid rgba(255,255,255,0.08)',
                      padding:'2px 10px',
                      borderRadius:'20px',
                      display:'flex',
                      alignItems:'center',
                      gap:'6px'
                    }}>
                      {selectedPlaylistIds.length} selected
                    </span>
                  )}
                </div>

                <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
                  {isPlaylistMultiSelect ? (
                    <>
                      <button
                        onClick={() => {
                          const deletable = playlists.filter(p => p.id !== 'p1').map(p => p.id);
                          if (selectedPlaylistIds.length === deletable.length) {
                            setSelectedPlaylistIds([]);
                          } else {
                            setSelectedPlaylistIds(deletable);
                          }
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '8px',
                          color: '#e2ddd9',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--v-accent)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                      >
                        {selectedPlaylistIds.length === playlists.filter(p => p.id !== 'p1').length ? 'Deselect All' : 'Select All'}
                      </button>

                      <button
                        onClick={requestDeleteSelectedPlaylists}
                        disabled={selectedPlaylistIds.length === 0}
                        style={{
                          background: selectedPlaylistIds.length > 0 ? 'var(--v-accent)' : 'rgba(255,255,255,0.03)',
                          color: selectedPlaylistIds.length > 0 ? '#0c0b0b' : '#5c5755',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: selectedPlaylistIds.length > 0 ? 'pointer' : 'not-allowed',
                          padding: '6px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          boxShadow: selectedPlaylistIds.length > 0 ? '0 4px 14px rgba(0,0,0,0.3)' : 'none',
                          transition: 'all 0.15s',
                          opacity: selectedPlaylistIds.length > 0 ? 1 : 0.4
                        }}
                        onMouseEnter={e => { if (selectedPlaylistIds.length > 0) e.currentTarget.style.transform = 'scale(1.03)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                      >
                        <Trash2 size={13} />
                        <span>Delete Selected ({selectedPlaylistIds.length})</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsPlaylistMultiSelect(false);
                          setSelectedPlaylistIds([]);
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '8px',
                          color: '#8a807c',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#e2ddd9'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#8a807c'; }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                        <span style={{fontSize:'11.5px',color:'#8a807c',fontWeight:500}}>Layout:</span>
                        <div style={{display:'flex',alignItems:'center',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.04)',borderRadius:'8px',padding:'2px'}}>
                          <button onClick={() => setPlaylistViewMode('grid')}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                            style={{
                              background: playlistViewMode === 'grid' ? 'rgba(255,255,255,0.06)' : 'transparent',
                              border: 'none', borderRadius: '6px', color: playlistViewMode === 'grid' ? '#fff' : '#8a807c',
                              cursor: 'pointer', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s',
                              fontSize: '11px', fontWeight: 600
                            }}>
                            <LayoutGrid size={13} />
                            <span>Grid</span>
                          </button>
                          <button onClick={() => setPlaylistViewMode('list')}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                            style={{
                              background: playlistViewMode === 'list' ? 'rgba(255,255,255,0.06)' : 'transparent',
                              border: 'none', borderRadius: '6px', color: playlistViewMode === 'list' ? '#fff' : '#8a807c',
                              cursor: 'pointer', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s',
                              fontSize: '11px', fontWeight: 600
                            }}>
                            <List size={13} />
                            <span>List</span>
                          </button>
                        </div>
                      </div>

                      {playlists.some(p => p.id !== 'p1') && (
                        <button
                          onClick={() => setIsPlaylistMultiSelect(true)}
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '8px',
                            color: '#e2ddd9',
                            cursor: 'pointer',
                            padding: '6px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--v-accent)'; e.currentTarget.style.color = 'var(--v-accent)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#e2ddd9'; }}
                        >
                          <CheckCircle size={13} />
                          <span>Select</span>
                        </button>
                      )}

                      <button onClick={() => { setNewPlaylistName?.(''); setNewPlaylistDesc?.(''); setIsPlaylistModalOpen(true); }}
                        className="v-new-playlist-btn">
                        <PlusCircle size={13} /> <span>New Playlist</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
              {playlistViewMode === 'grid' ? (
                <div style={{display:"grid",gap:"20px",gridTemplateColumns:"repeat(auto-fill, minmax(170px, 1fr))"}}>
                  {playlists.map((pl, plIdx) => {
                    const cover = getPlaylistCover(pl);
                    const isDragTarget = dragOverPlaylistCardIdx === plIdx && dragPlaylistCardIdx.current !== null && dragPlaylistCardIdx.current !== plIdx;
                    const isSelected = selectedPlaylistIds.includes(pl.id);
                    const toggleSelect = () => {
                      if (pl.id === 'p1') return;
                      setSelectedPlaylistIds(prev => prev.includes(pl.id) ? prev.filter(id => id !== pl.id) : [...prev, pl.id]);
                    };
                    return (
                      <div key={pl.id}
                        onMouseEnter={() => { if (dragPlaylistCardIdx.current !== null) { dragOverPlaylistCardIdxRef.current = plIdx; setDragOverPlaylistCardIdx(plIdx); } }}
                        className="v-pl-card"
                        style={{
                          animation: `fadeUp 0.2s cubic-bezier(0.2,0,0,1) ${plIdx * 30}ms both`,
                          position: 'relative',
                          border: isPlaylistMultiSelect && isSelected ? '1px solid var(--v-accent)' : undefined,
                          background: isPlaylistMultiSelect && isSelected ? 'rgba(255,255,255,0.04)' : undefined,
                        }}
                        onClick={() => {
                          if (isPlaylistMultiSelect) {
                            toggleSelect();
                          } else if (dragPlaylistCardIdx.current === null) {
                            setOpenPlaylistId(pl.id);
                          }
                        }}
                        onContextMenu={e => openCtx(e, { type: 'playlist', playlist: pl })}>
                        {isDragTarget && (
                          <div style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            width: "4px",
                            background: "var(--v-accent)",
                            borderRadius: "2px",
                            zIndex: 20,
                            pointerEvents: "none",
                            left: plIdx < (dragPlaylistCardIdx.current ?? 0) ? "-12px" : "auto",
                            right: plIdx > (dragPlaylistCardIdx.current ?? 0) ? "-12px" : "auto",
                          }} />
                        )}

                        {isPlaylistMultiSelect && pl.id !== 'p1' && (
                          <div
                            onClick={e => { e.stopPropagation(); toggleSelect(); }}
                            style={{
                              position: 'absolute',
                              top: '10px',
                              right: '10px',
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: isSelected ? 'var(--v-accent)' : 'rgba(0,0,0,0.65)',
                              border: isSelected ? 'none' : '1.5px solid rgba(255,255,255,0.3)',
                              color: '#0c0b0b',
                              cursor: 'pointer',
                              zIndex: 10,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {isSelected && <Check size={13} strokeWidth={3} />}
                          </div>
                        )}

                        <div
                          className="v-pl-card__cover-wrapper"
                          style={{
                            opacity: dragPlaylistCardIdxState === plIdx ? 0.45 : 1,
                            transform: dragPlaylistCardIdxState === plIdx ? "scale(0.94)" : "none",
                            transition: "opacity 0.2s, transform 0.2s"
                          }}
                          onMouseDown={e => {
                            if (isPlaylistMultiSelect) return;
                            e.preventDefault();
                            dragPlaylistCardIdx.current = plIdx;
                            dragOverPlaylistCardIdxRef.current = plIdx;
                            setDragOverPlaylistCardIdx(plIdx);
                            setDragPlaylistCardIdxState(plIdx);
                            const onUp = () => {
                              const from = dragPlaylistCardIdx.current;
                              const to = dragOverPlaylistCardIdxRef.current;
                              dragPlaylistCardIdx.current = null;
                              dragOverPlaylistCardIdxRef.current = null;
                              setDragOverPlaylistCardIdx(null);
                              setDragPlaylistCardIdxState(null);
                              window.removeEventListener('mouseup', onUp);
                              if (from === null || to === null || from === to) return;
                              setPlaylists(prev => {
                                const arr = [...prev];
                                const [moved] = arr.splice(from, 1);
                                arr.splice(to, 0, moved);
                                return arr;
                              });
                            };
                            window.addEventListener('mouseup', onUp);
                          }}>
                          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                            {pl.id==='p1'
                              ? <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,rgba(140,30,30,0.4) 0%,rgba(140,30,30,0.1) 100%)"}}><Heart size={22} style={{color:"#e05555",fill:"rgba(220,60,60,0.25)"}}/></div>
                              : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,rgba(255,255,255,0.03) 0%,rgba(255,255,255,0.01) 100%)"}}><ListMusic size={24} style={{color:"var(--v-fg3)"}}/></div>}
                          </div>
                          {cover && (
                            <img src={cover} style={{position: "absolute", inset: 0, width:"100%",height:"100%",objectFit:"cover"}} onError={e => { e.currentTarget.style.display = 'none'; }} alt=""/>
                          )}
                          {!isPlaylistMultiSelect && (
                            <div className="pl-hover-overlay" style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",opacity:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .25s ease",zIndex:5}}>
                              <button onClick={e=>{e.stopPropagation();playAll(pl.tracks);}}
                                style={{width:"42px",height:"42px",background:"var(--v-accent)",color:"#0c0b0b",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"none",cursor:"pointer",boxShadow:"0 6px 16px rgba(0,0,0,0.5)",transition:"all 0.15s cubic-bezier(0.2,0,0,1)"}}
                                onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.1)";e.currentTarget.style.boxShadow="0 8px 20px rgba(0,0,0,0.6)";}}
                                onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 6px 16px rgba(0,0,0,0.5)";}}>
                                <Play size={16} style={{fill:"currentColor",color:"currentColor",marginLeft:"2px"}}/>
                              </button>
                            </div>
                          )}
                        </div>
                        <div style={{fontSize:"14px",fontWeight:700,color:"#e2ddd9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.3}}>{pl.name}</div>
                        <div style={{fontSize:"11px",color:"#8a807c",marginTop:"4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {pl.description?pl.description:`${pl.tracks.length} track${pl.tracks.length!==1?'s':''}`}
                        </div>
                        {pl.id!=='p1' && !isPlaylistMultiSelect && (
                          <button onClick={e=>{e.stopPropagation();deletePlaylist(pl.id);}}
                            className="pl-card-del"
                            style={{position:"absolute",top:"10px",right:"10px",opacity:0,width:"26px",height:"26px",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.75)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"#8a807c",transition:"all .2s cubic-bezier(0.2,0,0,1)",zIndex:6}}
                            onMouseEnter={e=>{e.currentTarget.style.color="#ff6060";e.currentTarget.style.background="rgba(160,40,40,0.2)";e.currentTarget.style.borderColor="rgba(255,96,96,0.2)";e.currentTarget.style.transform="scale(1.05)";}}
                            onMouseLeave={e=>{e.currentTarget.style.color="#8a807c";e.currentTarget.style.background="rgba(0,0,0,0.6)";e.currentTarget.style.borderColor="rgba(255,255,255,0.06)";e.currentTarget.style.transform="scale(1)";}}>
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                  {playlists.map((pl, plIdx) => {
                    const cover = getPlaylistCover(pl);
                    const isDragTarget = dragOverPlaylistCardIdx === plIdx && dragPlaylistCardIdx.current !== null && dragPlaylistCardIdx.current !== plIdx;
                    const isSelected = selectedPlaylistIds.includes(pl.id);
                    const toggleSelect = () => {
                      if (pl.id === 'p1') return;
                      setSelectedPlaylistIds(prev => prev.includes(pl.id) ? prev.filter(id => id !== pl.id) : [...prev, pl.id]);
                    };
                    return (
                      <div key={pl.id}
                        onMouseEnter={e => {
                          if (dragPlaylistCardIdx.current !== null) {
                            dragOverPlaylistCardIdxRef.current = plIdx;
                            setDragOverPlaylistCardIdx(plIdx);
                          } else {
                            e.currentTarget.style.background = isPlaylistMultiSelect && isSelected ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.035)";
                            e.currentTarget.style.borderColor = isPlaylistMultiSelect && isSelected ? "var(--v-accent)" : "rgba(255,255,255,0.06)";
                          }
                        }}
                        className="v-pl-list-row"
                        onClick={() => {
                          if (isPlaylistMultiSelect) {
                            toggleSelect();
                          } else if (dragPlaylistCardIdx.current === null) {
                            setOpenPlaylistId(pl.id);
                          }
                        }}
                        onContextMenu={e => openCtx(e, { type: 'playlist', playlist: pl })}
                        style={{
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          gap: "14px",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          background: isPlaylistMultiSelect && isSelected ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)",
                          border: isPlaylistMultiSelect && isSelected ? "1px solid var(--v-accent)" : "1px solid rgba(255,255,255,0.03)",
                          cursor: isPlaylistMultiSelect ? "pointer" : "grab",
                          transition: "all 0.15s ease",
                          animation: `fadeUp 0.15s cubic-bezier(0.2,0,0,1) ${plIdx * 20}ms both`,
                          opacity: dragPlaylistCardIdxState === plIdx ? 0.45 : 1,
                          transform: dragPlaylistCardIdxState === plIdx ? "scale(0.98)" : "none",
                          userSelect: "none",
                          WebkitUserSelect: "none",
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = isPlaylistMultiSelect && isSelected ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)";
                          e.currentTarget.style.borderColor = isPlaylistMultiSelect && isSelected ? "var(--v-accent)" : "rgba(255,255,255,0.03)";
                        }}
                        onMouseDown={() => {
                          if (isPlaylistMultiSelect) return;
                          dragPlaylistCardIdx.current = plIdx;
                          dragOverPlaylistCardIdxRef.current = plIdx;
                          setDragOverPlaylistCardIdx(plIdx);
                          setDragPlaylistCardIdxState(plIdx);
                          const onUp = () => {
                            const from = dragPlaylistCardIdx.current;
                            const to = dragOverPlaylistCardIdxRef.current;
                            dragPlaylistCardIdx.current = null;
                            dragOverPlaylistCardIdxRef.current = null;
                            setDragOverPlaylistCardIdx(null);
                            setDragPlaylistCardIdxState(null);
                            window.removeEventListener('mouseup', onUp);
                            if (from === null || to === null || from === to) return;
                            setPlaylists(prev => {
                              const arr = [...prev];
                              const [moved] = arr.splice(from, 1);
                              arr.splice(to, 0, moved);
                              return arr;
                            });
                          };
                          window.addEventListener('mouseup', onUp);
                        }}
                      >
                        {isDragTarget && (
                          <div style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            height: "3px",
                            background: "var(--v-accent)",
                            borderRadius: "2px",
                            zIndex: 20,
                            pointerEvents: "none",
                            top: plIdx < (dragPlaylistCardIdx.current ?? 0) ? "-6px" : "auto",
                            bottom: plIdx > (dragPlaylistCardIdx.current ?? 0) ? "-6px" : "auto",
                          }} />
                        )}

                        {isPlaylistMultiSelect && pl.id !== 'p1' && (
                          <div
                            onClick={e => { e.stopPropagation(); toggleSelect(); }}
                            style={{
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: isSelected ? "var(--v-accent)" : "rgba(0,0,0,0.4)",
                              border: isSelected ? "none" : "1.5px solid rgba(255,255,255,0.25)",
                              color: "#0c0b0b",
                              cursor: "pointer",
                              flexShrink: 0,
                              transition: "all 0.15s ease"
                            }}
                          >
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                        )}

                        <div
                          style={{
                            width: "42px",
                            height: "42px",
                            borderRadius: "6px",
                            overflow: "hidden",
                            flexShrink: 0,
                            position: "relative",
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                            {pl.id==='p1'
                              ? <Heart size={14} style={{color:"#e05555",fill:"rgba(220,60,60,0.25)"}}/>
                              : <ListMusic size={16} style={{color:"var(--v-fg3)"}}/>}
                          </div>
                          {cover && (
                            <img src={cover} style={{position: "absolute", inset: 0, width:"100%",height:"100%",objectFit:"cover"}} onError={e => { e.currentTarget.style.display = 'none'; }} alt=""/>
                          )}
                        </div>
                        <div style={{flex: 1, minWidth: 0}}>
                          <div style={{fontSize:"13.5px",fontWeight:600,color:"#e2ddd9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pl.name}</div>
                          <div style={{fontSize:"11px",color:"#8a807c",marginTop:"2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {pl.description ? pl.description : `${pl.tracks.length} track${pl.tracks.length!==1?'s':''}`}
                          </div>
                        </div>
                        <div style={{fontSize:"11.5px",color:"#5c5755",marginRight:"8px",fontWeight:500}}>
                          {pl.tracks.length} track{pl.tracks.length!==1?'s':''}
                        </div>
                        {!isPlaylistMultiSelect && (
                          <div style={{display:"flex",alignItems:"center",gap:"8px"}} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
                            <button onClick={() => playAll(pl.tracks)}
                              style={{width:"28px",height:"28px",background:"rgba(255,255,255,0.03)",color:"#e2ddd9",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",transition:"all 0.15s"}}
                              onMouseEnter={e=>{e.currentTarget.style.background="var(--v-accent)";e.currentTarget.style.color="#0c0b0b";e.currentTarget.style.transform="scale(1.08)";}}
                              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.03)";e.currentTarget.style.color="#e2ddd9";e.currentTarget.style.transform="scale(1)";}}
                              title="Play playlist"
                            >
                              <Play size={10} style={{fill:"currentColor",marginLeft:"1px"}}/>
                            </button>
                            {pl.id!=='p1'&&(
                              <button onClick={() => deletePlaylist(pl.id)}
                                style={{width:"28px",height:"28px",background:"rgba(255,255,255,0.03)",color:"#8a807c",borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid rgba(255,255,255,0.05)",cursor:"pointer",transition:"all 0.15s"}}
                                onMouseEnter={e=>{e.currentTarget.style.color="#ff6060";e.currentTarget.style.background="rgba(160,40,40,0.15)";e.currentTarget.style.borderColor="rgba(255,96,96,0.15)";e.currentTarget.style.transform="scale(1.05)";}}
                                onMouseLeave={e=>{e.currentTarget.style.color="#8a807c";e.currentTarget.style.background="rgba(255,255,255,0.03)";e.currentTarget.style.borderColor="rgba(255,255,255,0.05)";e.currentTarget.style.transform="scale(1)";}}
                                title="Delete playlist"
                              >
                                <Trash2 size={11}/>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="v-library-sidebar">
              <div className="v-library-sidebar-card">
                <h3 style={{fontSize:"11px",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--v-fg2)",margin:"0 0 16px 0"}}>Library Insights</h3>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:"14px"}}>
                  <div className="v-library-stat-item">
                    <span className="v-library-stat-val">{playlists.length}</span>
                    <span className="v-library-stat-lbl">Playlists</span>
                  </div>
                  <div className="v-library-stat-item">
                    <span className="v-library-stat-val">{playlists.reduce((acc, p) => acc + p.tracks.length, 0)}</span>
                    <span className="v-library-stat-lbl">Total Songs</span>
                  </div>
                  <div className="v-library-stat-item">
                    <span className="v-library-stat-val">
                      {(() => {
                        const totalMins = Math.round(Object.values(listenSecs).reduce((s: number, n) => s + (n as number), 0) / 60);
                        return totalMins >= 60 ? `${(totalMins / 60).toFixed(1)}h` : `${totalMins}m`;
                      })()}
                    </span>
                    <span className="v-library-stat-lbl">Time Listened</span>
                  </div>
                  <div className="v-library-stat-item">
                    <span className="v-library-stat-val">
                      {Object.values(playCounts).reduce((s: number, n) => s + (n as number), 0)}
                    </span>
                    <span className="v-library-stat-lbl">Total Plays</span>
                  </div>
                </div>
              </div>
              <div className="v-library-sidebar-card" style={{display:"flex",flexDirection:"column",gap:"12px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <h3 style={{fontSize:"11px",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--v-fg2)",margin:0}}>Recently Played</h3>
                  {playHistory.length > 0 && (
                    <button onClick={() => { setPlayHistory?.([]); saveLS('vg_playHistory', []); }}
                      style={{background:"none",border:"none",color:"var(--v-fg3)",fontSize:"10px",fontWeight:600,cursor:"pointer",transition:"color .12s"}}
                      onMouseEnter={e=>e.currentTarget.style.color="var(--v-fg2)"}
                      onMouseLeave={e=>e.currentTarget.style.color="var(--v-fg3)"}>
                      Clear
                    </button>
                  )}
                </div>
                {playHistory.length === 0 ? (
                  <div style={{padding:"20px 0",textAlign:"center",color:"var(--v-fg3)",fontSize:"12px"}}>
                    No recent activity
                  </div>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                    {playHistory.slice(0, 4).map((track: Track, i: number) => (
                      <div key={track.url + i}
                        onClick={() => handlePlayInContext(track, playHistory.slice(0, 4))}
                        className="v-library-recent-row">
                        <div className="v-library-recent-art" style={{background: getTrackGradient(track.title, track.artist)}}>
                          {(() => {
                            const c = getTrackCoverUrl(track);
                            return c ? <img src={c} alt="" onError={handleThumbnailError} /> : <Music size={12} style={{color:"rgba(255,255,255,0.2)"}} />;
                          })()}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div className="v-library-recent-title">{track.title}</div>
                          <div className="v-library-recent-artist">{cleanArtist(track.artist)}</div>
                        </div>
                        <div className="v-library-recent-play">
                          <Play size={10} style={{fill:"currentColor"}} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="v-library-sidebar-card">
                <h3 style={{fontSize:"11px",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:"var(--v-fg2)",margin:"0 0 12px 0"}}>Import Tools</h3>
                <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                  <button onClick={() => setShowCsvImportModal(true)} className="v-library-import-btn">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#1DB954" style={{marginRight:"4px"}}><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                    Import from Spotify
                  </button>
                  <button onClick={() => setShowYtImportModal(true)} className="v-library-import-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" style={{marginRight:"4px",flexShrink:0}}><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#ff0000"/><polygon points="9.545,8.432 15.818,12 9.545,15.568" fill="#ffffff"/></svg>
                    Import from YouTube
                  </button>
                  <button onClick={() => handleImportPlaylistM3u?.()} className="v-library-import-btn">
                    <FileOutput size={12} style={{marginRight:"4px",color:"var(--v-fg3)"}} />
                    Import M3U Playlist
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
