import React, { useState, useMemo, useCallback } from 'react';
import {
  History,
  Play,
  Shuffle,
  Trash2,
  Search,
  X,
  Music,
  Heart,
  Download,
  Clock,
  MoreVertical
} from 'lucide-react';
import { Track, HistoryItem, CtxMenu } from '../../types';
import { getTrackGradient, cleanArtist, parseArtistParts, getTrackCoverUrl, handleThumbnailError } from '../../utils';
import { VirtualTrackList } from '../VirtualTrackList';

interface HistoryViewProps {
  playbackHistory: HistoryItem[];
  onClearHistory: () => void;
  onRemoveHistoryItem: (id: string) => void;
  handlePlayTrack?: (track: Track) => Promise<void>;
  handlePlayInContext: (track: Track, list: Track[]) => void | Promise<void>;
  currentTrack: Track | null;
  isPlaying: boolean;
  loadingTrackUrl: string | null;
  isLoadingTrack: boolean;
  hoveredTrackUrl?: string | null;
  setHoveredTrackUrl?: (url: string | null) => void;
  toggleLikeTrack: (track: Track) => void;
  isTrackLiked: (track: Track) => boolean;
  handleDownload: (track: Track) => void;
  downloadingTracks: Record<string, number>;
  openCtx: (e: React.MouseEvent, menu: Omit<CtxMenu, 'x' | 'y'>) => void;
  prefetchOnHover?: (url: string) => void;
  getTrackCover?: (track: Track | null | undefined) => string;
  onArtistClick?: (artistName: string, avatarUrl?: string) => void;
  showToast?: (msg: string) => void;
  setConfirmModal?: (modal: { message: string; onConfirm: () => void } | null) => void;
}

function formatPlayedAt(isoStr?: string): string {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24 && date.getDate() === now.getDate()) {
    return `Today, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffDays === 1 || (diffHours < 48 && date.getDate() === now.getDate() - 1)) {
    return `Yesterday, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return `${date.toLocaleDateString([], { weekday: 'short' })}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

// Low-spec memoized track row
const HistoryTrackRow = React.memo(({
  item,
  index,
  isCurrent,
  isPlayingThis,
  isLoadingThis,
  isHovered,
  isLiked,
  isDownloading,
  cover,
  onPlay,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  onToggleLike,
  onDownload,
  onRemove,
  onArtistClick,
}: {
  item: HistoryItem;
  index: number;
  isCurrent: boolean;
  isPlayingThis: boolean;
  isLoadingThis: boolean;
  isHovered: boolean;
  isLiked: boolean;
  isDownloading: boolean;
  cover: string;
  onPlay: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleLike: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
  onRemove: (e: React.MouseEvent) => void;
  onArtistClick?: (name: string) => void;
}) => {
  const track = item.track;
  const timeAgo = formatPlayedAt(item.playedAt);
  const displayArtist = cleanArtist(track.artist) || 'Unknown Artist';

  return (
    <div
      className={`v-track${isCurrent ? ' v-track--active' : ''}`}
      onClick={onPlay}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        height: '56px',
        padding: '0 12px',
        borderRadius: '10px',
        background: isCurrent
          ? (isHovered ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.06)')
          : (isHovered ? 'rgba(255, 255, 255, 0.04)' : 'transparent'),
        border: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'background 0.1s ease',
        transform: 'translateZ(0)',
        contain: 'content',
        position: 'relative'
      }}
    >
      {/* Index / Indicator */}
      <div style={{
        width: '24px',
        textAlign: 'center',
        fontSize: '11.5px',
        fontWeight: 600,
        color: isCurrent ? 'var(--v-accent)' : 'var(--v-fg3)',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums'
      }}>
        {index + 1}
      </div>

      {/* Cover */}
      <div style={{
        width: '38px',
        height: '38px',
        borderRadius: '8px',
        background: getTrackGradient(track.title, track.artist),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
        border: '1px solid rgba(255,255,255,0.06)'
      }}>
        <Music size={14} style={{ position: 'absolute', color: 'rgba(255,255,255,0.2)' }} />
        {cover && (
          <img
            src={cover}
            alt={track.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
            onError={handleThumbnailError}
            loading="lazy"
          />
        )}

        {(isHovered || isCurrent) && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {isLoadingThis ? (
              <div className="v-spinner" style={{ width: '14px', height: '14px' }} />
            ) : isPlayingThis ? (
              <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '12px' }}>
                {[100, 65, 80].map((h, j) => (
                  <div
                    key={j}
                    style={{
                      width: '2px',
                      background: 'var(--v-accent)',
                      borderRadius: '1px',
                      height: `${h}%`,
                      animation: `barBounce ${0.7 + j * 0.12}s ease-in-out ${j * 110}ms infinite`,
                      transformOrigin: 'bottom'
                    }}
                  />
                ))}
              </div>
            ) : (
              <Play size={14} style={{ fill: '#fff', color: '#fff', marginLeft: '1px' }} />
            )}
          </div>
        )}
      </div>

      {/* Title & Artist */}
      <div style={{ flex: '1', minWidth: 0 }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: isCurrent ? 'var(--v-accent)' : 'var(--v-fg)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: '1.3'
        }}>
          {track.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(() => {
            const artistParts = parseArtistParts(displayArtist);
            return artistParts.map((part, idx) => {
              if (part.isSeparator) {
                return (
                  <span key={idx} style={{ color: 'var(--v-fg2)', fontSize: '11.5px', pointerEvents: 'none' }}>
                    {part.name}
                  </span>
                );
              }
              return (
                <span
                  key={idx}
                  onClick={e => {
                    e.stopPropagation();
                    if (onArtistClick) {
                      onArtistClick(part.name);
                    }
                  }}
                  style={{
                    fontSize: '11.5px',
                    color: 'var(--v-fg2)',
                    cursor: onArtistClick ? 'pointer' : 'default',
                    transition: 'color 0.1s ease'
                  }}
                  onMouseEnter={e => { if (onArtistClick) { e.currentTarget.style.color = 'var(--v-fg)'; e.currentTarget.style.textDecoration = 'underline'; } }}
                  onMouseLeave={e => { if (onArtistClick) { e.currentTarget.style.color = 'var(--v-fg2)'; e.currentTarget.style.textDecoration = 'none'; } }}
                  title={onArtistClick ? `View ${part.name}` : undefined}
                >
                  {part.name}
                </span>
              );
            });
          })()}
        </div>
      </div>

      {/* Timestamp */}
      {timeAgo && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          color: 'var(--v-fg3)',
          flexShrink: 0,
          marginRight: '8px'
        }}>
          <Clock size={11} style={{ opacity: 0.7 }} />
          <span>{timeAgo}</span>
        </div>
      )}

      {/* Duration */}
      {track.duration && track.duration !== '0:00' && (
        <div style={{
          fontSize: '11.5px',
          color: 'var(--v-fg3)',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
          marginRight: '4px'
        }}>
          {track.duration}
        </div>
      )}

      {/* Like button */}
      <button
        onClick={onToggleLike}
        title={isLiked ? 'Unlike' : 'Like'}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          color: isLiked ? '#e05555' : 'var(--v-fg3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          opacity: isLiked || isHovered ? 1 : 0,
          transition: 'opacity 0.1s ease'
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#e05555'; }}
        onMouseLeave={e => { if (!isLiked) e.currentTarget.style.color = 'var(--v-fg3)'; }}
      >
        <Heart size={14} style={{ fill: isLiked ? '#e05555' : 'none' }} />
      </button>

      {/* Download button */}
      <button
        onClick={onDownload}
        title={isDownloading ? 'Downloading...' : 'Download'}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          color: 'var(--v-fg3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          opacity: isDownloading || isHovered ? 1 : 0,
          transition: 'opacity 0.1s ease'
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--v-fg)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--v-fg3)'; }}
      >
        <Download size={14} />
      </button>

      {/* Remove from history button */}
      <button
        onClick={onRemove}
        title="Remove from history"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          color: 'var(--v-fg3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          opacity: isHovered ? 0.7 : 0,
          transition: 'opacity 0.1s ease'
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#e05555'; e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--v-fg3)'; e.currentTarget.style.opacity = '0.7'; }}
      >
        <X size={14} />
      </button>

      {/* More actions (context menu) */}
      <button
        onClick={onContextMenu}
        title="More actions"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          color: 'var(--v-fg3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.1s ease'
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--v-fg)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--v-fg3)'; }}
      >
        <MoreVertical size={14} />
      </button>
    </div>
  );
});

export const HistoryView: React.FC<HistoryViewProps> = React.memo(({
  playbackHistory,
  onClearHistory,
  onRemoveHistoryItem,
  handlePlayInContext,
  currentTrack,
  isPlaying,
  loadingTrackUrl,
  isLoadingTrack,
  hoveredTrackUrl: customHoveredTrackUrl,
  setHoveredTrackUrl: customSetHoveredTrackUrl,
  toggleLikeTrack,
  isTrackLiked,
  handleDownload,
  downloadingTracks,
  openCtx,
  prefetchOnHover = () => {},
  getTrackCover: customGetTrackCover,
  onArtistClick,
  showToast,
  setConfirmModal,
}) => {
  const [internalHoveredUrl, setInternalHoveredUrl] = useState<string | null>(null);
  const hoveredTrackUrl = customHoveredTrackUrl !== undefined ? customHoveredTrackUrl : internalHoveredUrl;
  const setHoveredTrackUrl = customSetHoveredTrackUrl || setInternalHoveredUrl;

  const [searchQ, setSearchQ] = useState('');

  const getTrackCover = customGetTrackCover || ((t: Track | null | undefined) => getTrackCoverUrl(t));

  // Guaranteed Deduplication by track.url (keeps newest instance)
  const uniqueHistory = useMemo(() => {
    const seen = new Set<string>();
    const result: HistoryItem[] = [];
    for (const item of playbackHistory) {
      if (!item || !item.track || !item.track.url) continue;
      const key = item.track.url.trim();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }
    return result;
  }, [playbackHistory]);

  const filteredHistory = useMemo(() => {
    if (!searchQ.trim()) return uniqueHistory;
    const q = searchQ.trim().toLowerCase();
    return uniqueHistory.filter(item => {
      const title = (item.track?.title || '').toLowerCase();
      const artist = (item.track?.artist || '').toLowerCase();
      const album = (item.track?.album || '').toLowerCase();
      return title.includes(q) || artist.includes(q) || album.includes(q);
    });
  }, [uniqueHistory, searchQ]);

  const historyTracks = useMemo(() => {
    return filteredHistory.map(item => item.track);
  }, [filteredHistory]);

  const handlePlayAll = useCallback(() => {
    if (historyTracks.length === 0) return;
    handlePlayInContext(historyTracks[0], historyTracks);
  }, [historyTracks, handlePlayInContext]);

  const handleShuffle = useCallback(() => {
    if (historyTracks.length === 0) return;
    const shuffled = [...historyTracks].sort(() => Math.random() - 0.5);
    handlePlayInContext(shuffled[0], shuffled);
  }, [historyTracks, handlePlayInContext]);

  const handlePromptClear = useCallback(() => {
    if (uniqueHistory.length === 0) return;
    if (setConfirmModal) {
      setConfirmModal({
        message: 'Are you sure you want to clear your entire listening history? This cannot be undone.',
        onConfirm: () => {
          onClearHistory();
          if (showToast) showToast('Playback history cleared');
        }
      });
    } else {
      onClearHistory();
      if (showToast) showToast('Playback history cleared');
    }
  }, [uniqueHistory.length, setConfirmModal, onClearHistory, showToast]);

  return (
    <div
      className="v-page-container flex-1 overflow-y-auto custom-scrollbar"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '24px 30px 140px',
        position: 'relative',
        transform: 'translateZ(0)',
        willChange: 'scroll-position',
        contain: 'layout'
      }}
    >
      {/* Header Banner */}
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
          <History size={26} style={{ color: "var(--v-accent)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: "24px", fontWeight: 900, color: "var(--v-fg, #fff)", margin: 0, letterSpacing: "-0.02em" }}>
            Playback History
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11.5px",
              color: "var(--v-fg2, #9e9894)",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--v-bdr)",
              borderRadius: "20px",
              padding: "4px 10px"
            }}>
              <Clock size={12} style={{ color: "var(--v-accent)" }} />
              <span>{uniqueHistory.length} unique {uniqueHistory.length === 1 ? 'song' : 'songs'}</span>
            </div>
            <div style={{
              fontSize: "11px",
              color: "var(--v-fg3, #8a827e)",
              background: "rgba(255, 255, 255, 0.01)",
              border: "1px solid rgba(255, 255, 255, 0.04)",
              borderRadius: "20px",
              padding: "4px 10px",
              fontWeight: 500
            }}>
              {playbackHistory.length} total plays recorded
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", flexShrink: 0 }}>
          {filteredHistory.length > 0 && (
            <>
              <button
                onClick={handlePlayAll}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 18px',
                  borderRadius: '20px',
                  background: 'var(--v-accent)',
                  color: '#0c0b0b',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(var(--v-accent-rgb), 0.28)',
                  transition: 'transform 0.12s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <Play size={14} style={{ fill: 'currentColor' }} />
                <span>Play All</span>
              </button>

              <button
                onClick={handleShuffle}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '20px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--v-fg)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              >
                <Shuffle size={14} />
                <span>Shuffle</span>
              </button>
            </>
          )}

          {uniqueHistory.length > 0 && (
            <button
              onClick={handlePromptClear}
              title="Clear all history"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid var(--v-bdr)',
                background: 'rgba(255, 255, 255, 0.01)',
                color: '#9e9894',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(224, 85, 85, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(224, 85, 85, 0.3)';
                e.currentTarget.style.color = '#e05555';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                e.currentTarget.style.borderColor = 'var(--v-bdr)';
                e.currentTarget.style.color = '#9e9894';
              }}
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Input */}
      {uniqueHistory.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '16px 0 14px 0'
        }}>
          <div style={{
            position: 'relative',
            flex: '1',
            maxWidth: '340px'
          }}>
            <Search size={14} style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--v-fg3)',
              pointerEvents: 'none'
            }} />
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search history by song or artist..."
              style={{
                width: '100%',
                padding: '8px 32px 8px 34px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'var(--v-fg)',
                fontSize: '12.5px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.12s ease'
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--v-accent)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
            />
            {searchQ && (
              <button
                onClick={() => setSearchQ('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--v-fg3)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Virtualized Track List for High Performance on Low-End Devices */}
      {filteredHistory.length > 0 ? (
        <VirtualTrackList
          items={filteredHistory}
          itemHeight={56}
          overscan={10}
          keyExtractor={(item) => item.id || item.track.url}
          renderItem={(item, index) => {
            const track = item.track;
            const isCurrent = currentTrack?.url === track.url;
            const isPlayingThis = isCurrent && isPlaying;
            const isLoadingThis = isCurrent && (isLoadingTrack || loadingTrackUrl === track.url);
            const isHovered = hoveredTrackUrl === track.url;
            const isLiked = isTrackLiked(track);
            const isDownloading = downloadingTracks[track.url] !== undefined;
            const cover = getTrackCover(track);

            return (
              <HistoryTrackRow
                key={item.id || `${track.url}-${index}`}
                item={item}
                index={index}
                isCurrent={isCurrent}
                isPlayingThis={isPlayingThis}
                isLoadingThis={isLoadingThis}
                isHovered={isHovered}
                isLiked={isLiked}
                isDownloading={isDownloading}
                cover={cover}
                onPlay={() => handlePlayInContext(track, historyTracks)}
                onContextMenu={e => openCtx(e, { type: 'track', track })}
                onMouseEnter={() => {
                  setHoveredTrackUrl(track.url);
                  prefetchOnHover(track.url);
                }}
                onMouseLeave={() => setHoveredTrackUrl(null)}
                onToggleLike={e => {
                  e.stopPropagation();
                  toggleLikeTrack(track);
                }}
                onDownload={e => {
                  e.stopPropagation();
                  handleDownload(track);
                }}
                onRemove={e => {
                  e.stopPropagation();
                  onRemoveHistoryItem(item.id);
                }}
                onArtistClick={onArtistClick}
              />
            );
          }}
        />
      ) : uniqueHistory.length > 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 16px',
          color: 'var(--v-fg3)'
        }}>
          <Search size={36} style={{ opacity: 0.35, marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--v-fg2)' }}>
            No songs found matching "{searchQ}"
          </div>
          <button
            onClick={() => setSearchQ('')}
            style={{
              marginTop: '12px',
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--v-fg)',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Clear Filter
          </button>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '64px 16px',
          color: 'var(--v-fg3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            color: 'var(--v-fg3)'
          }}>
            <History size={30} style={{ opacity: 0.5 }} />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--v-fg)', marginBottom: '4px' }}>
            No listening history yet
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--v-fg3)', maxWidth: '320px', lineHeight: '1.4' }}>
            Every unique song you play in Veluna will be automatically listed here in chronological order.
          </div>
        </div>
      )}
    </div>
  );
});
