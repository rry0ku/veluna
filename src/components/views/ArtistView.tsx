import React, { useState, useEffect, useMemo } from 'react';
import {
  Play,
  Shuffle,
  UserCheck,
  UserPlus,
  Music,
  Clock,
  Sparkles,
  Share2,
  Check,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Track, CtxMenu, ArtistPageData, Playlist } from '../../types';
import { TrackRow, TrackRowSkeleton } from '../TrackRow';
import { VirtualTrackList } from '../VirtualTrackList';
import { BatchActionBar } from '../BatchActionBar';
import { useMultiSelect } from '../../hooks/useMultiSelect';
import { getTrackGradient, globalArtistAvatarCache } from '../../utils';
import { ONBOARDING_MUSIC_CATEGORIES } from '../../constants';

interface ArtistViewProps {
  artistName: string;
  artistData: ArtistPageData | null;
  isLoading: boolean;
  error: string | null;
  isFollowed: boolean;
  onToggleFollow: () => void;
  onBack?: () => void;
  onArtistClick: (artistName: string, avatarUrl?: string) => void;
  handlePlayTrack?: (track: Track) => void;
  handlePlayInContext: (track: Track, contextTracks: Track[]) => void;
  playAll?: (tracks: Track[]) => void;
  currentTrack: Track | null;
  isPlaying: boolean;
  loadingTrackUrl: string | null;
  isLoadingTrack: boolean;
  hoveredTrackUrl: string | null;
  setHoveredTrackUrl: (url: string | null) => void;
  toggleLikeTrack: (track: Track) => void;
  isTrackLiked: (track: Track) => boolean;
  handleDownload: (track: Track) => void;
  downloadingTracks: Record<string, number>;
  openCtx: (e: React.MouseEvent, menu: Omit<CtxMenu, 'x' | 'y'>) => void;
  prefetchOnHover: (url: string) => void;
  getTrackCover?: (track: Track) => string | null;
  showToast: (msg: string) => void;
  addToQueue?: (track: Track) => void;
  playlists?: Playlist[];
  onAddToPlaylist?: (playlistId: string, trackUrls: string[]) => void;
}

export const ArtistView: React.FC<ArtistViewProps> = React.memo(({
  artistName,
  artistData,
  isLoading,
  error,
  isFollowed,
  onToggleFollow,
  onArtistClick,
  handlePlayInContext,
  currentTrack,
  isPlaying,
  loadingTrackUrl,
  isLoadingTrack,
  hoveredTrackUrl,
  setHoveredTrackUrl,
  toggleLikeTrack,
  isTrackLiked,
  handleDownload,
  downloadingTracks,
  openCtx,
  prefetchOnHover,
  showToast,
  addToQueue,
  playlists = [],
  onAddToPlaylist,
}) => {
  const isMatchingArtist = Boolean(
    artistData && artistData.name.trim().toLowerCase() === artistName.trim().toLowerCase()
  );
  const currentArtistData = isMatchingArtist ? artistData : null;
  const effectiveIsLoading = isLoading || !isMatchingArtist;
  const topTracks = currentArtistData?.topTracks || [];
  const multiSelect = useMultiSelect();

  const selectedTracks = useMemo(
    () => topTracks.filter(t => multiSelect.selectedUrls.has(t.url)),
    [topTracks, multiSelect.selectedUrls]
  );

  const isTrackCover = (url?: string | null) => !url || url.includes('/vi/') || url.includes('mqdefault') || url.includes('hqdefault') || url.includes('maxresdefault');

  const avatarUrl = useMemo(() => {
    if (currentArtistData?.avatar && !isTrackCover(currentArtistData.avatar)) return currentArtistData.avatar;
    const cached = globalArtistAvatarCache.get(artistName.toLowerCase());
    if (cached && !isTrackCover(cached)) return cached;
    return null;
  }, [currentArtistData, artistName]);

  const bannerUrl = useMemo(() => {
    if (currentArtistData?.banner && !isTrackCover(currentArtistData.banner)) return currentArtistData.banner;
    if (avatarUrl) return avatarUrl;
    return null;
  }, [currentArtistData, avatarUrl]);

  const similarArtists = useMemo(() => {
    const list: string[] = [];
    const q = artistName.toLowerCase();
    ONBOARDING_MUSIC_CATEGORIES.forEach(cat => {
      if (cat.artists.some(a => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()))) {
        list.push(...cat.artists.filter(a => a.toLowerCase() !== q));
      }
    });
    return Array.from(new Set(list)).slice(0, 8);
  }, [artistName]);

  const [similarAvatars, setSimilarAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    let isCancelled = false;
    const initial: Record<string, string> = {};
    const missing: string[] = [];

    similarArtists.forEach(name => {
      const cached = globalArtistAvatarCache.get(name.toLowerCase());
      if (cached) {
        initial[name] = cached;
      } else {
        missing.push(name);
      }
    });

    setSimilarAvatars(initial);

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
                setSimilarAvatars(prev => ({ ...prev, [name]: avatar }));
              }
            }
          }
        } catch {}
      }
    };

    fetchMissing();
    return () => { isCancelled = true; };
  }, [similarArtists]);

  const handlePlayAll = () => {
    if (topTracks.length === 0) return;
    handlePlayInContext(topTracks[0], topTracks);
  };

  const handleShuffle = () => {
    if (topTracks.length === 0) return;
    const shuffled = [...topTracks].sort(() => 0.5 - Math.random());
    handlePlayInContext(shuffled[0], shuffled);
  };

  return (
    <div
      className="v-page-container flex-1 overflow-y-auto custom-scrollbar"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '16px 30px 140px',
        position: 'relative',
        transform: 'translateZ(0)',
        willChange: 'scroll-position',
        contain: 'layout'
      }}
    >
      {/* Hero Artist Header */}
      <div
        style={{
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          marginBottom: '28px',
          background: 'var(--v-bg2, #141212)',
          border: '1px solid var(--v-bdr2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          contain: 'paint',
          transform: 'translate3d(0, 0, 0)',
          backfaceVisibility: 'hidden'
        }}
      >
        {/* Banner Artwork Background with Blur Overlay */}
        {bannerUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${bannerUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center 25%',
              filter: 'blur(16px) brightness(0.25)',
              transform: 'scale(1.1) translate3d(0, 0, 0)',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              zIndex: 0
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(12,11,11,0.92) 100%)',
            zIndex: 1
          }}
        />

        {/* Artist Profile Content */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            padding: '36px 32px 28px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '24px'
          }}
        >
          {/* Avatar (PFP) */}
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              position: 'relative',
              background: getTrackGradient(artistName, 'artist'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 28px rgba(0, 0, 0, 0.6)',
              border: '3px solid rgba(255, 255, 255, 0.12)'
            }}
          >
            <Music size={36} style={{ color: 'rgba(255, 255, 255, 0.25)', position: 'absolute' }} />
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt={artistName}
                referrerPolicy="no-referrer"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  position: 'absolute',
                  inset: 0
                }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
                loading="eager"
                decoding="async"
              />
            )}
          </div>

          {/* Artist Details */}
          <div style={{ flex: 1, minWidth: '220px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(var(--v-accent-rgb), 0.12)',
                  color: 'var(--v-accent)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase'
                }}
              >
                <Check size={11} strokeWidth={3} />
                Verified Artist
              </span>
            </div>

            <h1
              style={{
                fontSize: '32px',
                fontWeight: 800,
                color: 'var(--v-fg)',
                margin: '0 0 8px 0',
                letterSpacing: '-0.02em',
                lineHeight: 1.15
              }}
            >
              {artistName}
            </h1>

            <div style={{ fontSize: '13px', color: 'var(--v-fg2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span>{isLoading ? 'Fetching songs...' : `${topTracks.length} Popular Songs`}</span>
              <span>•</span>
              <span style={{ color: isFollowed ? 'var(--v-accent)' : 'var(--v-fg3)' }}>
                {isFollowed ? 'Following in your library' : 'Not followed'}
              </span>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
              <button
                disabled={topTracks.length === 0 || isLoading}
                onClick={handlePlayAll}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--v-accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '9px 22px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: topTracks.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: topTracks.length === 0 ? 0.6 : 1,
                  transition: 'all 0.15s ease',
                  boxShadow: '0 0 16px rgba(var(--v-accent-rgb), 0.28)'
                }}
              >
                <Play size={15} fill="currentColor" />
                <span>Play Top Songs</span>
              </button>

              <button
                disabled={topTracks.length === 0 || isLoading}
                onClick={handleShuffle}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--v-fg)',
                  border: '1px solid var(--v-bdr2)',
                  borderRadius: '9999px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: topTracks.length === 0 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.borderColor = 'var(--v-bdr3)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.borderColor = 'var(--v-bdr2)';
                }}
              >
                <Shuffle size={14} />
                <span>Shuffle</span>
              </button>

              <button
                onClick={onToggleFollow}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isFollowed ? 'rgba(var(--v-accent-rgb), 0.12)' : 'rgba(255, 255, 255, 0.05)',
                  color: isFollowed ? 'var(--v-accent)' : 'var(--v-fg2)',
                  border: isFollowed ? '1px solid var(--v-accent)' : '1px solid var(--v-bdr2)',
                  borderRadius: '9999px',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  if (!isFollowed) {
                    e.currentTarget.style.color = 'var(--v-fg)';
                    e.currentTarget.style.borderColor = 'var(--v-bdr3)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isFollowed) {
                    e.currentTarget.style.color = 'var(--v-fg2)';
                    e.currentTarget.style.borderColor = 'var(--v-bdr2)';
                  }
                }}
              >
                {isFollowed ? (
                  <>
                    <UserCheck size={14} strokeWidth={2.5} />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={14} />
                    <span>Follow</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(artistName);
                    showToast(`Copied ${artistName} to clipboard`);
                  }
                }}
                title="Share Artist"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--v-fg3)',
                  border: '1px solid var(--v-bdr2)',
                  borderRadius: '9999px',
                  padding: '9px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--v-fg)';
                  e.currentTarget.style.borderColor = 'var(--v-bdr3)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--v-fg3)';
                  e.currentTarget.style.borderColor = 'var(--v-bdr2)';
                }}
              >
                <Share2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Top All-Time Songs Section */}
      <div style={{ marginBottom: '36px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={15} style={{ color: 'var(--v-accent)' }} />
            <h2
              style={{
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--v-fg3)',
                margin: 0
              }}
            >
              Top Songs
            </h2>
          </div>

          {topTracks.length > 0 && !effectiveIsLoading && (
            <button
              onClick={handlePlayAll}
              style={{
                background: 'transparent',
                border: '1px solid transparent',
                color: 'var(--v-fg3)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--v-fg)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--v-fg3)'; }}
            >
              <Play size={11} fill="currentColor" />
              <span>Play All</span>
            </button>
          )}
        </div>

        {/* Loading Skeletons */}
        {effectiveIsLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <TrackRowSkeleton key={i} index={i} />
            ))}
          </div>
        )}

        {/* Error / Empty State */}
        {!effectiveIsLoading && topTracks.length === 0 && (
          <div
            style={{
              padding: '56px 24px',
              textAlign: 'center'
            }}
          >
            <Music size={32} style={{ color: 'var(--v-fg3)', marginBottom: '12px' }} />
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--v-fg)', marginBottom: '4px' }}>
              {error ? error : `No tracks found for "${artistName}"`}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--v-fg3)' }}>
              Try searching with another spelling or check your connection.
            </div>
          </div>
        )}

        {/* Track Rows Header and Virtual Track List */}
        {!effectiveIsLoading && topTracks.length > 0 && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '0 12px 6px',
                borderBottom: '1px solid var(--v-bdr2)',
                marginBottom: '4px'
              }}
            >
              <div style={{ width: '26px', flexShrink: 0 }} />
              <div style={{ width: '38px', flexShrink: 0 }} />
              <p
                style={{
                  flex: 1,
                  fontSize: '9.5px',
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--v-fg3)',
                  margin: 0
                }}
              >
                Title
              </p>
              <div style={{ width: '60px', flexShrink: 0 }} />
              <Clock size={12} style={{ color: 'var(--v-fg3)', width: '36px', flexShrink: 0 }} />
            </div>

            <div style={{ marginTop: '4px' }}>
              <VirtualTrackList
                items={topTracks}
                itemHeight={56}
                keyExtractor={(track) => track.id || track.url}
                renderItem={(track, i) => (
                  <TrackRow
                    track={track}
                    index={i}
                    isActive={currentTrack?.url === track.url}
                    isHovered={hoveredTrackUrl === track.url}
                    isLoadingTrack={loadingTrackUrl === track.url || (currentTrack?.url === track.url && isLoadingTrack)}
                    isPlaying={currentTrack?.url === track.url && isPlaying}
                    isLiked={isTrackLiked(track)}
                    isDownloading={downloadingTracks[track.url] || 0}
                    isSelected={multiSelect.selectedUrls.has(track.url)}
                    isMultiSelectActive={multiSelect.isMultiSelectActive}
                    onPlay={() => handlePlayInContext(track, topTracks)}
                    onHoverEnter={() => {
                      setHoveredTrackUrl(track.url);
                      prefetchOnHover(track.url);
                    }}
                    onHoverLeave={() => setHoveredTrackUrl(null)}
                    onLike={() => toggleLikeTrack(track)}
                    onDownload={() => handleDownload(track)}
                    onCtx={e => openCtx(e, { type: 'track', track })}
                    onSelectToggle={e => multiSelect.toggleSelect(track, i, e, topTracks)}
                    onArtistClick={onArtistClick}
                  />
                )}
              />
            </div>
          </>
        )}
      </div>

      {/* Similar Artists Shelf */}
      {similarArtists.length > 0 && (
        <div style={{ marginTop: '36px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--v-fg3)',
              marginBottom: '14px'
            }}
          >
            Similar Artists You Might Like
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '12px'
            }}
          >
            {similarArtists.map(name => {
              const avatar = similarAvatars[name];
              return (
                <div
                  key={name}
                  onClick={() => onArtistClick(name, avatar)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '16px 12px',
                    borderRadius: '12px',
                    background: 'var(--v-bg2, #141212)',
                    border: '1px solid var(--v-bdr2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    contain: 'content',
                    transform: 'translateZ(0)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--v-accent)';
                    e.currentTarget.style.background = 'rgba(var(--v-accent-rgb), 0.04)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--v-bdr2)';
                    e.currentTarget.style.background = 'var(--v-bg2, #141212)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div
                    style={{
                      width: '68px',
                      height: '68px',
                      borderRadius: '50%',
                      background: getTrackGradient(name, 'artist'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '10px',
                      border: '2px solid rgba(255, 255, 255, 0.12)',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
                      flexShrink: 0
                    }}
                  >
                    <Music size={22} style={{ color: 'rgba(255, 255, 255, 0.25)', position: 'absolute' }} />
                    {avatar && (
                      <img
                        src={avatar}
                        alt={name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '50%'
                        }}
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: 'var(--v-fg)',
                      textAlign: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%'
                    }}
                  >
                    {name}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--v-fg3)', marginTop: '2px' }}>
                    Artist
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Multi-Select Batch Action Bar */}
      {multiSelect.isMultiSelectActive && (
        <BatchActionBar
          selectedTracks={selectedTracks}
          playlists={playlists}
          onClearSelection={multiSelect.clearSelection}
          onPlaySelected={() => {
            if (selectedTracks.length > 0) handlePlayInContext(selectedTracks[0], selectedTracks);
          }}
          onQueueSelected={() => {
            if (addToQueue) selectedTracks.forEach(t => addToQueue(t));
            showToast(`Added ${selectedTracks.length} tracks to queue`);
            multiSelect.clearSelection();
          }}
          onAddToPlaylist={(playlistId) => {
            onAddToPlaylist?.(playlistId, selectedTracks.map(t => t.url));
            multiSelect.clearSelection();
          }}
          onDownloadSelected={() => {
            selectedTracks.forEach(t => handleDownload(t));
            multiSelect.clearSelection();
          }}
        />
      )}
    </div>
  );
});
