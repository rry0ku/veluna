import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Mic2,
  Search,
  UserCheck,
  UserPlus,
  Music,
  X,
  Loader2,
  Sparkles
} from 'lucide-react';
import { FollowedArtist } from '../../types';
import { getTrackGradient, globalArtistAvatarCache } from '../../utils';

interface LiveArtistItem {
  name: string;
  avatar: string;
  subtitle: string;
  browseId: string;
}

interface ArtistsViewProps {
  followedArtists: FollowedArtist[];
  onToggleFollow: (artist: { name: string; avatar?: string; banner?: string }) => void;
  onArtistClick: (artistName: string, avatarUrl?: string) => void;
  onPlayArtist?: (artistName: string) => void;
  showToast?: (msg: string) => void;
}

export const ArtistsView: React.FC<ArtistsViewProps> = React.memo(({
  followedArtists,
  onToggleFollow,
  onArtistClick,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingYt, setIsSearchingYt] = useState(false);
  const [ytArtistResults, setYtArtistResults] = useState<LiveArtistItem[]>([]);
  const activeQueryIdRef = useRef<number>(0);

  const followedSet = useMemo(() => {
    return new Set(followedArtists.filter(a => a && typeof a.name === 'string').map(a => a.name.toLowerCase()));
  }, [followedArtists]);

  const executeSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) {
      setYtArtistResults([]);
      setIsSearchingYt(false);
      return;
    }

    setIsSearchingYt(true);
    const queryId = ++activeQueryIdRef.current;

    try {
      const res = await invoke<string>('search_youtube_artists', { query: q });
      if (activeQueryIdRef.current !== queryId) return;

      const lines = res.trim().split('\n').filter(Boolean);
      const parsed: LiveArtistItem[] = [];
      const seen = new Set<string>();

      lines.forEach(line => {
        const parts = line.split('====');
        const name = parts[0]?.trim() || '';
        const avatar = parts[1]?.trim() || '';
        const subtitle = parts[2]?.trim() || 'Artist';
        const browseId = parts[3]?.trim() || '';

        const norm = name.toLowerCase();
        if (name && !seen.has(norm)) {
          seen.add(norm);
          parsed.push({
            name,
            avatar: avatar.startsWith('http') ? avatar : '',
            subtitle,
            browseId
          });
        }
      });

      setYtArtistResults(parsed);
      setIsSearchingYt(false);
    } catch {
      if (activeQueryIdRef.current === queryId) {
        setIsSearchingYt(false);
      }
    }
  }, []);

  // Live debounce search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setYtArtistResults([]);
      setIsSearchingYt(false);
      return;
    }

    const timer = setTimeout(() => {
      executeSearch(q);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, executeSearch]);

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
          marginBottom: "24px",
          background: "linear-gradient(135deg, rgba(255, 255, 255, 0.015) 0%, rgba(255, 255, 255, 0) 100%)",
          border: "1px solid var(--v-bdr)",
          borderRadius: "16px",
          padding: "20px",
          position: "relative",
          overflow: "hidden",
          flexWrap: "wrap"
        }}
      >
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
        <div
          style={{
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
          }}
        >
          <Mic2 size={26} style={{ color: "var(--v-accent)" }} />
        </div>
        <div style={{ flex: 1, minWidth: "220px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: 900, color: "var(--v-fg, #fff)", margin: 0, letterSpacing: "-0.02em" }}>
            Artists
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
              <UserCheck size={12} style={{ color: "var(--v-accent)" }} />
              <span>{followedArtists.length} {followedArtists.length === 1 ? 'followed artist' : 'followed artists'}</span>
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
              YouTube Music discovery
            </div>
          </div>
        </div>

        {/* Polished Search Container with Search Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--v-bdr)',
            borderRadius: '28px',
            padding: '4px 6px 4px 14px',
            width: '320px',
            maxWidth: '100%',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            flexShrink: 0
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'var(--v-accent)';
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--v-accent-rgb), 0.2), 0 6px 20px rgba(0, 0, 0, 0.35)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          }}
          onBlur={e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              e.currentTarget.style.borderColor = 'var(--v-bdr)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
            }
          }}
        >
          <Search
            size={16}
            style={{
              color: searchQuery.trim() ? 'var(--v-accent)' : 'var(--v-fg3)',
              flexShrink: 0,
              transition: 'color 0.15s ease'
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                executeSearch(searchQuery);
              }
            }}
            placeholder="Search artists on YouTube..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--v-fg)',
              fontSize: '13.5px',
              flex: 1,
              padding: '6px 4px',
              minWidth: 0
            }}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setYtArtistResults([]);
              }}
              title="Clear"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: 'var(--v-fg3)',
                cursor: 'pointer',
                padding: '5px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.12s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--v-fg)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--v-fg3)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }}
            >
              <X size={13} />
            </button>
          )}
          <button
            onClick={() => executeSearch(searchQuery)}
            disabled={isSearchingYt || !searchQuery.trim()}
            title="Search Artists"
            style={{
              background: searchQuery.trim() ? 'var(--v-accent)' : 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '20px',
              color: searchQuery.trim() ? '#000' : 'var(--v-fg3)',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: searchQuery.trim() && !isSearchingYt ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              if (searchQuery.trim() && !isSearchingYt) {
                e.currentTarget.style.filter = 'brightness(1.1)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.filter = 'none';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {isSearchingYt ? (
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Sparkles size={13} />
            )}
            <span>Search</span>
          </button>
        </div>
      </div>

      {/* When searching: Display Live YouTube Artist Results */}
      {searchQuery.trim().length > 0 ? (
        <div>
          <div
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--v-fg3)',
              marginBottom: '16px'
            }}
          >
            {isSearchingYt ? `Searching YouTube for "${searchQuery}"...` : `Artists found for "${searchQuery}"`}
          </div>

          {ytArtistResults.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                gap: '16px'
              }}
            >
              {ytArtistResults.map(item => {
                const isFollowed = followedSet.has(item.name.toLowerCase());

                return (
                  <div
                    key={item.name}
                    onClick={() => onArtistClick(item.name, item.avatar)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '22px 14px 18px',
                      borderRadius: '16px',
                      background: 'var(--v-bg2, #141212)',
                      border: isFollowed ? '1px solid rgba(var(--v-accent-rgb), 0.35)' : '1px solid var(--v-bdr2)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--v-accent)';
                      e.currentTarget.style.background = 'rgba(var(--v-accent-rgb), 0.04)';
                      e.currentTarget.style.transform = 'translateY(-3px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = isFollowed ? 'rgba(var(--v-accent-rgb), 0.35)' : 'var(--v-bdr2)';
                      e.currentTarget.style.background = 'var(--v-bg2, #141212)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Actual YouTube Profile Picture */}
                    <div
                      style={{
                        width: '104px',
                        height: '104px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        marginBottom: '14px',
                        position: 'relative',
                        background: getTrackGradient(item.name, 'artist'),
                        border: isFollowed ? '2px solid var(--v-accent)' : '2px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <Music className="artist-fallback-icon" size={32} style={{ color: 'rgba(255, 255, 255, 0.2)', position: 'absolute', display: item.avatar ? 'none' : 'block' }} />
                      {item.avatar && (
                        <img
                          src={item.avatar}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                          onError={e => {
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.parentElement?.querySelector('.artist-fallback-icon');
                            if (fallback) (fallback as HTMLElement).style.display = 'block';
                          }}
                          loading="eager"
                          decoding="async"
                        />
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: 'var(--v-fg)',
                        textAlign: 'center',
                        lineHeight: 1.3,
                        marginBottom: '4px',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {item.name}
                    </div>

                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--v-fg3)',
                        textAlign: 'center',
                        marginBottom: '14px'
                      }}
                    >
                      {item.subtitle || 'Artist'}
                    </div>

                    {/* Follow / Unfollow Action Button */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onToggleFollow({ name: item.name, avatar: item.avatar, banner: item.avatar });
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: isFollowed ? 'rgba(var(--v-accent-rgb), 0.15)' : 'rgba(255, 255, 255, 0.06)',
                        border: isFollowed ? '1px solid var(--v-accent)' : '1px solid var(--v-bdr2)',
                        color: isFollowed ? 'var(--v-accent)' : 'var(--v-fg2)',
                        borderRadius: '9999px',
                        padding: '5px 14px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.12s ease'
                      }}
                    >
                      {isFollowed ? (
                        <>
                          <UserCheck size={12} strokeWidth={2.5} />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus size={12} strokeWidth={2.5} />
                          <span>Follow</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : !isSearchingYt ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--v-fg3)', fontSize: '13px' }}>
              No artists found on YouTube for "{searchQuery}".
            </div>
          ) : null}
        </div>
      ) : (
        /* Default View: Followed Artists Gallery */
        <div>
          {followedArtists.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                gap: '16px'
              }}
            >
              {followedArtists.map(artist => (
                <div
                  key={artist.name}
                  onClick={() => onArtistClick(artist.name, artist.avatar)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '22px 14px 18px',
                    borderRadius: '16px',
                    background: 'var(--v-bg2, #141212)',
                    border: '1px solid var(--v-bdr2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--v-accent)';
                    e.currentTarget.style.background = 'rgba(var(--v-accent-rgb), 0.04)';
                    e.currentTarget.style.transform = 'translateY(-3px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--v-bdr2)';
                    e.currentTarget.style.background = 'var(--v-bg2, #141212)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Actual YouTube Profile Picture */}
                  <div
                    style={{
                      width: '104px',
                      height: '104px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      background: getTrackGradient(artist.name, 'artist'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '14px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.55)',
                      border: '2px solid rgba(255, 255, 255, 0.12)',
                      position: 'relative',
                      flexShrink: 0
                    }}
                  >
                    {(() => {
                      const isTrackCover = (url?: string) => !url || url.includes('/vi/') || url.includes('mqdefault') || url.includes('hqdefault');
                      const artistKey = (artist?.name || '').toLowerCase();
                      const avatarSrc = (!isTrackCover(artist.avatar) ? artist.avatar : undefined) || (artistKey ? globalArtistAvatarCache.get(artistKey) : undefined);
                      return (
                        <>
                          <Music className="artist-fallback-icon" size={32} style={{ color: 'rgba(255, 255, 255, 0.25)', position: 'absolute', display: avatarSrc ? 'none' : 'block' }} />
                          {avatarSrc && (
                            <img
                              src={avatarSrc}
                              alt={artist.name}
                              referrerPolicy="no-referrer"
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                position: 'absolute',
                                inset: 0,
                                borderRadius: '50%'
                              }}
                              onError={e => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.parentElement?.querySelector('.artist-fallback-icon');
                                if (fallback) (fallback as HTMLElement).style.display = 'block';
                              }}
                              loading="eager"
                              decoding="async"
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--v-fg)',
                      textAlign: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%',
                      marginBottom: '6px'
                    }}
                  >
                    {artist.name}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--v-accent)', fontWeight: 600 }}>
                    <UserCheck size={11} strokeWidth={2.5} />
                    <span>Following</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty State */
            <div
              style={{
                padding: '72px 24px',
                textAlign: 'center',
                margin: '0 auto'
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(var(--v-accent-rgb), 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: 'var(--v-accent)'
                }}
              >
                <Mic2 size={26} />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--v-fg)', margin: '0 0 6px 0' }}>
                No Followed Artists Yet
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--v-fg3)', margin: '0 auto', lineHeight: 1.5 }}>
                Search for any artist above to find and follow them directly from YouTube.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
