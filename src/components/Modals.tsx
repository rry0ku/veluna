import React, { useState, useEffect, useRef } from 'react';
import { PlusCircle, ChevronDown, FileOutput, Upload, X, CheckCircle2, Trash2, Minus } from 'lucide-react';
import { Track } from '../types';
import { cleanArtist } from '../utils';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

export function ImportResultModal({
  matchedCount, failedCount,
  onSave, onClose,
}: { matchedCount: number; failedCount: number; onSave: (name: string, desc: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div style={{position:"fixed",inset:0,zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:"rgba(var(--v-bg0-rgb),0.9)"}}>
      <div style={{width:"380px",maxWidth:"calc(100vw - 32px)",maxHeight:"calc(100vh - 120px)",borderRadius:"14px",overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,0.95)",background:"var(--v-bg2)",border:"1px solid var(--v-bdr2)",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid var(--v-bdr2)"}}>
          <h2 style={{fontSize:"14px",fontWeight:700,color:"#e2ddd9",margin:0}}>Save Playlist</h2>
          <p style={{fontSize:"11px",color:"#5c5755",marginTop:"3px"}}>
            <span style={{color:"#9e9894",fontWeight:700}}>{matchedCount}</span> tracks matched
            {failedCount>0&&<span style={{color:"#363230"}}> · {failedCount} not found</span>}
          </p>
        </div>
        <div style={{padding:"14px 18px",display:"flex",flexDirection:"column",gap:"10px"}}>
          <div>
            <label style={{fontSize:"9.5px",fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"#5c5755",display:"block",marginBottom:"6px"}}>Playlist Name</label>
            <input ref={inputRef} value={name} onChange={e=>setName(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&name.trim())onSave(name.trim(),desc.trim());}}
              placeholder="My Playlist" maxLength={80}
              style={{width:"100%",background:"var(--v-bdr2)",border:"1px solid var(--v-bdr2)",borderRadius:"8px",padding:"8px 10px",fontSize:"13px",color:"#e2ddd9",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:"9.5px",fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"#5c5755",display:"block",marginBottom:"6px"}}>Description <span style={{color:"#363230",textTransform:"none",fontWeight:400}}>(optional)</span></label>
            <input value={desc} onChange={e=>setDesc(e.target.value)}
              placeholder="e.g. Chill vibes, road trip..." maxLength={160}
              style={{width:"100%",background:"var(--v-bdr2)",border:"1px solid var(--v-bdr2)",borderRadius:"8px",padding:"8px 10px",fontSize:"13px",color:"#e2ddd9",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:"8px",marginTop:"4px"}}>
            <button onClick={onClose}
              style={{flex:1,padding:"8px",borderRadius:"8px",border:"1px solid var(--v-bdr2)",color:"#5c5755",background:"transparent",fontWeight:600,cursor:"pointer",fontSize:"12px",transition:"border-color .12s,color .12s"}}
              onMouseEnter={e=>{e.currentTarget.style.color="#9e9894";e.currentTarget.style.borderColor="var(--v-bdr3)";}}
              onMouseLeave={e=>{e.currentTarget.style.color="#5c5755";e.currentTarget.style.borderColor="var(--v-bdr2)";}}>
              Cancel
            </button>
            <button
              onClick={() => { if (name.trim()) onSave(name.trim(), desc.trim()); }}
              disabled={!name.trim()}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: "8px",
                border: "none",
                background: "var(--v-accent)",
                color: "#000000",
                fontWeight: 700,
                cursor: name.trim() ? "pointer" : "not-allowed",
                fontSize: "12px",
                opacity: name.trim() ? 1 : 0.35,
                boxShadow: name.trim() ? "0 2px 10px rgba(0,0,0,0.3)" : "none",
                transition: "all .15s ease"
              }}
              onMouseEnter={e => { if (name.trim()) (e.currentTarget as HTMLElement).style.opacity = '0.9'; }}
              onMouseLeave={e => { if (name.trim()) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              Save Playlist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ImportButton({ onSpotify, onYoutube, onM3u }: {
  onSpotify: () => void; onYoutube: () => void; onM3u: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} style={{marginTop:'12px',flexShrink:0,position:'relative'}}>
      <button onClick={() => setOpen(o => !o)}
        style={{width:'100%',borderRadius:'8px',border:`1px solid ${open?'var(--v-bdr3)':'var(--v-bdr2)'}`,padding:'7px 11px',display:'flex',alignItems:'center',gap:'8px',background:open?'rgba(226,221,217,0.04)':'transparent',color:open?'#e2ddd9':'#5c5755',cursor:'pointer',fontSize:'12px',fontWeight:600,transition:'border-color .12s,color .12s,background .12s'}}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.borderColor = 'var(--v-bdr3)';
            e.currentTarget.style.color = '#9e9894';
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = 'var(--v-bdr2)';
            e.currentTarget.style.color = '#5c5755';
          }
        }}>
        <PlusCircle size={13} />
        <span style={{flex:1,textAlign:'left'}}>Import Playlist</span>
        <ChevronDown size={12} style={{transition:'transform .2s',transform:open?'rotate(180deg)':'none'}} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: 0,
          marginBottom: '6px',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--v-bg1)',
          border: '1px solid var(--v-bdr)',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
          animation: 'fadeUpSm 0.15s ease-out',
          zIndex: 10
        }}>
          {[
            { label:'From Spotify', icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>, action:()=>{onSpotify();setOpen(false);} },
            { label:'From YouTube', icon:<svg width="14" height="14" viewBox="0 0 24 24" style={{flexShrink:0}}><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#ff0000"/><polygon points="9.545,8.432 15.818,12 9.545,15.568" fill="#ffffff"/></svg>, action:()=>{onYoutube();setOpen(false);} },
            { label:'From M3U File', icon:<FileOutput size={13} style={{color:'#9e9894'}} />, action:()=>{onM3u();setOpen(false);} },
          ].map(({label,icon,action}, idx)=>(
            <button key={label} onClick={action}
              style={{
                width: '100%',
                border: 'none',
                borderTop: idx !== 0 ? '1px solid var(--v-bdr)' : 'none',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'transparent',
                color: '#9e9894',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                textAlign: 'left',
                transition: 'background .15s, color .15s'
              }}
              onMouseEnter={e=>{
                (e.currentTarget as HTMLElement).style.background='rgba(255, 255, 255, 0.02)';
                (e.currentTarget as HTMLElement).style.color='var(--v-accent)';
              }}
              onMouseLeave={e=>{
                (e.currentTarget as HTMLElement).style.background='transparent';
                (e.currentTarget as HTMLElement).style.color='#9e9894';
              }}>
              <span style={{display:'flex',alignItems:'center',justifyContent:'center',width:'16px',height:'16px',flexShrink:0}}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CopyButton({ text, label, icon: Icon, disabled = false }: {
  text: string; label: string; icon: React.ElementType; disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);
  const handleCopy = async () => {
    if (!text || disabled) return;
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { const el = document.createElement('textarea'); el.value = text; el.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); }
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button onClick={handleCopy} disabled={disabled}
      style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"7px",padding:"9px",borderRadius:"9999px",border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.05)",color:copied?"rgba(255,255,255,0.8)":"rgba(255,255,255,0.4)",fontSize:"12px",fontWeight:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.3:1,transition:"all .12s",width:"100%"}}
      onMouseEnter={e=>{if(!disabled){e.currentTarget.style.background="rgba(255,255,255,0.09)";e.currentTarget.style.color="rgba(255,255,255,0.8)";}}}
      onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color=copied?"rgba(255,255,255,0.8)":"rgba(255,255,255,0.4)";}}>
      {copied ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Copied!</> : <><Icon size={13}/>{label}</>}
    </button>
  );
}

export function CsvImportModal({
  onClose,
  onSavePlaylist,
  showToast,
  onProgress,
  visible = true,
  onAbort,
  registerAbort,
  droppedBatch,
  onStartImport,
  onFinishImport,
}: {
  onClose: () => void;
  onSavePlaylist: (name: string, desc: string, tracks: Track[]) => void;
  showToast: (m: string) => void;
  onProgress?: (progress: { currentFile: number; totalFiles: number; matchedTracks: number; totalTracks: number; fileName: string } | null) => void;
  visible?: boolean;
  onAbort?: () => void;
  registerAbort?: (fn: () => void) => void;
  droppedBatch?: { id: number; items: { name: string; getText: () => Promise<string> }[] } | null;
  onStartImport?: (info: { currentFile: number; totalFiles: number; matchedTracks: number; totalTracks: number; fileName: string }) => void;
  onFinishImport?: () => void;
}) {
  const [phase, setPhase] = useState<'instructions' | 'matching' | 'done'>('instructions');
  const [activeImportInfo, setActiveImportInfo] = useState<{
    fileName: string;
    fileIndex: number;
    totalFiles: number;
    matchedCount: number;
    failedCount: number;
    totalTracks: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const abortRef = useRef(false);
  const isProcessingRef = useRef(false);
  const lastProcessedBatchIdRef = useRef<number>(0);
  const activeSemaphoreRef = useRef<{ drain: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevVisibleRef = useRef(visible);
  const [isUploadHovered, setIsUploadHovered] = useState(false);
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const [isMinHovered, setIsMinHovered] = useState(false);

  useEffect(() => {
    if (registerAbort) {
      registerAbort(() => {
        abortRef.current = true;
        if (activeSemaphoreRef.current) {
          activeSemaphoreRef.current.drain();
        }
        setPhase('instructions');
        setActiveImportInfo(null);
        onProgress?.(null);
      });
    }
  }, [registerAbort, onProgress]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  useEffect(() => {
    if (!prevVisibleRef.current && visible) {
      setPhase('instructions');
      setActiveImportInfo(null);
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (activeSemaphoreRef.current) {
        activeSemaphoreRef.current.drain();
      }
    };
  }, []);

  const cleanQueryTerm = (s: string) => {
    return s
      .replace(/\s*[\(\[](official\s*)?(music\s*)?(video|audio|lyric|lyrics|visualizer|hd|4k|remastered|explicit|clean|live)[^\)\]]*[\)\]]/gi, '')
      .replace(/\s*-\s*(remastered|live|mono|stereo|anniversary).*$/i, '')
      .trim();
  };

  const pickBestMatch = (lines: string[], title: string, artist: string): { id: string; duration: string } | null => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const cTitle = cleanQueryTerm(title);
    const cArtist = cleanQueryTerm(artist);
    const tNorm = norm(cTitle || title);
    const aNorm = norm(cArtist || artist);

    let bestId: string | null = null;
    let bestDuration = '0:00';
    let bestScore = -999;

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('====');
      if (parts.length < 4) continue;
      const rTitle = norm(parts[0] || '');
      const rArtist = norm(parts[1] || '');
      const rDur = parts[2]?.trim() || '0:00';
      const id = parts[3]?.trim();
      if (!id || id.length !== 11) continue;

      let score = 0;

      if (rTitle === tNorm) {
        score += 12;
      } else if (rTitle.includes(tNorm) || tNorm.includes(rTitle)) {
        score += 6;
      }

      if (aNorm) {
        if (rArtist === aNorm || rArtist.includes(aNorm) || aNorm.includes(rArtist)) {
          score += 6;
        } else if (rTitle.includes(aNorm)) {
          score += 4;
        }
      }

      if (rTitle.includes('official audio') || rTitle.includes('official track') || rTitle.includes('provided to youtube')) {
        score += 4;
      } else if (rTitle.includes('official video') || rTitle.includes('official music video') || rTitle.includes('lyrics')) {
        score += 2;
      }
      if (rArtist.includes('topic') || rArtist.includes('vevo')) {
        score += 3;
      }

      const tLower = title.toLowerCase();
      if (!tLower.includes('cover') && (rTitle.includes('cover') || rTitle.includes('acoustic cover') || rTitle.includes('tribute'))) {
        score -= 8;
      }
      if (!tLower.includes('remix') && (rTitle.includes('remix') || rTitle.includes('edit') || rTitle.includes('slowed') || rTitle.includes('reverb') || rTitle.includes('nightcore') || rTitle.includes('sped up'))) {
        score -= 6;
      }
      if (!tLower.includes('instrumental') && (rTitle.includes('instrumental') || rTitle.includes('karaoke'))) {
        score -= 8;
      }
      if (!tLower.includes('live') && (rTitle.includes('live at') || rTitle.includes('live in') || rTitle.includes('live performance') || rTitle.includes('reaction'))) {
        score -= 6;
      }

      if (score > bestScore) {
        bestScore = score;
        bestId = id;
        bestDuration = rDur;
      }
    }

    if (bestId && bestScore >= 4) {
      return { id: bestId, duration: bestDuration };
    }

    return null;
  };

  const processCsvItems = async (items: { name: string; getText: () => Promise<string> }[]) => {
    if (items.length === 0) {
      showToast('Please upload or drop valid .csv files');
      return;
    }
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const firstItemName = items[0]?.name.replace(/\.[^/.]+$/, '').trim() || 'Spotify Playlist';
      onStartImport?.({
        currentFile: 1,
        totalFiles: items.length,
        matchedTracks: 0,
        totalTracks: 0,
        fileName: firstItemName,
      });

      setPhase('matching');
      abortRef.current = false;
      const CONCURRENCY = 12;
      const matchCache = new Map<string, { id: string; duration: string } | null>();
      const savedInBatch = new Set<string>();

      let totalSavedPlaylists = 0;

    for (let fIdx = 0; fIdx < items.length; fIdx++) {
      if (abortRef.current) break;
      const item = items[fIdx];
      const fileNameClean = item.name.replace(/\.[^/.]+$/, '').trim() || 'Spotify Playlist';

      let text = '';
      try {
        text = await item.getText();
      } catch (e) {
        if (abortRef.current) break;
        showToast(`Failed to read ${item.name}: ${e}`);
        continue;
      }
      if (abortRef.current) break;

      let raw: string;
      try {
        raw = await invoke<string>('import_csv_playlist', { csvContent: text });
      } catch (e) {
        if (abortRef.current) break;
        showToast(`Failed to parse ${item.name}: ${e}`);
        continue;
      }
      if (abortRef.current) break;

      const lines = raw.trim().split('\n').filter(Boolean);
      let trackLines = lines;
      let playlistName = fileNameClean;
      if (lines[0]?.startsWith('PLAYLIST:')) {
        const customTitle = lines[0].replace('PLAYLIST:', '').trim();
        if (customTitle && customTitle !== 'Spotify Import') {
          playlistName = customTitle;
        }
        trackLines = lines.slice(1);
      }
      if (trackLines.length === 0) continue;

      const initial = trackLines.map(l => {
        const [title, artist] = l.split('====');
        return { title: title?.trim() || '', artist: cleanArtist(artist), status: 'pending' as const };
      });

      if (abortRef.current) break;

      const total = initial.length;
      let completed = 0;
      const matched: (Track | null)[] = new Array(total).fill(null);
      let failed = 0;

      setActiveImportInfo({
        fileName: playlistName,
        fileIndex: fIdx + 1,
        totalFiles: items.length,
        matchedCount: 0,
        failedCount: 0,
        totalTracks: total,
      });

      onProgress?.({
        currentFile: fIdx + 1,
        totalFiles: items.length,
        matchedTracks: 0,
        totalTracks: total,
        fileName: playlistName,
      });

      const processTrack = async (track: typeof initial[0], i: number): Promise<void> => {
        if (abortRef.current) return;
        try {
          const cacheKey = `${track.title}|||${track.artist}`.toLowerCase();
          let matchResult: { id: string; duration: string } | null | undefined = matchCache.get(cacheKey);

          if (matchResult === undefined) {
            const cleanTitle = cleanQueryTerm(track.title);
            const cleanArt = cleanArtist(track.artist);
            const q = cleanArt ? `${cleanTitle} ${cleanArt}` : cleanTitle;
            const res: string = await invoke('search_youtube', { query: q });
            if (abortRef.current) return;
            const resLines = res.trim().split('\n').filter(Boolean).slice(0, 5);
            matchResult = pickBestMatch(resLines, track.title, track.artist);
            matchCache.set(cacheKey, matchResult);
          }

          if (abortRef.current) return;
          if (matchResult && matchResult.id) {
            const t: Track = {
              id: i,
              title: track.title,
              artist: track.artist,
              duration: matchResult.duration || '0:00',
              url: `https://youtube.com/watch?v=${matchResult.id}`,
              cover: `https://i.ytimg.com/vi/${matchResult.id}/mqdefault.jpg`,
            };
            matched[i] = t;
          } else {
            failed++;
          }
        } catch {
          if (abortRef.current) return;
          failed++;
        }
        if (abortRef.current) return;
        completed++;
        if (!abortRef.current) {
          const matchedCount = matched.filter(Boolean).length;
          setActiveImportInfo({
            fileName: playlistName,
            fileIndex: fIdx + 1,
            totalFiles: items.length,
            matchedCount,
            failedCount: failed,
            totalTracks: total,
          });
          onProgress?.({
            currentFile: fIdx + 1,
            totalFiles: items.length,
            matchedTracks: matchedCount,
            totalTracks: total,
            fileName: playlistName,
          });
        }
      };

      const semaphore = {
        running: 0,
        queue: [] as (() => void)[],
        acquire() {
          if (abortRef.current) return Promise.resolve();
          return new Promise<void>(r => {
            if (this.running < CONCURRENCY) {
              this.running++;
              r();
            } else {
              this.queue.push(r);
            }
          });
        },
        release() {
          this.running--;
          const next = this.queue.shift();
          if (next) {
            this.running++;
            next();
          }
        },
        drain() {
          while (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) next();
          }
        },
      };
      activeSemaphoreRef.current = semaphore;

      await Promise.all(initial.map(async (track, i) => {
        await semaphore.acquire();
        try {
          if (abortRef.current) return;
          await processTrack(track, i);
        }
        finally { semaphore.release(); }
      }));

      activeSemaphoreRef.current = null;

      if (abortRef.current) break;

      const finalMatched = matched.filter((t): t is Track => t !== null);
      if (finalMatched.length > 0 && !savedInBatch.has(playlistName)) {
        savedInBatch.add(playlistName);
        onSavePlaylist(playlistName, 'Imported from Spotify', finalMatched);
        totalSavedPlaylists++;
      }
    }

    if (abortRef.current) {
      onProgress?.(null);
      return;
    }

    setPhase('done');
    onProgress?.(null);
    if (totalSavedPlaylists > 0) {
      showToast(`Imported ${totalSavedPlaylists} playlist${totalSavedPlaylists > 1 ? 's' : ''} from Spotify`);
    }
    setTimeout(() => {
      onClose();
    }, 600);
    } finally {
      isProcessingRef.current = false;
      onFinishImport?.();
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    const fileList = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.csv'));
    if (fileList.length === 0) {
      showToast('Please upload valid .csv files');
      return;
    }
    const uniqueFiles: File[] = [];
    const seen = new Set<string>();
    for (const f of fileList) {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        uniqueFiles.push(f);
      }
    }
    processCsvItems(uniqueFiles.map(f => ({ name: f.name, getText: () => f.text() })));
  };

  useEffect(() => {
    if (droppedBatch && droppedBatch.id !== lastProcessedBatchIdRef.current) {
      lastProcessedBatchIdRef.current = droppedBatch.id;
      processCsvItems(droppedBatch.items);
    }
  }, [droppedBatch]);

  return (
    <>
    <div
      className="yt-import-modal-overlay"
      style={{position:"fixed",inset:0,zIndex:9999,display:visible?"flex":"none",alignItems:"center",justifyContent:"center",padding:"16px",background:"rgba(0,0,0,0.85)"}}
      onClick={phase==='matching'?undefined:onClose}
    >
      <div
        className="yt-import-modal-container"
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
        style={{
          width:"640px",
          maxWidth:"calc(100vw - 32px)",
          maxHeight:"calc(100vh - 120px)",
          display:"flex",
          flexDirection:"column",
          borderRadius:"16px",
          overflow:"hidden",
          boxShadow:"0 16px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)",
          background:"var(--v-bg2)",
          border: isDragging ? '1px dashed #1db954' : '1px solid transparent',
          transition: 'border-color 0.15s ease'
        }}
        onClick={e => e.stopPropagation()}
      >

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
            <div style={{width:"34px",height:"34px",borderRadius:"9px",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg, #1db954 0%, #191414 100%)",boxShadow:"0 0 14px rgba(29,185,84,0.3)"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
            </div>
            <h2 style={{fontSize:"15px",fontWeight:800,color:"#e2ddd9",margin:0,letterSpacing:"-0.01em"}}>Import Spotify Playlist</h2>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            {phase === 'matching' && (
              <button onClick={onClose} title="Minimize, import continues in background"
                onMouseEnter={() => setIsMinHovered(true)}
                onMouseLeave={() => setIsMinHovered(false)}
                style={{
                  width:"28px",
                  height:"28px",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center",
                  borderRadius:"50%",
                  border:"none",
                  background: isMinHovered ? "rgba(255,255,255,0.08)" : "transparent",
                  color: isMinHovered ? "#fff" : "#5c5755",
                  cursor:"pointer",
                  transition:"all 0.2s ease"
                }}>
                <Minus size={14} />
              </button>
            )}
            <button onClick={() => {
              if (phase === 'matching') {
                abortRef.current = true;
                if (activeSemaphoreRef.current) {
                  activeSemaphoreRef.current.drain();
                }
                onProgress?.(null);
                if (onAbort) {
                  onAbort();
                } else {
                  onClose();
                }
              } else {
                onClose();
              }
            }}
              onMouseEnter={() => setIsCloseHovered(true)}
              onMouseLeave={() => setIsCloseHovered(false)}
              style={{
                width:"28px",
                height:"28px",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                borderRadius:"50%",
                border:"none",
                background: isCloseHovered ? (phase === 'matching' ? "rgba(255, 96, 96, 0.15)" : "rgba(255, 255, 255, 0.08)") : "transparent",
                color: isCloseHovered ? (phase === 'matching' ? "#ff6060" : "#fff") : "#5c5755",
                cursor:"pointer",
                transform: isCloseHovered ? "rotate(90deg)" : "none",
                transition:"all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
              }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {phase === 'instructions' && (
          <div style={{flex:1,display:"flex",flexDirection:"column",padding:"20px",gap:"16px",overflowY:"auto"}} className="custom-scrollbar">
            <p style={{fontSize:"13px",color:"#9e9894",lineHeight:1.6,margin:0}}>
              Veluna uses <span style={{color:"#e2ddd9",fontWeight:600}}>Exportify</span> to import Spotify playlists, no extra software needed.
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
              {[
                { n: '1', title: 'Go to Exportify', desc: 'Open exportify.net in your browser', link: 'https://exportify.net', linkLabel: 'exportify.net →' },
                { n: '2', title: 'Log in with Spotify', desc: 'Click "Log in with Spotify" and authorise Exportify to read your playlists.' },
                { n: '3', title: 'Export your playlist', desc: 'Find the playlist and click the green Export button. A .csv file will download.' },
                { n: '4', title: 'Upload the CSV here', desc: 'Click the button below and select the downloaded .csv file(s).' },
              ].map(step => (
                <div key={step.n} style={{display:"flex",gap:"14px",alignItems:"flex-start"}}>
                  <div style={{
                    width:"26px",
                    height:"26px",
                    borderRadius:"50%",
                    display:"flex",
                    alignItems:"center",
                    justifyContent:"center",
                    flexShrink:0,
                    fontSize:"11px",
                    fontWeight:700,
                    marginTop:"2px",
                    background:"rgba(29, 185, 84, 0.1)",
                    border:"1px solid rgba(29, 185, 84, 0.3)",
                    color:"#1db954"
                  }}>{step.n}</div>
                  <div style={{flex:1}}>
                    <p style={{fontSize:"13px",fontWeight:700,color:"#e2ddd9",margin:0}}>{step.title}</p>
                    <p style={{fontSize:"11.5px",color:"rgba(255,255,255,0.4)",marginTop:"4px",margin:0,lineHeight:1.5}}>{step.desc}</p>
                    {step.link && (
                      <button onClick={() => openUrl(step.link!).catch(() => window.open(step.link!, '_blank'))}
                        className="exportify-btn"
                        style={{
                          fontSize:"12px",
                          marginTop:"10px",
                          display:"inline-flex",
                          alignItems:"center",
                          gap:"4px",
                          fontWeight:700,
                          cursor:"pointer",
                          color:"#1db954",
                          background:"rgba(29, 185, 84, 0.08)",
                          border:"1px solid rgba(29, 185, 84, 0.2)",
                          borderRadius:"8px",
                          padding:"5px 12px",
                          transition:"all 0.2s ease"
                        }}>
                        {step.linkLabel}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <input ref={fileInputRef} type="file" accept=".csv" multiple style={{display:"none"}}
              onChange={e => { if (e.target.files?.length) { handleFiles(e.target.files); e.target.value = ''; } }} />
            <div
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={() => setIsUploadHovered(true)}
              onMouseLeave={() => setIsUploadHovered(false)}
              style={{
                marginTop:"12px",
                padding:"18px 16px",
                borderRadius:"12px",
                border: isDragging ? "2px dashed #1db954" : isUploadHovered ? "1.5px dashed rgba(29, 185, 84, 0.6)" : "1.5px dashed rgba(255,255,255,0.15)",
                background: isDragging ? "rgba(29, 185, 84, 0.12)" : isUploadHovered ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                display:"flex",
                flexDirection:"column",
                alignItems:"center",
                justifyContent:"center",
                gap:"8px",
                cursor:"pointer",
                transition:"all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
              }}
            >
              <div style={{
                width:"38px",
                height:"38px",
                borderRadius:"50%",
                background: isDragging ? "#1db954" : "rgba(29, 185, 84, 0.15)",
                color: isDragging ? "#000" : "#1db954",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                transition:"all 0.2s ease"
              }}>
                <Upload size={17} />
              </div>
              <div style={{textAlign:"center"}}>
                <p style={{fontSize:"13px",fontWeight:700,color:"#e2ddd9",margin:0}}>
                  {isDragging ? "Drop your CSV files now" : "Drag & drop multiple .csv files here"}
                </p>
                <p style={{fontSize:"11.5px",color:"var(--v-fg3)",margin:"4px 0 0"}}>
                  or click to select multiple files from your computer
                </p>
              </div>
            </div>
          </div>
        )}

        {(phase === 'matching' || phase === 'done') && (
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "36px 28px",
            gap: "20px"
          }}>
            <div style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: phase === 'done' ? "rgba(29, 185, 84, 0.15)" : "rgba(29, 185, 84, 0.1)",
              border: "1px solid rgba(29, 185, 84, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 24px rgba(29, 185, 84, 0.2)"
            }}>
              {phase === 'done' ? (
                <CheckCircle2 size={30} style={{ color: "#1ed760" }} />
              ) : (
                <svg width="30" height="30" viewBox="0 0 24 24" fill="#1ed760">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
              )}
            </div>

            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#e2ddd9", margin: 0 }}>
                {phase === 'done'
                  ? "Import Complete"
                  : `Importing from "${activeImportInfo?.fileName || 'Spotify Playlist'}"`}
              </h3>
              <p style={{ fontSize: "13px", color: "var(--v-fg2)", margin: 0 }}>
                {phase === 'done' ? (
                  `Saved to your library with ${activeImportInfo?.matchedCount || 0} songs`
                ) : (
                  <>
                    <span>
                      {activeImportInfo?.matchedCount || 0} of {activeImportInfo?.totalTracks || 0} songs imported
                    </span>
                    <span style={{ color: "#1db954", fontWeight: 600, marginLeft: "6px" }}>
                      ({activeImportInfo && activeImportInfo.totalTracks > 0
                        ? Math.round(((activeImportInfo.matchedCount + activeImportInfo.failedCount) / activeImportInfo.totalTracks) * 100)
                        : 0}%)
                    </span>
                    {activeImportInfo && activeImportInfo.totalFiles > 1 && (
                      <span style={{ color: "var(--v-fg3)", marginLeft: "8px" }}>
                        · File {activeImportInfo.fileIndex} of {activeImportInfo.totalFiles}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>

            <div style={{ width: "100%", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{
                height: "6px",
                borderRadius: "3px",
                background: "rgba(255, 255, 255, 0.08)",
                overflow: "hidden"
              }}>
                <div style={{
                  height: "100%",
                  borderRadius: "3px",
                  transition: "width 0.2s ease",
                  width: `${
                    phase === 'done'
                      ? 100
                      : activeImportInfo && activeImportInfo.totalTracks > 0
                      ? ((activeImportInfo.matchedCount + activeImportInfo.failedCount) / activeImportInfo.totalTracks) * 100
                      : 0
                  }%`,
                  background: "linear-gradient(90deg, #1db954 0%, #1ed760 100%)",
                  boxShadow: "0 0 12px rgba(29, 185, 84, 0.4)"
                }} />
              </div>
            </div>

            {phase === 'matching' && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                <button
                  onClick={onClose}
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "7px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    background: "rgba(255, 255, 255, 0.05)",
                    color: "#e2ddd9",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"; }}
                >
                  Minimize to Background
                </button>
                <button
                  onClick={() => {
                    abortRef.current = true;
                    if (activeSemaphoreRef.current) activeSemaphoreRef.current.drain();
                    onProgress?.(null);
                    if (onAbort) onAbort();
                    else onClose();
                  }}
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "7px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 96, 96, 0.2)",
                    background: "rgba(255, 96, 96, 0.08)",
                    color: "#ff6060",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255, 96, 96, 0.18)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255, 96, 96, 0.08)"; }}
                >
                  Cancel Import
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

export function YtImportModal({
  onClose,
  onSavePlaylist,
  showToast,
  visible = true,
  onProgress,
  onAbort,
}: {
  onClose: () => void;
  onSavePlaylist: (name: string, desc: string, tracks: Track[]) => void;
  showToast: (m: string) => void;
  visible?: boolean;
  onProgress?: (progress: number | null) => void;
  onAbort?: () => void;
}) {
  const [phase, setPhase] = useState<'input' | 'loading' | 'done'>('input');
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isBtnHovered, setIsBtnHovered] = useState(false);
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const [isMinimizeHovered, setIsMinimizeHovered] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pulseOpacity, setPulseOpacity] = useState(0.4);
  const abortRef = useRef(false);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (phase !== 'loading') {
      setProgress(0);
      onProgress?.(null);
      return;
    }
    onProgress?.(progress);
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const nextVal = (() => {
          if (prev < 30) return prev + Math.floor(Math.random() * 8) + 4;
          if (prev < 60) return prev + Math.floor(Math.random() * 4) + 2;
          if (prev < 85) return prev + Math.floor(Math.random() * 2) + 1;
          if (prev < 95) return prev + 0.5;
          return prev;
        })();
        onProgress?.(nextVal);
        return nextVal;
      });
    }, 400);

    const pulseInterval = setInterval(() => {
      setPulseOpacity(p => p === 0.4 ? 0.8 : 0.4);
    }, 800);

    return () => {
      clearInterval(progressInterval);
      clearInterval(pulseInterval);
    };
  }, [phase]);

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!trimmed.includes('youtube.com') && !trimmed.includes('youtu.be')) {
      showToast('Please paste a YouTube playlist URL');
      return;
    }
    setPhase('loading');
    abortRef.current = false;
    try {
      const raw: string = await invoke('import_youtube_playlist', { url: trimmed });
      if (abortRef.current) return;
      const lines = raw.trim().split('\n').filter(Boolean);
      let detectedPlaylistName = '';

      const parsed = lines.map((l, idx) => {
        const parts = l.split('====');
        if (parts.length < 4) return null;
        const [id, rawTitle, duration, rawUploader, rawPlaylistTitle] = parts;
        const idTrim = id?.trim() || '';
        if (!idTrim || idTrim === 'NA' || idTrim.length < 5) return null;

        let titleStr = rawTitle?.trim() || 'Unknown Track';
        let artistStr = rawUploader?.trim() || '';

        const plTitleCandidate = rawPlaylistTitle?.trim();
        if (plTitleCandidate && plTitleCandidate !== 'YouTube Playlist' && plTitleCandidate !== 'NA' && !detectedPlaylistName) {
          detectedPlaylistName = plTitleCandidate;
        }

        if (artistStr.toLowerCase().endsWith(' - topic')) {
          artistStr = artistStr.slice(0, -8).trim();
        }
        if (artistStr.toLowerCase().endsWith('vevo')) {
          artistStr = artistStr.slice(0, -4).trim();
        }

        if (titleStr.includes(' - ')) {
          const dashIdx = titleStr.indexOf(' - ');
          const left = titleStr.slice(0, dashIdx).trim();
          const right = titleStr.slice(dashIdx + 3).trim();
          if (left && right) {
            artistStr = left;
            titleStr = right;
          }
        }

        titleStr = titleStr
          .replace(/\s*[\(\[](official\s*)?(music\s*)?(video|audio|lyric|lyrics|visualizer|hd|4k)?[\)\]]/gi, '')
          .replace(/\s*[\(\[]from\s+the\s+.*[\)\]]/gi, '')
          .trim() || titleStr;

        const cleaned = cleanArtist(artistStr);
        const finalArtist = cleaned ? cleaned : (artistStr && artistStr !== 'Unknown' && artistStr !== '?' ? artistStr : 'YouTube');
        const cover = `https://i.ytimg.com/vi/${idTrim}/mqdefault.jpg`;

        return {
          id: idx,
          title: titleStr,
          artist: finalArtist,
          duration: duration?.trim() || '0:00',
          url: `https://youtube.com/watch?v=${idTrim}`,
          cover,
          playlistTitle: detectedPlaylistName || plTitleCandidate || 'YouTube Playlist',
        };
      }).filter((t): t is NonNullable<typeof t> => t !== null);

      if (abortRef.current) return;
      if (parsed.length === 0) { showToast('No tracks found in playlist'); setPhase('input'); return; }

      const playlistName = detectedPlaylistName || parsed[0]?.playlistTitle || 'YouTube Import';
      const tracks: Track[] = parsed.map((r, i) => ({
        id: i, title: r.title, artist: r.artist || 'YouTube',
        duration: r.duration || '', url: r.url, cover: r.cover,
      }));

      onSavePlaylist(playlistName, `Imported from YouTube: ${trimmed}`, tracks);
      setPhase('done');
      onClose();
    } catch (e: any) {
      if (abortRef.current) return;
      const errMsg = typeof e === 'string' ? e : (e?.message || 'Import failed');
      showToast(`Import failed: ${errMsg}`);
      setPhase('input');
    }
  };

  const isYtUrl = url.includes('youtube.com') || url.includes('youtu.be');

  return (
    <>
    <div className="yt-import-modal-overlay" style={{position:"fixed",inset:0,zIndex:9999,display:visible?"flex":"none",alignItems:"center",justifyContent:"center",padding:"16px",background:"rgba(0,0,0,0.85)"}} onClick={phase==='loading'?undefined:onClose}>
      <div className="yt-import-modal-container" style={{width:"580px",maxWidth:"calc(100vw - 32px)",maxHeight:"calc(100vh - 120px)",display:"flex",flexDirection:"column",borderRadius:"16px",overflow:"hidden",boxShadow:"0 16px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)",background:"var(--v-bg2)"}}
        onClick={e => e.stopPropagation()}>

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0
        }}>
          <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
            <div style={{width:"30px",height:"30px",borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg, #ff1e27 0%, #b30c12 100%)",boxShadow:"0 0 10px rgba(255, 30, 39, 0.25)"}}>
              <svg width="15" height="12" viewBox="0 0 18 14" fill="white"><path d="M17.6 2.2C17.4 1.4 16.8.8 16 .6 14.6.2 9 .2 9 .2S3.4.2 2 .6C1.2.8.6 1.4.4 2.2 0 3.6 0 6.5 0 6.5s0 2.9.4 4.3c.2.8.8 1.4 1.6 1.6C3.4 12.8 9 12.8 9 12.8s5.6 0 7-.4c.8-.2 1.4-.8 1.6-1.6.4-1.4.4-4.3.4-4.3s0-2.9-.4-4.3zM7.2 9.3V3.7l4.7 2.8-4.7 2.8z"/></svg>
            </div>
            <h2 style={{fontSize: "15px", fontWeight: 800, color: "#e2ddd9", margin: 0, letterSpacing: "-0.01em"}}>
              Import YouTube Playlist
            </h2>
          </div>
          <div style={{display: "flex", alignItems: "center"}}>
            {phase === 'loading' && (
              <button
                onClick={onClose}
                title="Minimize import"
                onMouseEnter={() => setIsMinimizeHovered(true)}
                onMouseLeave={() => setIsMinimizeHovered(false)}
                style={{
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  border: "none",
                  background: isMinimizeHovered ? "rgba(255, 255, 255, 0.06)" : "transparent",
                  color: isMinimizeHovered ? "#fff" : "#5c5755",
                  cursor: "pointer",
                  marginRight: "4px",
                  transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
                }}
              >
                <Minus size={14} />
              </button>
            )}
            <button onClick={() => {
              if (phase === 'loading') {
                abortRef.current = true;
                if (onAbort) {
                  onAbort();
                } else {
                  onClose();
                }
              } else {
                onClose();
              }
            }}
              onMouseEnter={() => setIsCloseHovered(true)}
              onMouseLeave={() => setIsCloseHovered(false)}
              style={{
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                border: "none",
                background: isCloseHovered ? (phase === 'loading' ? "rgba(255, 96, 96, 0.15)" : "rgba(255, 255, 255, 0.06)") : "transparent",
                color: isCloseHovered ? (phase === 'loading' ? "#ff6060" : "#fff") : "#5c5755",
                cursor: "pointer",
                transform: isCloseHovered ? "rotate(90deg)" : "none",
                transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
              }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {phase === 'input' && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            padding: "20px 24px 24px 24px",
            gap: "16px",
            boxSizing: "border-box"
          }}>
            <p style={{fontSize: "13px", color: "#9e9894", lineHeight: 1.5, margin: 0}}>
              Paste a YouTube or YouTube Music playlist link to import your tracks.
            </p>

            <div className="yt-import-input-wrapper" style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "rgba(255, 255, 255, 0.02)",
              borderWidth: "1px",
              borderStyle: "solid",
              borderColor: isFocused ? "rgba(255, 30, 39, 0.4)" : "rgba(255, 255, 255, 0.06)",
              borderRadius: "10px",
              padding: "0 16px",
              height: "46px",
              boxShadow: isFocused ? "0 0 16px rgba(255, 30, 39, 0.12)" : "none",
              transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
            }}>
              <svg width="15" height="12" viewBox="0 0 18 14" fill={isFocused ? "#ff1e27" : "rgba(255, 255, 255, 0.35)"} style={{flexShrink: 0, transition: "fill 0.25s"}}>
                <path d="M17.6 2.2C17.4 1.4 16.8.8 16 .6 14.6.2 9 .2 9 .2S3.4.2 2 .6C1.2.8.6 1.4.4 2.2 0 3.6 0 6.5 0 6.5s0 2.9.4 4.3c.2.8.8 1.4 1.6 1.6C3.4 12.8 9 12.8 9 12.8s5.6 0 7-.4c.8-.2 1.4-.8 1.6-1.6.4-1.4.4-4.3.4-4.3s0-2.9-.4-4.3zM7.2 9.3V3.7l4.7 2.8-4.7 2.8z"/>
              </svg>
              <input ref={inputRef} value={url} onChange={e => setUrl(e.target.value)}
                className="yt-import-input"
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={e => { if (e.key === 'Enter' && isYtUrl) handleImport(); }}
                placeholder="https://youtube.com/playlist?list=..."
                style={{
                  flex: 1,
                  background: "transparent",
                  backgroundColor: "transparent",
                  fontSize: "13px",
                  color: "#e2ddd9",
                  outlineStyle: "none",
                  outlineWidth: 0,
                  outlineColor: "transparent",
                  borderStyle: "none",
                  borderWidth: 0,
                  borderColor: "transparent",
                  boxShadow: "none",
                  appearance: "none",
                  WebkitAppearance: "none",
                  fontWeight: 500
                }} />
            </div>

            <div style={{
              background: "rgba(255, 255, 255, 0.01)",
              border: "1px solid rgba(255, 255, 255, 0.03)",
              borderRadius: "10px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }}>
              {[
                "Playlist must be public or unlisted",
                "Veluna extracts metadata directly from web feeds"
              ].map((tip, i) => (
                <div key={i} style={{display: "flex", gap: "8px", alignItems: "center"}}>
                  <div style={{width: "4px", height: "4px", borderRadius: "50%", background: "#ff1e27"}} />
                  <div style={{fontSize: "11.5px", color: "#9e9894"}}>{tip}</div>
                </div>
              ))}
            </div>

            <button onClick={handleImport}
              disabled={!isYtUrl}
              onMouseEnter={() => setIsBtnHovered(true)}
              onMouseLeave={() => setIsBtnHovered(false)}
              style={{
                width: "100%",
                height: "46px",
                borderRadius: "10px",
                border: "none",
                background: isYtUrl ? "linear-gradient(135deg, #ff1e27 0%, #b30c12 100%)" : "rgba(255,255,255,0.03)",
                color: isYtUrl ? "#fff" : "rgba(255,255,255,0.25)",
                fontWeight: 700,
                fontSize: "13px",
                cursor: !isYtUrl ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: (isYtUrl && isBtnHovered) ? "0 8px 24px rgba(255, 30, 39, 0.35)" : "none",
                transform: (isYtUrl && isBtnHovered) ? "translateY(-1.5px)" : "none",
                transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
              }}>
              <svg width="14" height="11" viewBox="0 0 18 14" fill="currentColor">
                <path d="M17.6 2.2C17.4 1.4 16.8.8 16 .6 14.6.2 9 .2 9 .2S3.4.2 2 .6C1.2.8.6 1.4.4 2.2 0 3.6 0 6.5 0 6.5s0 2.9.4 4.3c.2.8.8 1.4 1.6 1.6C3.4 12.8 9 12.8 9 12.8s5.6 0 7-.4c.8-.2 1.4-.8 1.6-1.6.4-1.4.4-4.3.4-4.3s0-2.9-.4-4.3zM7.2 9.3V3.7l4.7 2.8-4.7 2.8z"/>
              </svg>
              Import Playlist
            </button>
          </div>
        )}

        {phase === 'loading' && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            padding: "24px",
            boxSizing: "border-box",
            overflow: "hidden"
          }}>
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px"}}>
              <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
                <div style={{width: "14px", height: "14px", border: "2px solid #ff1e27", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite"}} />
                <div style={{fontSize: "12.5px", color: "#e2ddd9", fontWeight: 700}}>
                  {progress < 25 ? "Connecting to YouTube..." :
                   progress < 55 ? "Fetching playlist tracks..." :
                   progress < 80 ? "Extracting metadata..." :
                   progress < 93 ? "Resolving artists & cover art..." :
                                   "Finishing import..."}
                </div>
              </div>
              <span style={{fontSize: "12px", color: "#ff1e27", fontWeight: 700, fontVariantNumeric: "tabular-nums"}}>
                {Math.round(progress)}%
              </span>
            </div>

            {/* YouTube Red Progress Bar */}
            <div style={{height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: "24px"}}>
              <div style={{
                height: "100%",
                borderRadius: "2px",
                background: "linear-gradient(90deg, #ff1e27 0%, #ff4b55 100%)",
                width: `${progress}%`,
                transition: "width 0.4s ease-out",
                boxShadow: "0 0 8px rgba(255,30,39,0.6)"
              }} />
            </div>

            <div style={{display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden"}}>
              {[1, 2, 3, 4].map(key => (
                <div key={key} className="yt-skeleton-card" style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.03)",
                  opacity: pulseOpacity,
                  transition: "opacity 0.8s ease-in-out"
                }}>
                  <div style={{
                    width: "48px",
                    height: "27px",
                    borderRadius: "6px",
                    background: "rgba(255, 255, 255, 0.06)",
                    flexShrink: 0
                  }} />
                  <div style={{flex: 1, display: "flex", flexDirection: "column", gap: "6px"}}>
                    <div style={{width: "60%", height: "8px", borderRadius: "4px", background: "rgba(255, 255, 255, 0.06)"}} />
                    <div style={{width: "35%", height: "6px", borderRadius: "3px", background: "rgba(255, 255, 255, 0.03)"}} />
                  </div>
                  <div style={{width: "24px", height: "8px", borderRadius: "4px", background: "rgba(255, 255, 255, 0.03)"}} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

export function MetadataEditModal({
  track,
  onSave,
  onClose
}: {
  track: Track;
  onSave: (title: string, artist: string, album: string) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(track.title || '');
  const [artist, setArtist] = useState(track.artist || '');
  const [album, setAlbum] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'title' | 'artist' | 'album' | null>(null);
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const [isCancelHovered, setIsCancelHovered] = useState(false);
  const [isSaveHovered, setIsSaveHovered] = useState(false);

  useEffect(() => {
    const path = track.url.substring(8);
    invoke<{ album: string }>('get_audio_metadata', { path })
      .then(m => {
        if (m.album) setAlbum(m.album);
      })
      .catch(() => {});
  }, [track]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      await onSave(title.trim(), artist.trim(), album.trim());
      onClose();
    } catch {}
    setLoading(false);
  };

  return (
    <div className="yt-import-modal-overlay" style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:"rgba(0,0,0,0.85)"}} onClick={onClose}>
      <div className="yt-import-modal-container" style={{width:"420px",maxWidth:"calc(100vw - 32px)",maxHeight:"calc(100vh - 120px)",display:"flex",flexDirection:"column",borderRadius:"16px",overflow:"hidden",boxShadow:"0 16px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)",background:"var(--v-bg2)"}} onClick={e => e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:"14px",padding:"20px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.01)"}}>
          <div style={{flex:1}}>
            <h2 style={{fontSize:"15px",fontWeight:800,color:"#e2ddd9",margin:0,letterSpacing:"-0.01em"}}>Edit Metadata</h2>
            <p style={{fontSize:"11.5px",color:"#8a817c",margin:"2px 0 0 0",lineHeight:1.2}}>Update ID3 audio tags on this file.</p>
          </div>
          <button
            onClick={onClose}
            style={{
              width:"28px",
              height:"28px",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              borderRadius:"50%",
              border:"none",
              background:isCloseHovered?"rgba(255, 255, 255, 0.08)":"transparent",
              color:isCloseHovered?"#fff":"#8a817c",
              cursor:"pointer",
              transition:"all 0.2s ease"
            }}
            onMouseEnter={() => setIsCloseHovered(true)}
            onMouseLeave={() => setIsCloseHovered(false)}
          >
            <X size={15} />
          </button>
        </div>
        <div style={{padding:"24px",display:"flex",flexDirection:"column",gap:"16px"}}>
          <div>
            <label style={{display:"block",fontSize:"10px",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#8a817c",marginBottom:"6px"}}>Title</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} disabled={loading}
              onFocus={() => setFocusedField('title')}
              onBlur={() => setFocusedField(null)}
              onKeyDown={e => { if (e.key === 'Enter' && title.trim() && !loading) handleSave(); }}
              style={{
                width:"100%",
                background:"rgba(28, 26, 26, 0.6)",
                border:`1px solid ${focusedField==='title'?'#e2ddd9':'var(--v-bdr2)'}`,
                boxShadow:focusedField==='title'?'0 0 0 2px rgba(226, 221, 217, 0.15)':'none',
                color:"#e2ddd9",
                borderRadius:"8px",
                padding:"10px 12px",
                fontSize:"13px",
                outline:"none",
                transition:"all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                boxSizing:"border-box"
              }}
            />
          </div>
          <div>
            <label style={{display:"block",fontSize:"10px",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#8a817c",marginBottom:"6px"}}>Artist</label>
            <input value={artist} onChange={e=>setArtist(e.target.value)} disabled={loading}
              onFocus={() => setFocusedField('artist')}
              onBlur={() => setFocusedField(null)}
              onKeyDown={e => { if (e.key === 'Enter' && title.trim() && !loading) handleSave(); }}
              style={{
                width:"100%",
                background:"rgba(28, 26, 26, 0.6)",
                border:`1px solid ${focusedField==='artist'?'#e2ddd9':'var(--v-bdr2)'}`,
                boxShadow:focusedField==='artist'?'0 0 0 2px rgba(226, 221, 217, 0.15)':'none',
                color:"#e2ddd9",
                borderRadius:"8px",
                padding:"10px 12px",
                fontSize:"13px",
                outline:"none",
                transition:"all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                boxSizing:"border-box"
              }}
            />
          </div>
          <div>
            <label style={{display:"block",fontSize:"10px",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"#8a817c",marginBottom:"6px"}}>Album</label>
            <input value={album} onChange={e=>setAlbum(e.target.value)} disabled={loading}
              onFocus={() => setFocusedField('album')}
              onBlur={() => setFocusedField(null)}
              onKeyDown={e => { if (e.key === 'Enter' && title.trim() && !loading) handleSave(); }}
              style={{
                width:"100%",
                background:"rgba(28, 26, 26, 0.6)",
                border:`1px solid ${focusedField==='album'?'#e2ddd9':'var(--v-bdr2)'}`,
                boxShadow:focusedField==='album'?'0 0 0 2px rgba(226, 221, 217, 0.15)':'none',
                color:"#e2ddd9",
                borderRadius:"8px",
                padding:"10px 12px",
                fontSize:"13px",
                outline:"none",
                transition:"all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                boxSizing:"border-box"
              }}
            />
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:"8px",padding:"16px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.005)"}}>
          <button onClick={onClose} disabled={loading}
            style={{
              padding:"9px 16px",
              borderRadius:"8px",
              border:`1px solid ${isCancelHovered?'#3a3532':'var(--v-bdr2)'}`,
              color:isCancelHovered?"#e2ddd9":"#8a817c",
              background:isCancelHovered?"rgba(255,255,255,0.03)":"transparent",
              fontWeight:600,
              cursor:"pointer",
              fontSize:"12.5px",
              transition:"all 0.2s ease"
            }}
            onMouseEnter={() => setIsCancelHovered(true)}
            onMouseLeave={() => setIsCancelHovered(false)}
          >
            Cancel
          </button>
          <button onClick={handleSave} disabled={loading || !title.trim()}
            style={{
              padding:"9px 16px",
              borderRadius:"8px",
              background:loading?"rgba(255,255,255,0.15)":"var(--v-accent)",
              border:"none",
              color:"#000000",
              fontWeight:700,
              cursor:(loading || !title.trim())?"not-allowed":"pointer",
              fontSize:"12.5px",
              opacity:(!loading && title.trim())?(isSaveHovered?0.9:1):0.35,
              transition:"all 0.2s ease",
              boxShadow:(!loading && title.trim())?"0 2px 10px rgba(0,0,0,0.3)":"none"
            }}
            onMouseEnter={() => setIsSaveHovered(true)}
            onMouseLeave={() => setIsSaveHovered(false)}
          >
            {loading ? 'Saving...' : 'Save Tags'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlaylistDeleteConfirmModal({
  isOpen,
  modalData,
  onClose,
  onConfirmDelete,
}: {
  isOpen: boolean;
  modalData: { ids: string[]; names: string[] } | null;
  onClose: () => void;
  onConfirmDelete: () => void;
}) {
  const [btnHovered, setBtnHovered] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || !modalData) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        onConfirmDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, modalData, onClose, onConfirmDelete]);

  if (!isOpen || !modalData) return null;

  const isMulti = modalData.ids.length > 1;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '380px',
          maxWidth: '90vw',
          borderRadius: '14px',
          overflow: 'hidden',
          background: 'var(--v-bg2)',
          border: '1px solid var(--v-bdr2)',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8a807c',
              flexShrink: 0
            }}
          >
            <Trash2 size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#e2ddd9', margin: 0 }}>
              {isMulti ? 'Delete Playlists?' : 'Delete Playlist?'}
            </h2>
            <p style={{ fontSize: '12px', color: '#8a807c', margin: '4px 0 0 0', lineHeight: 1.4 }}>
              {isMulti
                ? `Are you sure you want to delete these ${modalData.ids.length} playlists?`
                : `Are you sure you want to delete "${modalData.names[0]}"?`}
            </p>
          </div>
        </div>

        {isMulti && (
          <div
            style={{
              margin: '0 20px 16px 20px',
              maxHeight: '100px',
              overflowY: 'auto',
              padding: '8px 10px',
              borderRadius: '8px',
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
            className="custom-scrollbar"
          >
            {modalData.names.map((name, i) => (
              <div
                key={i}
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#aaa',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--v-accent)', flexShrink: 0 }} />
                {name}
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            background: 'rgba(255, 255, 255, 0.01)'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: `1px solid ${cancelHovered ? 'var(--v-bdr3)' : 'var(--v-bdr2)'}`,
              color: cancelHovered ? '#e2ddd9' : '#8a817c',
              background: 'transparent',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'all 0.12s ease'
            }}
            onMouseEnter={() => setCancelHovered(true)}
            onMouseLeave={() => setCancelHovered(false)}
          >
            Cancel
          </button>
          <button
            onClick={onConfirmDelete}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--v-accent)',
              color: '#0c0b0b',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'all 0.12s ease',
              opacity: btnHovered ? 0.9 : 1
            }}
            onMouseEnter={() => setBtnHovered(true)}
            onMouseLeave={() => setBtnHovered(false)}
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  );
}
