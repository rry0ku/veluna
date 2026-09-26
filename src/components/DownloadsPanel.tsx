import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  HardDrive, FolderOpen, FileOutput, RefreshCw, Search, X,
  AlertCircle, FileMusic, Play, Pencil, Trash2, ArrowUpDown, CheckSquare, Square
} from 'lucide-react';
import { LocalTrack, DiskInfo, Track, Playlist } from '../types';
import { cleanArtist, formatBytes, parseDurationToSeconds, parseTrackMeta } from '../utils';
import { VirtualTrackList } from './VirtualTrackList';
import { ThemedSelect } from './ThemedSelect';
import { BatchActionBar } from './BatchActionBar';
import { useMultiSelect } from '../hooks/useMultiSelect';

export const LocalTrackCover = React.memo(({ path, cover, isActive }: { path: string; hasCover?: boolean; cover?: string; isActive: boolean }) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(cover || null);

  useEffect(() => {
    setCoverUrl(cover || null);
    if (cover) return;

    let active = true;
    invoke<string | null>('get_audio_cover', { path })
      .then(url => {
        if (active) setCoverUrl(url || null);
      })
      .catch(() => {
        if (active) setCoverUrl(null);
      });
    return () => {
      active = false;
    };
  }, [path, cover]);

  if (coverUrl) {
    return (
      <img
        src={coverUrl}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
        onError={() => setCoverUrl(null)}
      />
    );
  }

  return <FileMusic size={16} style={{ color: isActive ? "#9e9894" : "#363230" }} />;
});

export const DownloadsPanel = React.memo(function DownloadsPanel({
  downloadPath, onPlayLocalTrack, onDeleteLocalTrack,
  currentTrackPath, isPlaying, isLoadingTrack,
  onOpenInFileManager, onExportM3u, onChangeFolder,
  refreshNonce = 0,
  onCtx,
  tracks,
  setTracks,
  playlists = [],
  addToQueue,
  showToast,
}: {
  downloadPath: string; onPlayLocalTrack: (t: LocalTrack, list?: LocalTrack[], idx?: number) => void;
  onDeleteLocalTrack: (t: LocalTrack) => void; currentTrackPath: string | null;
  isPlaying: boolean; isLoadingTrack: boolean;
  onOpenInFileManager: (p: string) => void; onExportM3u: (ts: LocalTrack[]) => void;
  onChangeFolder: () => void;
  refreshNonce?: number;
  onCtx?: (e: React.MouseEvent, t: LocalTrack) => void;
  tracks: LocalTrack[];
  setTracks: React.Dispatch<React.SetStateAction<LocalTrack[]>>;
  playlists?: Playlist[];
  addToQueue?: (tracks: Track | Track[]) => void;
  showToast?: (msg: string) => void;
}) {
  const tracksRef = useRef(tracks);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  const [scanning, setScanning] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
  const [renaming, setRenaming] = useState<LocalTrack | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [renameArtistVal, setRenameArtistVal] = useState('');
  const [renameInputFocused, setRenameInputFocused] = useState(false);
  const [renameArtistInputFocused, setRenameArtistInputFocused] = useState(false);
  const [renameCloseHovered, setRenameCloseHovered] = useState(false);
  const [renameCancelHovered, setRenameCancelHovered] = useState(false);
  const [renameSaveHovered, setRenameSaveHovered] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [downloadsSortBy, setDownloadsSortBy] = useState<'default' | 'title_asc' | 'title_desc' | 'artist_asc' | 'duration_asc' | 'duration_desc' | 'size_desc'>('default');
  const dragLocalIdx = useRef<number | null>(null);
  const dragOverLocalIdxRef = useRef<number | null>(null);
  const [dragOverLocalIdx, setDragOverLocalIdx] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { selectedUrls, isMultiSelectActive, toggleSelect, clearSelection } = useMultiSelect();

  useEffect(() => {
    clearSelection();
  }, [downloadPath, searchQ, clearSelection]);

  const toTrack = useCallback((t: LocalTrack): Track => {
    const meta = parseTrackMeta(t.title, t.artist);
    return {
      id: 0,
      title: meta.title || t.title,
      artist: meta.artist || t.artist || '',
      album: t.album || '',
      url: `local://${t.path}`,
      cover: t.cover || '',
      duration: t.duration || '0:00',
    };
  }, []);

  const filtered = (() => {
    let list = searchQ.trim()
      ? tracks.filter(t => {
          const q = searchQ.toLowerCase();
          return t.title.toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q);
        })
      : [...tracks];

    if (downloadsSortBy === 'title_asc') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (downloadsSortBy === 'title_desc') {
      list.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    } else if (downloadsSortBy === 'artist_asc') {
      list.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    } else if (downloadsSortBy === 'duration_asc') {
      list.sort((a, b) => parseDurationToSeconds(a.duration || '0:00') - parseDurationToSeconds(b.duration || '0:00'));
    } else if (downloadsSortBy === 'duration_desc') {
      list.sort((a, b) => parseDurationToSeconds(b.duration || '0:00') - parseDurationToSeconds(a.duration || '0:00'));
    } else if (downloadsSortBy === 'size_desc') {
      list.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0));
    }
    return list;
  })();

  const scan = useCallback(async () => {
    const existingTracks = tracksRef.current;
    if (existingTracks.length === 0) {
      setScanning(true);
    }
    setError(null);
    try {
      const raw: LocalTrack[] = await invoke('scan_downloads', { path: downloadPath });
      const rawWithCovers = raw.map(newTrack => {
        const existing = existingTracks.find(t => t.path === newTrack.path);
        if (existing) {
          return {
            ...newTrack,
            title: existing.title,
            artist: existing.artist,
            duration: existing.duration,
            has_cover: existing.has_cover,
            cover: existing.cover,
          };
        }
        return newTrack;
      });
      setTracks(rawWithCovers);
      setScanning(false);

      const di = await invoke<DiskInfo>('get_disk_usage', { path: downloadPath }).catch(() => null);
      if (di) setDiskInfo(di);

      setEnriching(true);
      let workingTracks = [...rawWithCovers];
      let hasUpdates = false;
      let count = 0;
      for (const t of rawWithCovers) {
        const existing = existingTracks.find(p => p.path === t.path);
        if ((existing && existing.duration !== undefined) || (t.duration && t.duration !== '0:00')) {
          continue;
        }

        try {
          const m: { title: string; artist: string; duration: string; has_cover: boolean } = await invoke('get_audio_metadata', { path: t.path });
          let cover: string | undefined = undefined;
          try {
            const coverB64 = await invoke<string | null>('get_audio_cover', { path: t.path });
            if (coverB64) cover = coverB64;
          } catch {}
          const enriched = { ...t, title: m.title || t.title, artist: cleanArtist(m.artist) || t.artist || undefined, duration: m.duration !== '0:00' ? m.duration : undefined, has_cover: Boolean(m.has_cover || cover), cover };
          workingTracks = workingTracks.map(p => p.path === t.path ? enriched : p);
          hasUpdates = true;
          count++;
          if (count % 8 === 0) {
            setTracks([...workingTracks]);
          }
        } catch { /* keep original */ }
      }
      if (hasUpdates) {
        setTracks(workingTracks);
      }
      setEnriching(false);
    } catch (e) { setError(String(e)); setScanning(false); setEnriching(false); }
  }, [downloadPath]);

  useEffect(() => {
    scan();
  }, [scan, refreshNonce]);

  useEffect(() => {
    if (downloadPath) {
      invoke('watch_download_folder', { path: downloadPath }).catch(() => {});
    }
    const unlistenPromise = listen('local_folder_changed', () => {
      scan();
    });
    return () => {
      unlistenPromise.then(fn => fn()).catch(() => {});
    };
  }, [downloadPath, scan]);

  const confirmRename = async () => {
    if (!renaming || !renameVal.trim()) return;
    try {
      await invoke('write_audio_metadata', { path: renaming.path, title: renameVal.trim(), artist: renameArtistVal.trim(), album: '' });
      const newPath: string = await invoke('rename_local_file', { oldPath: renaming.path, newTitle: renameVal.trim() });
      setTracks(prev => prev.map(t => t.path === renaming.path ? { ...t, title: renameVal.trim(), artist: renameArtistVal.trim(), path: newPath } : t));
      setRenaming(null);
    } catch (e) { setError(String(e)); }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar" style={{padding:"24px 30px 140px 30px",zIndex:10}}>

      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "20px",
        marginBottom: "20px",
        background: "linear-gradient(135deg, rgba(255, 255, 255, 0.015) 0%, rgba(255, 255, 255, 0) 100%)",
        border: "1px solid var(--v-bdr)",
        borderRadius: "16px",
        padding: "20px",
        position: "relative",
        overflow: "hidden"
      }}>
        <div style={{
          position: "absolute",
          top: "-50px",
          left: "-50px",
          width: "150px",
          height: "150px",
          background: "var(--v-accent)",
          opacity: 0.02,
          borderRadius: "50%",
          pointerEvents: "none"
        }} />
        <div style={{
          width: "60px",
          height: "60px",
          borderRadius: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
          flexShrink: 0
        }}>
          <HardDrive size={26} style={{ color: "var(--v-accent)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: "24px", fontWeight: 900, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>Offline Library</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
            <button onClick={onChangeFolder}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11.5px",
                color: "#9e9894",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--v-bdr)",
                borderRadius: "20px",
                padding: "4px 10px",
                cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                fontFamily: "monospace"
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "var(--v-accent)";
                e.currentTarget.style.color = "#fff";
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "var(--v-bdr)";
                e.currentTarget.style.color = "#9e9894";
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
              }}
              title="Change Folder"
            >
              <FolderOpen size={12} style={{ color: "var(--v-accent)" }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "240px" }}>{downloadPath}</span>
            </button>
            {diskInfo && (
              <div style={{
                fontSize: "11px",
                color: "#8a827e",
                background: "rgba(255, 255, 255, 0.01)",
                border: "1px solid rgba(255, 255, 255, 0.04)",
                borderRadius: "20px",
                padding: "4px 10px",
                fontWeight: 500
              }}>
                {formatBytes(diskInfo.used_bytes)} used · {diskInfo.track_count} files
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <button onClick={onChangeFolder} title="Change folder"
            style={{
              padding: "8px",
              borderRadius: "10px",
              border: "1px solid var(--v-bdr)",
              background: "rgba(255, 255, 255, 0.01)",
              color: "#9e9894",
              cursor: "pointer",
              display: "flex",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--v-bdr3)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#9e9894"; e.currentTarget.style.borderColor = "var(--v-bdr)"; e.currentTarget.style.background = "rgba(255,255,255,0.01)"; }}
          >
            <FolderOpen size={15} />
          </button>
          {tracks.length > 0 && (
            <button onClick={() => onExportM3u(tracks)} title="Export M3U"
              style={{
                padding: "8px",
                borderRadius: "10px",
                border: "1px solid var(--v-bdr)",
                background: "rgba(255, 255, 255, 0.01)",
                color: "#9e9894",
                cursor: "pointer",
                display: "flex",
                transition: "all 0.15s ease"
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--v-bdr3)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#9e9894"; e.currentTarget.style.borderColor = "var(--v-bdr)"; e.currentTarget.style.background = "rgba(255,255,255,0.01)"; }}
            >
              <FileOutput size={15} />
            </button>
          )}
          <button onClick={scan} disabled={scanning} title="Refresh"
            style={{
              padding: "8px",
              borderRadius: "10px",
              border: "1px solid var(--v-bdr)",
              background: "rgba(255, 255, 255, 0.01)",
              color: "#9e9894",
              cursor: scanning ? "not-allowed" : "pointer",
              display: "flex",
              opacity: scanning ? 0.4 : 1,
              transition: "all 0.15s ease"
            }}
            onMouseEnter={e => { if (!scanning) { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--v-bdr3)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; } }}
            onMouseLeave={e => { e.currentTarget.style.color = "#9e9894"; e.currentTarget.style.borderColor = "var(--v-bdr)"; e.currentTarget.style.background = "rgba(255,255,255,0.01)"; }}
          >
            <RefreshCw size={15} style={scanning ? { animation: "spin 0.8s linear infinite" } : {}} />
          </button>
        </div>
      </div>
      {!scanning && tracks.length > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "18px",
          flexWrap: "wrap"
        }}>
          <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
            <Search size={14} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: searchQ ? "var(--v-accent)" : "var(--v-fg3)", pointerEvents: "none", transition: "color 0.2s" }} />
            <input ref={searchRef} type="text" placeholder="Filter offline tracks…" value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); }}
              style={{
                width: "100%",
                height: "36px",
                background: "var(--v-bg2)",
                border: "1px solid var(--v-bdr2)",
                color: "var(--v-fg)",
                borderRadius: "10px",
                padding: "0 32px 0 34px",
                fontSize: "12.5px",
                outline: "none",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = "var(--v-bdr3)";
                e.currentTarget.style.background = "var(--v-bg3)";
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = "var(--v-bdr2)";
                e.currentTarget.style.background = "var(--v-bg2)";
              }}
            />
            {searchQ && (
              <button onClick={() => setSearchQ('')} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--v-fg3)", display: "flex", padding: "2px" }} onMouseEnter={e => (e.currentTarget.style.color = "var(--v-fg)")} onMouseLeave={e => (e.currentTarget.style.color = "var(--v-fg3)")}>
                <X size={13} />
              </button>
            )}
          </div>

          <ThemedSelect
            value={downloadsSortBy}
            onChange={v => setDownloadsSortBy(v as any)}
            icon={<ArrowUpDown size={13} style={{ color: "var(--v-accent)" }} />}
            options={[
              { value: 'default', label: 'Recently Added' },
              { value: 'title_asc', label: 'Title (A → Z)' },
              { value: 'title_desc', label: 'Title (Z → A)' },
              { value: 'artist_asc', label: 'Artist (A → Z)' },
              { value: 'duration_asc', label: 'Duration (Shortest)' },
              { value: 'duration_desc', label: 'Duration (Longest)' },
              { value: 'size_desc', label: 'File Size (Largest)' },
            ]}
          />
        </div>
      )}

      {error && (
        <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 14px",borderRadius:"8px",background:"rgba(160,40,40,0.08)",border:"1px solid rgba(160,40,40,0.2)",color:"#a05050",fontSize:"12px",marginBottom:"16px"}}>
          <AlertCircle size={15} style={{flexShrink:0}}/><span>{error}</span>
        </div>
      )}

      {scanning && (
        <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:"12px",padding:"8px 12px"}}>
              <div style={{width:"38px",height:"38px",borderRadius:"7px",background:"var(--v-bdr2)",flexShrink:0}} className="animate-pulse"/>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:"6px"}}>
                <div style={{height:"11px",background:"var(--v-bdr2)",borderRadius:"3px",width:`${50+(i*11)%35}%`}} className="animate-pulse"/>
                <div style={{height:"9px",background:"var(--v-bdr2)",borderRadius:"3px",width:`${25+(i*7)%20}%`}} className="animate-pulse"/>
              </div>
            </div>
          ))}
        </div>
      )}

      {!scanning && tracks.length === 0 && !error && (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"160px",gap:"12px",textAlign:"center"}}>
          <div style={{width:"52px",height:"52px",borderRadius:"12px",background:"var(--v-bg2)",border:"1px solid var(--v-bdr2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <FileMusic size={22} strokeWidth={1} style={{color:"#8a807c"}}/>
          </div>
          <div>
            <div style={{fontSize:"13px",fontWeight:600,color:"#e2ddd9"}}>No audio files found</div>
            <div style={{fontSize:"11px",color:"#8a807c",marginTop:"4px"}}>Download tracks from Home or change folder in Settings</div>
          </div>
        </div>
      )}

      {!scanning && tracks.length > 0 && (
        <>
          <div className="v-section-head">
            <h2>{searchQ.trim()?`${filtered.length} result${filtered.length!==1?'s':''}`:`${tracks.length} track${tracks.length!==1?'s':''}`}</h2>
            {enriching && <span style={{fontSize:"11px",color:"#5c5755",display:"flex",alignItems:"center",gap:"5px"}}><div style={{width:"10px",height:"10px",border:"1.5px solid #5c5755",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>reading…</span>}
            {!searchQ && !enriching && <span style={{fontSize:"10px",color:"var(--v-fg3)"}}>drag to reorder</span>}
          </div>

          {filtered.length === 0 && searchQ && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"110px",color:"var(--v-fg3)",gap:"7px"}}>
              <Search size={28} strokeWidth={1} />
              <p style={{fontSize:"12px",color:"#5c5755"}}>No tracks match "{searchQ}"</p>
            </div>
          )}

          <div>
            <VirtualTrackList
              items={filtered}
              itemHeight={56}
              keyExtractor={(track) => track.path}
              renderItem={(track, i) => {
                const trackObj = toTrack(track);
                const isSelected = selectedUrls.has(trackObj.url);
                const isActive = currentTrackPath === track.path;
                const isHov = hovered === track.path;
                const isDragOver = dragOverLocalIdx === i && dragLocalIdx.current !== null && dragLocalIdx.current !== i;
                return (
                  <div
                    className={`v-track${isActive?' v-track--active':''}${isSelected ? ' v-track--selected' : ''}`}
                    style={{
                      position:"relative",
                      borderColor:isDragOver?"rgba(226,221,217,0.2)":undefined,
                      background: isSelected ? 'rgba(255, 255, 255, 0.08)' : undefined,
                    }}
                    onMouseEnter={() => { setHovered(track.path); if(dragLocalIdx.current!==null){dragOverLocalIdxRef.current=i;setDragOverLocalIdx(i);} }}
                    onMouseLeave={() => setHovered(null)}
                    onClick={e => {
                      if (e.shiftKey || e.ctrlKey || e.metaKey || isMultiSelectActive) {
                        e.preventDefault();
                        toggleSelect(trackObj, i, e, filtered.map(toTrack));
                      } else {
                        onPlayLocalTrack(track, searchQ ? filtered : tracks, i);
                      }
                    }}
                    onContextMenu={e => onCtx?.(e, track)}
                  >
                    {isDragOver && <div style={{position:"absolute",top:0,left:0,right:0,height:"1.5px",background:"rgba(226,221,217,0.5)",borderRadius:"1px",zIndex:10,pointerEvents:"none"}} />}
                    {!searchQ && !isMultiSelectActive && (
                      <div style={{width:"14px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"grab",opacity:isHov?0.5:0,transition:"opacity .12s"}}
                        onMouseDown={e => {
                          e.preventDefault();
                          dragLocalIdx.current = i; dragOverLocalIdxRef.current = i; setDragOverLocalIdx(i);
                          const onUp = () => {
                            const from = dragLocalIdx.current; const to = dragOverLocalIdxRef.current;
                            dragLocalIdx.current = null; dragOverLocalIdxRef.current = null; setDragOverLocalIdx(null);
                            window.removeEventListener('mouseup', onUp);
                            if (from===null||to===null||from===to) return;
                            setTracks(prev => { const next=[...prev]; const [moved]=next.splice(from,1); next.splice(to,0,moved); return next; });
                          };
                          window.addEventListener('mouseup', onUp);
                        }}>
                        <svg width="8" height="14" viewBox="0 0 10 16" fill="#5c5755"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg>
                      </div>
                    )}
                    <div
                      className="v-track__num"
                      onClick={e => {
                        if (isMultiSelectActive || isSelected) {
                          e.stopPropagation();
                          toggleSelect(trackObj, i, e, filtered.map(toTrack));
                        }
                      }}
                    >
                      {isSelected ? (
                        <CheckSquare size={13} style={{ color: 'var(--v-accent)', margin: '0 auto' }} />
                      ) : isMultiSelectActive ? (
                        <Square size={13} style={{ color: '#5c5755', margin: '0 auto' }} />
                      ) : isActive&&isLoadingTrack ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" style={{animation:'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite',margin:'0 auto',display:'block'}}>
                          <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(226,221,217,0.15)" strokeWidth="2.5"/>
                          <circle cx="12" cy="12" r="8.5" fill="none" stroke="#e2ddd9" strokeWidth="2.5" strokeDasharray="53.4" strokeDashoffset="36" strokeLinecap="round"/>
                        </svg>
                      ) : isActive&&isPlaying ? (
                        <div style={{display:"flex",gap:"2px",alignItems:"flex-end",height:"13px",justifyContent:"center"}}>{[100,65,80].map((h,j)=><div key={j} style={{width:"2.5px",background:"#9e9894",borderRadius:"1px",height:`${h}%`,animation:`barBounce ${0.7+j*0.12}s ease-in-out ${j*110}ms infinite`,transformOrigin:"bottom"}}/>)}</div>
                      ) : isHov ? (
                        <Play size={12} style={{fill:"#e2ddd9",color:"#e2ddd9",margin:"0 auto"}}/>
                      ) : (
                        i+1
                      )}
                    </div>
                    <div style={{width:"38px",height:"38px",borderRadius:"7px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:isActive?"rgba(226,221,217,0.06)":"var(--v-bdr2)",border:`1px solid ${isActive?"rgba(226,221,217,0.1)":"rgba(255,255,255,0.05)"}`,overflow:"hidden"}}>
                      <LocalTrackCover key={track.path} path={track.path} hasCover={track.has_cover} cover={track.cover} isActive={isActive} />
                    </div>
                    {(() => {
                      const meta = parseTrackMeta(track.title, track.artist);
                      return (
                        <div className="v-track__info">
                          <div className="v-track__title">{meta.title || track.title}</div>
                          <div className="v-track__artist">{(meta.artist || track.artist || track.extension.toUpperCase())} · {formatBytes(track.size_bytes)}</div>
                        </div>
                      );
                    })()}
                    <div className="v-track__actions">
                      <button className="v-track__btn" title="Rename" onClick={e=>{e.stopPropagation();setRenaming(track);setRenameVal(track.title);setRenameArtistVal(track.artist || '');}}><Pencil size={12}/></button>
                      <button className="v-track__btn" title="Show in folder" onClick={e=>{e.stopPropagation();onOpenInFileManager(track.path);}}><FolderOpen size={12}/></button>
                      <button className="v-track__btn" title="Delete" onClick={e=>{e.stopPropagation();onDeleteLocalTrack(track);scan();}}
                        onMouseEnter={e=>(e.currentTarget.style.color="#b05555")} onMouseLeave={e=>(e.currentTarget.style.color="#5c5755")}><Trash2 size={12}/></button>
                    </div>
                    <span style={{fontSize:"11px",color:"var(--v-fg3)",fontVariantNumeric:"tabular-nums",width:"40px",textAlign:"right",flexShrink:0}}>{track.duration||"-"}</span>
                  </div>
                );
              }}
            />
            {isMultiSelectActive && (
              <BatchActionBar
                selectedTracks={filtered.map(toTrack).filter(t => selectedUrls.has(t.url))}
                playlists={playlists}
                isOfflineView={true}
                onClearSelection={clearSelection}
                onPlaySelected={() => {
                  const selected = filtered.filter(t => selectedUrls.has(`local://${t.path}`));
                  if (selected.length > 0) {
                    onPlayLocalTrack(selected[0], selected, 0);
                  }
                  clearSelection();
                }}
                onQueueSelected={() => {
                  const selected = filtered.map(toTrack).filter(t => selectedUrls.has(t.url));
                  if (selected.length > 0 && addToQueue) {
                    addToQueue(selected);
                    showToast?.(`Added ${selected.length} track${selected.length > 1 ? 's' : ''} to queue`);
                  }
                  clearSelection();
                }}
                onAddToPlaylist={() => {}}
                onDeleteSelected={() => {
                  const selected = filtered.filter(t => selectedUrls.has(`local://${t.path}`));
                  selected.forEach(t => onDeleteLocalTrack(t));
                  scan();
                  showToast?.(`Deleted ${selected.length} offline tracks`);
                  clearSelection();
                }}
              />
            )}
          </div>
        </>
      )}

      {renaming && ReactDOM.createPortal(
        <div className="yt-import-modal-overlay" style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.85)"}} onClick={()=>setRenaming(null)}>
          <div className="yt-import-modal-container" style={{width:"380px",borderRadius:"16px",overflow:"hidden",boxShadow:"0 16px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)",background:"var(--v-bg2)"}} onClick={e => e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:"14px",padding:"20px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.01)"}}>
              <div style={{flex:1}}>
                <h2 style={{fontSize:"15px",fontWeight:800,color:"#e2ddd9",margin:0,letterSpacing:"-0.01em"}}>Edit Track Metadata</h2>
                <p style={{fontSize:"11.5px",color:"#8a817c",margin:"2px 0 0 0",lineHeight:1.2}}>Change the title and artist of this local track.</p>
              </div>
              <button
                onClick={()=>setRenaming(null)}
                style={{
                  width:"28px",
                  height:"28px",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center",
                  borderRadius:"50%",
                  border:"none",
                  background:renameCloseHovered?"rgba(255, 255, 255, 0.08)":"transparent",
                  color:renameCloseHovered?"#fff":"#8a817c",
                  cursor:"pointer",
                  transition:"all 0.2s ease"
                }}
                onMouseEnter={() => setRenameCloseHovered(true)}
                onMouseLeave={() => setRenameCloseHovered(false)}
              >
                <X size={15} />
              </button>
            </div>
            <div style={{padding:"24px",display:"flex",flexDirection:"column",gap:"16px"}}>
              <div>
                <label style={{display:"block",fontSize:"10px",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#8a817c",marginBottom:"6px"}}>Track Title</label>
                <input autoFocus type="text" value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                  onFocus={() => setRenameInputFocused(true)}
                  onBlur={() => setRenameInputFocused(false)}
                  onKeyDown={e=>{if(e.key==='Enter')confirmRename();if(e.key==='Escape')setRenaming(null);}}
                  style={{
                    width:"100%",
                    background:"rgba(28, 26, 26, 0.6)",
                    border:`1px solid ${renameInputFocused?'#e2ddd9':'var(--v-bdr2)'}`,
                    boxShadow:renameInputFocused?'0 0 0 2px rgba(226, 221, 217, 0.15)':'none',
                    color:"#e2ddd9",
                    borderRadius:"8px",
                    padding:"10px 12px",
                    fontSize:"13px",
                    outline:"none",
                    transition:"all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    boxSizing:"border-box"
                  }}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:"10px",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#8a817c",marginBottom:"6px"}}>Track Artist</label>
                <input type="text" value={renameArtistVal} onChange={e=>setRenameArtistVal(e.target.value)}
                  onFocus={() => setRenameArtistInputFocused(true)}
                  onBlur={() => setRenameArtistInputFocused(false)}
                  onKeyDown={e=>{if(e.key==='Enter')confirmRename();if(e.key==='Escape')setRenaming(null);}}
                  style={{
                    width:"100%",
                    background:"rgba(28, 26, 26, 0.6)",
                    border:`1px solid ${renameArtistInputFocused?'#e2ddd9':'var(--v-bdr2)'}`,
                    boxShadow:renameArtistInputFocused?'0 0 0 2px rgba(226, 221, 217, 0.15)':'none',
                    color:"#e2ddd9",
                    borderRadius:"8px",
                    padding:"10px 12px",
                    fontSize:"13px",
                    outline:"none",
                    transition:"all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    boxSizing:"border-box"
                  }}/>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:"8px",padding:"16px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.005)"}}>
              <button onClick={()=>setRenaming(null)}
                style={{
                  padding:"9px 16px",
                  borderRadius:"8px",
                  border:`1px solid ${renameCancelHovered?'#3a3532':'var(--v-bdr2)'}`,
                  color:renameCancelHovered?"#e2ddd9":"#8a817c",
                  background:renameCancelHovered?"rgba(255,255,255,0.03)":"transparent",
                  fontWeight:600,
                  cursor:"pointer",
                  fontSize:"12.5px",
                  transition:"all 0.2s ease"
                }}
                onMouseEnter={() => setRenameCancelHovered(true)}
                onMouseLeave={() => setRenameCancelHovered(false)}
              >
                Cancel
              </button>
              <button onClick={confirmRename} disabled={!renameVal.trim()}
                style={{
                  padding:"9px 16px",
                  borderRadius:"8px",
                  background:!renameVal.trim()?"rgba(226,221,217,0.3)":(renameSaveHovered?"#fff":"#e2ddd9"),
                  border:"none",
                  color:"var(--v-bg0)",
                  fontWeight:700,
                  cursor:!renameVal.trim()?"not-allowed":"pointer",
                  fontSize:"12.5px",
                  transition:"all 0.2s ease",
                  boxShadow:renameVal.trim()?"0 4px 12px rgba(226, 221, 217, 0.2)":"none"
                }}
                onMouseEnter={() => setRenameSaveHovered(true)}
                onMouseLeave={() => setRenameSaveHovered(false)}
              >
                Rename
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});
