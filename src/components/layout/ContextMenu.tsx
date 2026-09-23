import React, { useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  AlignLeft,
  BarChart2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileBadge2,
  FileCode2,
  FileOutput,
  FolderOpen,
  Gauge,
  Hash,
  Heart,
  Info,
  ListMusic,
  ListPlus,
  Music,
  Pencil,
  Play,
  PlaySquare,
  PlusCircle,
  Share2,
  Shuffle,
  Trash2,
  X,
  Youtube,
  ImagePlus,
} from 'lucide-react';
import { Track, LocalTrack, Playlist, CtxMenu, AudioInfo } from '../../types';
import { getTrackGradient, cleanArtist } from '../../utils';
import { CopyButton } from '../Modals';

interface ContextMenuProps {
  ctxMenu: CtxMenu | null;
  setCtxMenu: (ctx: CtxMenu | null) => void;
  playlists: Playlist[];
  setPlaylists: React.Dispatch<React.SetStateAction<Playlist[]>>;
  setQueue: React.Dispatch<React.SetStateAction<Track[]>>;
  playNext?: (track: Track) => void;
  addToQueue?: (tracks: Track | Track[], silent?: boolean) => void;
  handlePlayTrack: (track: Track, fromQueue?: boolean) => Promise<void>;
  handlePlayLocalTrack: (local: LocalTrack, localList?: LocalTrack[], localIndex?: number) => Promise<void>;
  handleDownload: (track: Track) => void;
  handleCancelDownload: (url: string) => void;
  handleDeleteLocalTrack: (track: LocalTrack) => void;
  handleOpenInFileManager: (path: string) => void;
  handleExportPlaylistM3u: (playlist: Playlist) => void;
  downloadingTracks: Record<string, number>;
  isTrackLiked: (url: string) => boolean;
  toggleLikeTrack: (track: Track) => void;
  setRenamingPlaylist: (playlist: Playlist | null) => void;
  setRenameVal: (name: string) => void;
  setRenameDescVal: (desc: string) => void;
  setPlaylistDeleteModal: (modal: { ids: string[]; names: string[] } | null) => void;
  setShowDuplicatesPlaylist?: (playlist: Playlist | null) => void;
  setBulkEditPlaylist?: (playlist: Playlist | null) => void;
  handlePlaylistCoverUpload?: (playlistId: string) => Promise<void> | void;
  setInfoModalTrack: (track: Track | null) => void;
  infoModalTrack: Track | null;
  addToPlaylistTrack: Track | null;
  setAddToPlaylistTrack: (track: Track | null) => void;
  setMetadataEditingTrack: (track: Track | null) => void;
  showToast: (msg: string) => void;
  currentTrack?: Track | null;
  audioInfo?: AudioInfo | null;
}

export const ContextMenu: React.FC<ContextMenuProps> = React.memo(({
  ctxMenu,
  setCtxMenu,
  playlists,
  setPlaylists,
  setQueue,
  playNext,
  addToQueue,
  handlePlayTrack,
  handlePlayLocalTrack,
  handleDownload,
  handleCancelDownload,
  handleDeleteLocalTrack,
  handleOpenInFileManager,
  handleExportPlaylistM3u,
  downloadingTracks,
  isTrackLiked,
  toggleLikeTrack,
  setRenamingPlaylist,
  setRenameVal,
  setRenameDescVal,
  setPlaylistDeleteModal,
  setShowDuplicatesPlaylist,
  setBulkEditPlaylist,
  handlePlaylistCoverUpload,
  setInfoModalTrack,
  infoModalTrack,
  addToPlaylistTrack,
  setAddToPlaylistTrack,
  setMetadataEditingTrack,
  showToast,
  currentTrack,
  audioInfo,
}) => {
  const copyToClipboard = async (text: string) => {
    if (!text) return;
    let copied = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {}

    if (!copied) {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        el.style.top = '-9999px';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        copied = document.execCommand('copy');
        document.body.removeChild(el);
      } catch {}
    }

    showToast('Copied link to clipboard');
  };

  const getTrackShareUrl = (track: Track) => {
    if (!track) return '';
    if (track.url?.includes('youtube.com') || track.url?.includes('youtu.be')) {
      return track.url;
    }
    if (track.url && /^[a-zA-Z0-9_-]{11}$/.test(track.url)) {
      return `https://www.youtube.com/watch?v=${track.url}`;
    }
    if (track.url?.startsWith('http')) {
      return track.url;
    }
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.title} ${cleanArtist(track.artist)}`)}`;
  };

  const openInYouTube = (trackOrUrl: Track | string) => {
    let url = typeof trackOrUrl === 'string' ? trackOrUrl : trackOrUrl.url;
    if (typeof trackOrUrl !== 'string' && (!url || (!url.includes('youtube.com') && !url.includes('youtu.be')))) {
      const ytId = trackOrUrl.url?.match(/[?&]v=([^&]+)/)?.[1] || trackOrUrl.url?.split('youtu.be/')?.[1]?.split('?')?.[0];
      if (ytId) {
        url = `https://www.youtube.com/watch?v=${ytId}`;
      } else {
        url = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${trackOrUrl.title} ${cleanArtist(trackOrUrl.artist)}`)}`;
      }
    }
    if (url) {
      openUrl(url).catch(() => {
        window.open(url, '_blank');
      });
    }
  };

  const addTrackToPlaylist = (pid: string, track: Track) => {
    if (track.url?.startsWith('local://')) {
      showToast('Offline tracks cannot be added to playlists');
      return;
    }
    let added = false;
    let pName = 'playlist';
    setPlaylists(prev => prev.map(p => {
      if (p.id === pid) {
        pName = p.name;
        if (p.tracks.some(t => t.url === track.url)) return p;
        added = true;
        return { ...p, tracks: [...p.tracks, track] };
      }
      return p;
    }));
    if (added) {
      showToast(`Added to ${pName}`);
    } else {
      showToast('Already in playlist');
    }
    setAddToPlaylistTrack(null);
  };

  useEffect(() => {
    if (!ctxMenu) return;
    const handleResize = () => setCtxMenu(null);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [ctxMenu, setCtxMenu]);

  return (
    <>
      {ctxMenu && (() => {
        const { track, playlist, localTracksList, localTrackIndex } = ctxMenu;
        
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;

        if (ctxMenu.type === 'local' && track) {
          const menuWidth = 220;
          const localTrack: LocalTrack = {
            title: track.title,
            path: track.url.replace('local://', ''),
            size_bytes: 0,
            extension: track.artist || 'AUDIO',
            artist: track.artist,
            duration: track.duration,
            cover: track.cover,
          };
          const maxLeft = vw - menuWidth - 12;
          const maxTop = vh - 320;
          const left = Math.max(12, Math.min(ctxMenu.x, maxLeft));
          const top = Math.max(12, Math.min(ctxMenu.y, maxTop));

          return (
            <div className="v-ctx custom-scrollbar" style={{ position: 'fixed', zIndex: 9999, width: `${menuWidth}px`, top: `${top}px`, left: `${left}px` }} onClick={e => e.stopPropagation()}>
              <div className="v-ctx__header">
                <div className="v-ctx__art" style={{ position: 'relative', background: getTrackGradient(track.title, track.artist), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Music size={14} style={{ position: 'absolute', color: 'rgba(255,255,255,0.2)' }} />
                  {track.cover && <img src={track.cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--v-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
                  {cleanArtist(track.artist) && <div style={{ fontSize: '11px', color: 'var(--v-fg2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{cleanArtist(track.artist)}</div>}
                </div>
              </div>
              <button onClick={() => { handlePlayLocalTrack(localTrack, localTracksList, localTrackIndex); setCtxMenu(null); }} className="v-ctx__item"><Play size={14} /> Play</button>
              <button onClick={() => { if (playNext) playNext(track); else { setQueue(p => [track, ...p.filter(t => t.url !== track.url)]); showToast('Playing next'); } setCtxMenu(null); }} className="v-ctx__item"><PlaySquare size={14} /> Play Next</button>
              <button onClick={() => { if (addToQueue) addToQueue(track); else { setQueue(p => [...p.filter(t => t.url !== track.url), track]); showToast('Added to queue'); } setCtxMenu(null); }} className="v-ctx__item"><ListPlus size={14} /> Add to Queue</button>
              <button onClick={() => { setMetadataEditingTrack(track); setCtxMenu(null); }} className="v-ctx__item"><Pencil size={13} /> Edit Metadata</button>
              <button onClick={() => { handleOpenInFileManager(localTrack.path); setCtxMenu(null); }} className="v-ctx__item"><FolderOpen size={13} /> Show in Folder</button>
              <div className="v-ctx__sep" />
              <button onClick={() => { handleDeleteLocalTrack(localTrack); setCtxMenu(null); }} className="v-ctx__item v-ctx__item--danger"><Trash2 size={13} /> Delete File</button>
            </div>
          );
        }

        if ((ctxMenu.type === 'track' || ctxMenu.type === 'quickpick' || ctxMenu.type === 'queue-track') && track) {
          const isLocal = track.url.startsWith('local://');
          const menuWidth = 220;
          const menuHeight = isLocal ? 280 : 420;
          const maxLeft = vw - menuWidth - 12;
          const maxTop = vh - menuHeight - 12;
          const left = Math.max(12, Math.min(ctxMenu.x, maxLeft));
          const top = Math.max(12, Math.min(ctxMenu.y, maxTop));
          const localFilePath = isLocal ? track.url.replace('local://', '') : '';
          const localTrack: LocalTrack = {
            title: track.title,
            path: localFilePath,
            size_bytes: 0,
            extension: track.artist || 'AUDIO',
            artist: track.artist,
            duration: track.duration,
            cover: track.cover,
          };

          return (
            <div className="v-ctx custom-scrollbar" style={{ position: 'fixed', zIndex: 9999, width: `${menuWidth}px`, top: `${top}px`, left: `${left}px` }} onClick={e => e.stopPropagation()}>
              <div className="v-ctx__header">
                <div className="v-ctx__art" style={{
                  position: 'relative',
                  background: getTrackGradient(track.title, track.artist),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Music size={14} style={{ position: 'absolute', color: 'rgba(255,255,255,0.2)' }} />
                  {track.cover && <img src={track.cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--v-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
                  {cleanArtist(track.artist) && <div style={{ fontSize: '11px', color: 'var(--v-fg2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{cleanArtist(track.artist)}</div>}
                </div>
              </div>

              {/* Core Playback Actions */}
              {isLocal ? (
                <button onClick={() => { handlePlayLocalTrack(localTrack); setCtxMenu(null); }} className="v-ctx__item"><Play size={14} /> Play Now</button>
              ) : (
                <button onClick={() => { handlePlayTrack(track); setCtxMenu(null); }} className="v-ctx__item"><Play size={14} /> Play Now</button>
              )}
              <button onClick={() => { if (playNext) playNext(track); else { setQueue(p => [track, ...p.filter(t => t.url !== track.url)]); showToast('Playing next'); } setCtxMenu(null); }} className="v-ctx__item"><PlaySquare size={14} /> Play Next</button>
              <button onClick={() => { if (addToQueue) addToQueue(track); else { setQueue(p => [...p.filter(t => t.url !== track.url), track]); showToast('Added to queue'); } setCtxMenu(null); }} className="v-ctx__item"><ListPlus size={14} /> Add to Queue</button>

              {/* Online Only: Like & Add to Playlist */}
              {!isLocal && (
                <>
                  <button onClick={() => { toggleLikeTrack(track); setCtxMenu(null); }} className="v-ctx__item">
                    <Heart size={14} style={isTrackLiked(track.url) ? { color: 'var(--v-accent)', fill: 'currentColor' } : {}} />
                    {isTrackLiked(track.url) ? 'Remove from Liked' : 'Like'}
                  </button>
                  <button onClick={e => { e.stopPropagation(); setAddToPlaylistTrack(track); setCtxMenu(null); }} className="v-ctx__item"><PlusCircle size={14} /> Add to Playlist</button>
                </>
              )}

              {/* Local Only: Edit Metadata & Show in Folder */}
              {isLocal && (
                <>
                  <button onClick={() => { setMetadataEditingTrack(track); setCtxMenu(null); }} className="v-ctx__item"><Pencil size={13} /> Edit Metadata</button>
                  <button onClick={() => { handleOpenInFileManager(localFilePath); setCtxMenu(null); }} className="v-ctx__item"><FolderOpen size={13} /> Show in Folder</button>
                </>
              )}

              {/* Queue specific action */}
              {ctxMenu.type === 'queue-track' && (
                <button onClick={() => { setQueue(prev => prev.filter(t => t.url !== track.url)); setCtxMenu(null); }} className="v-ctx__item v-ctx__item--danger"><X size={14} /> Remove from Queue</button>
              )}

              <div className="v-ctx__sep" />

              {/* Bottom Actions */}
              {isLocal ? (
                <button onClick={() => { handleDeleteLocalTrack(localTrack); setCtxMenu(null); }} className="v-ctx__item v-ctx__item--danger"><Trash2 size={13} /> Delete File</button>
              ) : (
                <>
                  <button onClick={() => { setInfoModalTrack(track); setCtxMenu(null); }} className="v-ctx__item"><Info size={14} /> Track Info</button>
                  <button onClick={() => { copyToClipboard(getTrackShareUrl(track)); setCtxMenu(null); }} className="v-ctx__item"><Share2 size={14} /> Copy Link</button>
                  <button onClick={() => {
                    if (downloadingTracks[track.url] !== undefined) handleCancelDownload(track.url);
                    else handleDownload(track);
                    setCtxMenu(null);
                  }} className="v-ctx__item">
                    {(downloadingTracks[track.url] ?? 0) > 0 ? 'Cancel Download' : <><Download size={14} /> Download</>}
                  </button>
                  <button onClick={() => { openInYouTube(track); setCtxMenu(null); }} className="v-ctx__item"><ExternalLink size={13} /> Open in YouTube</button>
                </>
              )}
            </div>
          );
        }

        if ((ctxMenu.type === 'playlist' || ctxMenu.type === 'sidebar-playlist') && playlist) {
          const menuWidth = 200;
          const menuHeight = playlist.id === 'p1' ? 340 : 430;
          const maxLeft = vw - menuWidth - 12;
          const maxTop = vh - menuHeight - 12;
          const left = Math.max(12, Math.min(ctxMenu.x, maxLeft));
          const top = Math.max(12, Math.min(ctxMenu.y, maxTop));
          return (
            <div className="v-ctx custom-scrollbar" style={{ position: 'fixed', zIndex: 9999, width: `${menuWidth}px`, top: `${top}px`, left: `${left}px` }} onClick={e => e.stopPropagation()}>
              <div className="v-ctx__header">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--v-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playlist.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--v-fg2)', marginTop: '1px' }}>{playlist.tracks.length} tracks</div>
                </div>
              </div>
              <button className="v-ctx__item" onClick={() => {
                if (playlist.tracks.length > 0) {
                  handlePlayTrack(playlist.tracks[0]);
                  setQueue(playlist.tracks.slice(1));
                }
                setCtxMenu(null);
              }}><Play size={13} /> Play All</button>
              <button className="v-ctx__item" onClick={() => {
                const s = [...playlist.tracks].sort(() => Math.random() - 0.5);
                if (s.length) {
                  handlePlayTrack(s[0]);
                  setQueue(s.slice(1));
                }
                setCtxMenu(null);
              }}><Shuffle size={13} /> Shuffle</button>
              <button className="v-ctx__item" onClick={() => {
                setQueue(p => [...p, ...playlist.tracks]);
                showToast(`Added ${playlist.tracks.length} to queue`);
                setCtxMenu(null);
              }}><ListPlus size={13} /> Add to Queue</button>
              <div className="v-ctx__sep" />
              {playlist.id !== 'p1' && (
                <button className="v-ctx__item" onClick={() => {
                  setRenamingPlaylist(playlist);
                  setRenameVal(playlist.name);
                  setRenameDescVal(playlist.description);
                  setCtxMenu(null);
                }}><Pencil size={13} /> Rename</button>
              )}
              {setShowDuplicatesPlaylist && (
                <button className="v-ctx__item" onClick={() => {
                  setShowDuplicatesPlaylist(playlist);
                  setCtxMenu(null);
                }}><Copy size={13} /> Find Duplicates</button>
              )}
              {setBulkEditPlaylist && (
                <button className="v-ctx__item" onClick={() => {
                  setBulkEditPlaylist(playlist);
                  setCtxMenu(null);
                }}><Pencil size={13} /> Bulk Edit Tags</button>
              )}
              {handlePlaylistCoverUpload && (
                <button className="v-ctx__item" onClick={() => {
                  handlePlaylistCoverUpload(playlist.id);
                  setCtxMenu(null);
                }}><ImagePlus size={13} /> Change Cover</button>
              )}
              <div className="v-ctx__sep" />
              <button className="v-ctx__item" onClick={() => {
                handleExportPlaylistM3u(playlist);
                setCtxMenu(null);
              }}><FileOutput size={13} /> Export M3U</button>
              {playlist.id !== 'p1' && (
                <button className="v-ctx__item v-ctx__item--danger" onClick={() => {
                  setPlaylistDeleteModal({ ids: [playlist.id], names: [playlist.name] });
                  setCtxMenu(null);
                }}><Trash2 size={13} /> Delete</button>
              )}
            </div>
          );
        }

        return null;
      })()}

      {/* Add to Playlist dialog */}
      {addToPlaylistTrack && !addToPlaylistTrack.url.startsWith('local://') && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 16px 100px 16px', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }} onClick={() => setAddToPlaylistTrack(null)}>
          <div className="v-ctx" style={{ width: '280px', background: 'var(--v-bg2)', border: '1px solid var(--v-bdr2)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.85)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--v-bdr2)' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--v-fg)', fontSize: '13px' }}>Add to Playlist</div>
                <div style={{ fontSize: '11px', color: 'var(--v-fg3)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>{addToPlaylistTrack.title}</div>
              </div>
              <button onClick={() => setAddToPlaylistTrack(null)} style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '7px', border: 'none', background: 'var(--v-bg3)', color: 'var(--v-fg3)', cursor: 'pointer', transition: 'color 0.15s ease' }}>
                <X size={13} />
              </button>
            </div>
            <div style={{ padding: '4px 0', maxHeight: '220px', overflowY: 'auto' }} className="custom-scrollbar">
              {playlists.map(p => {
                const alreadyIn = p.tracks.some(t => t.url === addToPlaylistTrack.url);
                return (
                  <button
                    key={p.id}
                    onClick={() => !alreadyIn && addTrackToPlaylist(p.id, addToPlaylistTrack)}
                    disabled={alreadyIn}
                    className="v-ctx__item"
                    style={{ opacity: alreadyIn ? 0.4 : 1, cursor: alreadyIn ? 'not-allowed' : 'pointer' }}
                  >
                    <div style={{ width: '24px', height: '24px', borderRadius: '5px', overflow: 'hidden', flexShrink: 0, background: 'var(--v-bg3)', border: '1px solid var(--v-bdr)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {p.id === 'p1' ? <Heart size={12} style={{ color: 'var(--v-accent)', fill: 'currentColor' }} /> : <ListMusic size={13} style={{ color: 'var(--v-fg2)' }} />}
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--v-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</span>
                    {alreadyIn ? <span style={{ fontSize: '9.5px', color: 'var(--v-fg3)', fontWeight: 700 }}>Added</span> : <span style={{ fontSize: '10px', color: 'var(--v-fg3)' }}>{p.tracks.length}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Info Modal dialog */}
      {infoModalTrack && (() => {
        const ytId = infoModalTrack.url?.match(/[?&]v=([^&]+)/)?.[1] || infoModalTrack.url?.split('youtu.be/')?.[1]?.split('?')?.[0] || '';
        const ytUrl = ytId ? `https://youtube.com/watch?v=${ytId}` : infoModalTrack.url;
        const isYt = !!ytId;
        const trackAudioInfo = infoModalTrack.url === currentTrack?.url ? audioInfo : null;

        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={() => setInfoModalTrack(null)}
          >
            <div
              style={{ borderRadius: '22px', width: '100%', maxWidth: '400px', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--v-bg2)', border: '1px solid var(--v-bdr2)', boxShadow: '0 32px 80px rgba(0,0,0,0.85)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Hero */}
              <div style={{ position: 'relative', height: '160px', width: '100%', flexShrink: 0, overflow: 'hidden' }}>
                {infoModalTrack.cover ? (
                  <img src={infoModalTrack.cover} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3, transform: 'scale(1.15)', filter: 'blur(4px)' }} onError={e => { e.currentTarget.style.display = 'none'; }} alt="" />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, background: getTrackGradient(infoModalTrack.title, infoModalTrack.artist), opacity: 0.4 }} />
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 0%, var(--v-bg2) 100%)' }} />
                <button
                  onClick={() => setInfoModalTrack(null)}
                  style={{ position: 'absolute', top: '12px', right: '12px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'var(--v-bg3)', border: '1px solid var(--v-bdr)', cursor: 'pointer', color: 'var(--v-fg3)', zIndex: 2, transition: 'color 0.15s ease' }}
                >
                  <X size={12} />
                </button>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: '16px' }}>
                  <div style={{ width: '88px', height: '88px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.7), 0 0 0 1px var(--v-bdr2)', background: getTrackGradient(infoModalTrack.title, infoModalTrack.artist), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Music size={24} style={{ color: 'rgba(255,255,255,0.2)', position: 'absolute' }} />
                    {infoModalTrack.cover && <img src={infoModalTrack.cover} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} alt="" />}
                  </div>
                </div>
              </div>

              {/* Title + artist */}
              <div style={{ padding: '0 20px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--v-fg)', letterSpacing: '-0.02em', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{infoModalTrack.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--v-fg3)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{infoModalTrack.artist}</div>
              </div>

              {/* Pills */}
              <div style={{ display: 'flex', gap: '5px', padding: '0 20px 16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {[
                  infoModalTrack.duration && infoModalTrack.duration !== '0:00' && { icon: <Clock size={9} />, label: infoModalTrack.duration },
                  isYt && { icon: <Youtube size={9} />, label: 'YouTube' },
                  trackAudioInfo?.codec && trackAudioInfo.codec !== 'unknown' && { icon: <BarChart2 size={9} />, label: `${trackAudioInfo.codec.toUpperCase()}${trackAudioInfo.bitrate > 0 ? ` · ${Math.round(trackAudioInfo.bitrate / 1000)}k` : ''}` },
                  trackAudioInfo && trackAudioInfo.samplerate && trackAudioInfo.samplerate > 0 && { icon: <Gauge size={9} />, label: `${(trackAudioInfo.samplerate / 1000).toFixed(1)}kHz` },
                  trackAudioInfo?.channels && { icon: <AlignLeft size={9} />, label: trackAudioInfo.channels },
                  trackAudioInfo?.format && { icon: <FileCode2 size={9} />, label: trackAudioInfo.format },
                ].filter(Boolean).map((item: any, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--v-bg3)', border: '1px solid var(--v-bdr2)', padding: '4px 10px', borderRadius: '9999px', fontSize: '10px', fontWeight: 600, color: 'var(--v-fg2)' }}>
                    {item.icon}{item.label}
                  </span>
                ))}
              </div>

              {/* Info rows */}
              <div style={{ margin: '0 14px 14px', borderRadius: '14px', overflow: 'hidden', background: 'var(--v-bg3)', border: '1px solid var(--v-bdr)' }}>
                {[
                  { icon: Music, label: 'Title', value: infoModalTrack.title },
                  { icon: FileBadge2, label: 'Artist', value: infoModalTrack.artist },
                  ...(ytId ? [{ icon: Hash, label: 'Video ID', value: ytId }] : []),
                ].map(({ icon: Icon, label, value }, idx, arr) => (
                  <div
                    key={label}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer', borderBottom: idx < arr.length - 1 ? '1px solid var(--v-bdr)' : 'none' }}
                    onClick={() => copyToClipboard(value)}
                    title={`Click to copy ${label}`}
                  >
                    <div style={{ width: '30px', height: '30px', borderRadius: '9999px', background: 'var(--v-bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--v-fg3)' }}>
                      <Icon size={13} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--v-fg3)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--v-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>{value || '-'}</div>
                    </div>
                    <Copy size={11} style={{ color: 'var(--v-fg3)', flexShrink: 0 }} />
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ padding: '0 14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <CopyButton text={ytId || ''} label="Copy ID" icon={Copy} disabled={!ytId} />
                  <CopyButton text={ytUrl} label="Copy Link" icon={Share2} />
                </div>
                <button
                  onClick={() => openInYouTube(infoModalTrack)}
                  disabled={!ytUrl}
                  style={{ width: '100%', padding: '10px', borderRadius: '9999px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: 'none', background: 'rgb(220,38,38)', color: 'white', cursor: ytUrl ? 'pointer' : 'not-allowed', opacity: ytUrl ? 1 : 0.4 }}
                >
                  <Youtube size={14} /> Open in YouTube
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
});
