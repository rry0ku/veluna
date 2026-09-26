import React, { useMemo, useState, useEffect } from 'react';
import { ListOrdered, ListPlus, Music, Play, X, FileMusic } from 'lucide-react';
import { Track, Playlist, CtxMenu } from '../../types';
import { getTrackGradient, cleanArtist, getTrackCoverUrl, handleThumbnailError } from '../../utils';

interface QueuePanelProps {
  isQueueOpen: boolean;
  setIsQueueOpen: (open: boolean) => void;
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoadingTrack: boolean;
  loadingTrackUrl: string | null;
  showClearConfirm: boolean;
  setShowClearConfirm: (show: boolean) => void;
  playlistContextRef: React.MutableRefObject<{ tracks: Track[]; index: number } | null>;
  handlePlayTrack: (track: Track, fromQueue?: boolean) => Promise<void>;
  clearQueue: () => void;
  removeFromQueue: (url: string) => void;
  moveQueueItem: (from: number, to: number) => void;
  openCtx: (e: React.MouseEvent, menu: Omit<CtxMenu, 'x' | 'y'>) => void;
  setPlaylists: React.Dispatch<React.SetStateAction<Playlist[]>>;
  showToast: (msg: string) => void;
  dragQueueIdx: React.MutableRefObject<number | null>;
  dragOverQueueIdx: number | null;
  setDragOverQueueIdx: (idx: number | null) => void;
  dragOverQueueIdxRef: React.MutableRefObject<number | null>;
}

export const QueuePanel: React.FC<QueuePanelProps> = React.memo(({
  isQueueOpen,
  setIsQueueOpen,
  queue,
  currentTrack,
  isPlaying,
  isLoadingTrack,
  loadingTrackUrl: _loadingTrackUrl,
  showClearConfirm,
  setShowClearConfirm,
  playlistContextRef,
  handlePlayTrack,
  clearQueue,
  removeFromQueue,
  moveQueueItem,
  openCtx,
  setPlaylists,
  showToast,
  dragQueueIdx,
  dragOverQueueIdx,
  setDragOverQueueIdx,
  dragOverQueueIdxRef,
}) => {
  const contextualTracks = useMemo(() => {
    if (!playlistContextRef.current || !currentTrack) return [];
    const { tracks, index } = playlistContextRef.current;
    let idx = tracks.findIndex(t => t.url === currentTrack.url);
    if (idx === -1) idx = index;
    return tracks.slice(idx + 1, idx + 11);
  }, [playlistContextRef.current, currentTrack?.url]);

  const handleSaveQueueAsPlaylist = () => {
    if (queue.length === 0) return;
    const onlineTracks = queue.filter(t => !t.url.startsWith('local://'));
    if (onlineTracks.length === 0) {
      showToast('Cannot save playlist: offline tracks cannot be added to playlists');
      return;
    }
    const name = `Queue ${new Date().toLocaleDateString()}`;
    const newPl: Playlist = {
      id: `pl_${Date.now()}`,
      name,
      description: 'Saved from queue',
      tracks: onlineTracks,
    };
    setPlaylists(prev => [...prev, newPl]);
    showToast(`Saved queue as "${name}" (${onlineTracks.length} tracks)`);
  };

  const [isRendered, setIsRendered] = useState(isQueueOpen);

  useEffect(() => {
    if (isQueueOpen) {
      setIsRendered(true);
    } else {
      const timer = setTimeout(() => setIsRendered(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isQueueOpen]);

  return (
    <div style={{
      flexShrink: 0,
      background: 'var(--v-bg0)',
      borderLeft: 'none',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      width: isQueueOpen ? '300px' : '0',
      transition: 'width 0.28s cubic-bezier(0.2,0,0,1)'
    }}>
      {isRendered && (
        <div style={{
          width: '300px',
          minWidth: '300px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--v-bdr2)',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, color: 'var(--v-fg)', fontSize: '13px', letterSpacing: '.01em' }}>
                Play Queue
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {queue.length > 0 && (
                <button
                  onClick={handleSaveQueueAsPlaylist}
                  title="Save Queue as Playlist"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--v-fg2)',
                    transition: 'color .12s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--v-fg)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--v-fg2)')}
                >
                  <ListPlus size={13} />
                  <span>Save</span>
                </button>
              )}
              {queue.length > 0 && (
                showClearConfirm ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
                    <span style={{ color: '#b05555', fontWeight: 500 }}>Clear?</span>
                    <button
                      onClick={() => { clearQueue(); setShowClearConfirm(false); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#b05555', padding: 0 }}
                    >
                      Yes
                    </button>
                    <span style={{ color: 'var(--v-fg3)' }}>|</span>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, color: 'var(--v-fg2)', padding: 0 }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 500, color: 'var(--v-fg2)', transition: 'color .12s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#b05555')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--v-fg2)')}
                  >
                    Clear
                  </button>
                )
              )}
              <button
                onClick={() => setIsQueueOpen(false)}
                title="Close Queue"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  color: 'var(--v-fg3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                  transition: 'color .12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--v-fg)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--v-fg3)')}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {currentTrack && (
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--v-bdr2)', flexShrink: 0 }}>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--v-fg3)', marginBottom: '8px' }}>
                Now Playing
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--v-bdr2)' }}>
                <div style={{
                  position: 'relative',
                  width: '38px',
                  height: '38px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  background: 'var(--v-bdr2)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {getTrackCoverUrl(currentTrack) ? (
                    <img src={getTrackCoverUrl(currentTrack)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={handleThumbnailError} alt="" />
                  ) : (
                    <FileMusic size={16} style={{ color: 'var(--v-fg2)' }} />
                  )}
                  {isLoadingTrack ? (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}>
                        <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
                        <circle cx="12" cy="12" r="8.5" fill="none" stroke="var(--v-fg)" strokeWidth="2.5" strokeDasharray="53.4" strokeDashoffset="36" strokeLinecap="round" />
                      </svg>
                    </div>
                  ) : isPlaying ? (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '12px' }}>
                        {[100, 60, 80].map((h, i) => (
                          <div key={i} style={{ width: '2px', background: 'var(--v-accent)', borderRadius: '1px', height: `${h}%`, animation: `barBounce ${0.7 + i * 0.12}s ease-in-out ${i * 110}ms infinite`, transformOrigin: 'bottom' }} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--v-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentTrack.title}
                  </div>
                  {cleanArtist(currentTrack.artist) && (
                    <div style={{ fontSize: '11px', color: 'var(--v-fg2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                      {cleanArtist(currentTrack.artist)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ paddingBottom: "140px" }}>
            {queue.length === 0 && contextualTracks.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "180px", color: "var(--v-fg3)", gap: "8px" }}>
                <ListOrdered size={26} strokeWidth={1} />
                <p style={{ fontSize: "13px" }}>Queue is empty</p>
              </div>
            ) : (
              <>
                {queue.length > 0 && (
                  <>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--v-fg3)', padding: '14px 16px 8px' }}>
                      Manually Queued
                    </div>
                    {queue.map((track, i) => (
                      <div
                        key={`${track.url}-${i}`}
                        className={`v-queue-item${currentTrack?.url === track.url ? ' v-queue-item--active' : ''}`}
                        style={{ position: 'relative' }}
                        onMouseEnter={() => {
                          if (dragQueueIdx.current !== null) {
                            dragOverQueueIdxRef.current = i;
                            setDragOverQueueIdx(i);
                          }
                        }}
                        onContextMenu={e => openCtx(e, { type: 'queue-track', track })}
                      >
                        {dragOverQueueIdx === i && dragQueueIdx.current !== null && dragQueueIdx.current !== i && (
                          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1.5px", background: "var(--v-accent)", borderRadius: "1px", zIndex: 10, pointerEvents: "none" }} />
                        )}
                        <div
                          style={{ width: "20px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                          onMouseDown={e => {
                            e.preventDefault();
                            dragQueueIdx.current = i;
                            dragOverQueueIdxRef.current = i;
                            setDragOverQueueIdx(i);
                            const onUp = () => {
                              const from = dragQueueIdx.current;
                              const to = dragOverQueueIdxRef.current;
                              dragQueueIdx.current = null;
                              dragOverQueueIdxRef.current = null;
                              setDragOverQueueIdx(null);
                              window.removeEventListener('mouseup', onUp);
                              if (from === null || to === null || from === to) return;
                              moveQueueItem(from, to);
                            };
                            window.addEventListener('mouseup', onUp);
                          }}
                        >
                          <div style={{ width: "18px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab" }}>
                            <span className="v-queue-drag-index" style={{ fontSize: "11px", color: "var(--v-fg3)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                            <div className="v-queue-drag-icon">
                              <svg width="9" height="13" viewBox="0 0 10 14" fill="currentColor" style={{ color: "var(--v-fg2)" }}><circle cx="3" cy="2.5" r="1.2" /><circle cx="7" cy="2.5" r="1.2" /><circle cx="3" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" /><circle cx="3" cy="11.5" r="1.2" /><circle cx="7" cy="11.5" r="1.2" /></svg>
                            </div>
                          </div>
                        </div>
                        <div
                          className="v-queue-cover-container"
                          style={{ position: 'relative', width: '36px', height: '36px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}
                          onClick={() => {
                            if (dragQueueIdx.current === null) {
                              removeFromQueue(track.url);
                              handlePlayTrack(track, true);
                            }
                          }}
                        >
                          <div style={{
                            width: "100%", height: "100%", border: "1px solid rgba(255,255,255,0.05)",
                            position: "relative",
                            background: getTrackGradient(track.title, track.artist),
                            display: "flex", alignItems: "center", justifyContent: "center"
                          }}>
                            <Music size={12} style={{ position: 'absolute', color: 'rgba(255,255,255,0.25)' }} />
                            {getTrackCoverUrl(track) && <img src={getTrackCoverUrl(track)} style={{ position: 'absolute', inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={handleThumbnailError} alt="" />}
                          </div>
                          <div className="v-queue-play-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                            <Play size={12} fill="currentColor" />
                          </div>
                        </div>
                        <div
                          style={{ flex: 1, minWidth: 0, cursor: "pointer", marginLeft: '10px' }}
                          onClick={() => {
                            if (dragQueueIdx.current === null) {
                              removeFromQueue(track.url);
                              handlePlayTrack(track, true);
                            }
                          }}
                        >
                          <div style={{ fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: currentTrack?.url === track.url ? "var(--v-fg)" : "var(--v-fg2)" }}>
                            {track.title}
                          </div>
                          {cleanArtist(track.artist) && (
                            <div style={{ fontSize: "11px", color: "var(--v-fg3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "1px" }}>
                              {cleanArtist(track.artist)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginRight: '14px' }}>
                          <span className="v-queue-duration" style={{ fontSize: '11px', color: 'var(--v-fg3)', fontVariantNumeric: 'tabular-nums' }}>
                            {track.duration || '0:00'}
                          </span>
                          <div className="v-queue-actions" style={{ alignItems: 'center', gap: '4px' }}>
                            <button
                              onClick={e => { e.stopPropagation(); removeFromQueue(track.url); }}
                              title="Remove from queue"
                              style={{ padding: "4px", border: "none", background: "none", cursor: "pointer", color: "var(--v-fg3)", borderRadius: "4px", display: "flex", transition: "color .12s" }}
                              onMouseEnter={e => { e.currentTarget.style.color = "#b05555"; }}
                              onMouseLeave={e => { e.currentTarget.style.color = "var(--v-fg3)"; }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {contextualTracks.length > 0 && (
                  <>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--v-fg3)', padding: '20px 16px 8px' }}>
                      Next Up
                    </div>
                    {contextualTracks.map((track, i) => (
                      <div
                        key={`${track.url}-${i}`}
                        className="v-queue-item"
                        style={{ position: 'relative', paddingLeft: '16px' }}
                        onContextMenu={e => openCtx(e, { type: 'track', track })}
                      >
                        <div
                          className="v-queue-cover-container"
                          style={{ position: 'relative', width: '36px', height: '36px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}
                          onClick={() => handlePlayTrack(track, true)}
                        >
                          <div style={{
                            width: "100%", height: "100%", border: "1px solid rgba(255,255,255,0.05)",
                            position: "relative",
                            background: getTrackGradient(track.title, track.artist),
                            display: "flex", alignItems: "center", justifyContent: "center"
                          }}>
                            <Music size={12} style={{ position: 'absolute', color: 'rgba(255,255,255,0.25)' }} />
                            {track.cover && <img src={track.cover} style={{ position: 'absolute', inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.currentTarget.style.display = 'none'; }} alt="" />}
                          </div>
                          <div className="v-queue-play-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                            <Play size={12} fill="currentColor" />
                          </div>
                        </div>
                        <div
                          style={{ flex: 1, minWidth: 0, cursor: "pointer", marginLeft: '10px' }}
                          onClick={() => handlePlayTrack(track, true)}
                        >
                          <div style={{ fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--v-fg2)" }}>
                            {track.title}
                          </div>
                          {cleanArtist(track.artist) && (
                            <div style={{ fontSize: "11px", color: "var(--v-fg3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "1px" }}>
                              {cleanArtist(track.artist)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginRight: '14px' }}>
                          <span className="v-queue-duration" style={{ fontSize: '11px', color: 'var(--v-fg3)', fontVariantNumeric: 'tabular-nums' }}>
                            {track.duration || '0:00'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
