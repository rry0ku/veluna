import React, { useRef, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Heart,
  Info,
  ListMusic,
  Music,
  Play,
  Search,
  Shuffle,
  X,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  Mic2,
  HardDrive,
  BarChart2,
  WifiOff
} from 'lucide-react';
import { Track, Playlist, LocalTrack, CtxMenu, SettingsTab, FollowedArtist } from '../../types';
import { GENRES, matchGenreTrack } from '../../constants';
import { invoke } from '@tauri-apps/api/core';
import { getTrackGradient, cleanArtist, globalArtistAvatarCache, getTrackCoverUrl, handleThumbnailError } from '../../utils';
import { TrackRow, TrackRowSkeleton } from '../TrackRow';
import { VirtualTrackList } from '../VirtualTrackList';
import { BatchActionBar } from '../BatchActionBar';
import { useMultiSelect } from '../../hooks/useMultiSelect';

interface HomeViewProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchHistory: string[];
  setSearchHistory?: React.Dispatch<React.SetStateAction<string[]>>;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  isSearching: boolean;
  hasSearched: boolean;
  setHasSearched?: (hasSearched: boolean) => void;
  searchError: string | null;
  setSearchError?: (err: string | null) => void;
  ytMusicTracks: Track[];
  setYtMusicTracks?: React.Dispatch<React.SetStateAction<Track[]>>;
  videoTracks: Track[];
  setVideoTracks?: React.Dispatch<React.SetStateAction<Track[]>>;
  tracks: Track[];
  setTracks?: React.Dispatch<React.SetStateAction<Track[]>>;
  searchTab: 'music' | 'video';
  setSearchTab: (tab: 'music' | 'video') => void;
  quickPicks: Track[];
  setQuickPicks?: React.Dispatch<React.SetStateAction<Track[]>>;
  searchRef?: React.RefObject<HTMLInputElement | null>;
  searchMusic: (override?: string) => Promise<void>;
  handlePlayTrack?: (track: Track, fromQueue?: boolean) => Promise<void>;
  resetSearch?: () => void;
  updateAvailable?: string | null;
  setActiveNav: (nav: any) => void;
  setSettingsTab?: (tab: SettingsTab) => void;
  isHydrated?: boolean;
  isOnline?: boolean;
  onNavigateOffline?: () => void;
  localTracks?: LocalTrack[];
  playHistory: Track[];
  playlists?: Playlist[];
  setPlaylists?: React.Dispatch<React.SetStateAction<Playlist[]>>;
  playCounts: Record<string, number>;
  currentTrack: Track | null;
  loadingTrackUrl: string | null;
  isLoadingTrack: boolean;
  isPlaying: boolean;
  hoveredTrackUrl?: string | null;
  setHoveredTrackUrl?: (url: string | null) => void;
  downloadingTracks: Record<string, number>;
  handlePlayInContext: (track: Track, list: Track[]) => void | Promise<void>;
  playAll?: (list: Track[]) => void;
  toggleLikeTrack: (track: Track) => void;
  isTrackLiked: (url: string) => boolean;
  handleDownload: (track: Track) => void;
  openCtx: (e: React.MouseEvent, menu: Omit<CtxMenu, 'x' | 'y'>) => void;
  prefetchOnHover?: (url: string) => void;
  clearSearchHistory?: () => void;
  removeSearchHistoryItem?: (item: string) => void;
  getTrackCover?: (track: Track | null | undefined) => string;
  setOpenPlaylistId?: (id: string | null) => void;
  showToast?: (msg: string) => void;
  addToQueue?: (tracks: Track | Track[]) => void;
  recommendedTracks?: Track[];
  onRefreshRecommendations?: () => void;
  onOpenPersonalization?: () => void;
  onArtistClick?: (artistName: string, avatarUrl?: string) => void;
  followedArtists?: FollowedArtist[];
}

export const VelunaGenreIcon: React.FC<{ id: string; size?: number; style?: React.CSSProperties }> = ({ id, size = 18, style }) => {
  switch (id) {
    case 'kpop':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M14.5 8.5C12.5 6.5 10 7.5 9 9l-1 1.5a4.2 4.2 0 0 0 .5 5.5l3.5 3.5a3 3 0 0 0 4.2 0l3.8-3.8c1.2-1.2 1.2-3.1 0-4.2l-2-2-3.5-1z" />
          <path d="M9.5 5.5c-.8-.8-2-.8-2.8 0s-.8 2 0 2.8l1.3 1.2" />
          <path d="M12 2.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'pop':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
          <path d="M17.5 3.5c1.2.6 2 1.8 2 3.2" strokeOpacity="0.8" strokeWidth="1.5" />
          <path d="M6.5 3.5C5.3 4.1 4.5 5.3 4.5 6.7" strokeOpacity="0.8" strokeWidth="1.5" />
          <circle cx="19.5" cy="3" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'hiphop':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M6 7V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3" />
          <circle cx="7" cy="14" r="3" />
          <circle cx="7" cy="14" r="1" fill="currentColor" stroke="none" />
          <circle cx="17" cy="14" r="3" />
          <circle cx="17" cy="14" r="1" fill="currentColor" stroke="none" />
          <line x1="12" y1="11" x2="12" y2="17" strokeWidth="1.5" />
        </svg>
      );
    case 'synthwave':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M12 3a9 9 0 0 0-9 9h18a9 9 0 0 0-9-9z" />
          <line x1="4.5" y1="9" x2="19.5" y2="9" strokeWidth="1.2" />
          <line x1="3.5" y1="6.5" x2="20.5" y2="6.5" strokeWidth="1.2" />
          <path d="M2 15h20M4 18h16M7 21h10" strokeWidth="1.4" />
          <line x1="12" y1="12" x2="12" y2="21" strokeWidth="1.2" />
          <line x1="6" y1="12" x2="3" y2="21" strokeWidth="1.2" />
          <line x1="18" y1="12" x2="21" y2="21" strokeWidth="1.2" />
        </svg>
      );
    case 'lofi':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <circle cx="8" cy="11.5" r="2.5" />
          <circle cx="8" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="16" cy="11.5" r="2.5" />
          <circle cx="16" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
          <line x1="8" y1="14" x2="16" y2="14" strokeWidth="1.2" />
          <polygon points="6,18 18,18 16.5,15.5 7.5,15.5" strokeWidth="1.2" fill="currentColor" fillOpacity="0.12" />
        </svg>
      );
    case 'rock':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" fillOpacity="0.14" />
          <path d="M18 3l2 2M21 7l-2-2" strokeWidth="1.4" />
        </svg>
      );
    case 'rnb':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <circle cx="12" cy="12" r="9.5" />
          <circle cx="12" cy="12" r="3.5" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" strokeDasharray="2.5 2.5" strokeWidth="1.2" />
          <path d="M12 21.5a9.5 9.5 0 0 1-9.5-9.5" strokeDasharray="2.5 2.5" strokeWidth="1.2" />
        </svg>
      );
    case 'edm':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M2 13h2l2.5-6 3 14 3-10 3 6 2-4h4.5" />
          <circle cx="21" cy="13" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'jazz':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M6 3v11a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V7l4-2" />
          <circle cx="6" cy="7" r="1" fill="currentColor" stroke="none" />
          <circle cx="6" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="6" cy="13" r="1" fill="currentColor" stroke="none" />
          <path d="M14 7c1.5.5 2.5 1.5 2.5 3" strokeWidth="1.2" />
        </svg>
      );
    case 'classical':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="6.5" y1="5" x2="6.5" y2="13" strokeWidth="2.2" stroke="currentColor" />
          <line x1="10.5" y1="5" x2="10.5" y2="13" strokeWidth="2.2" stroke="currentColor" />
          <line x1="14.5" y1="5" x2="14.5" y2="13" strokeWidth="2.2" stroke="currentColor" />
          <line x1="18.5" y1="5" x2="18.5" y2="13" strokeWidth="2.2" stroke="currentColor" />
          <line x1="2" y1="13" x2="22" y2="13" strokeWidth="1.2" />
        </svg>
      );
    case 'afrobeats':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5c0 5 4 8 4 10v5h8v-5c0-2 4-5 4-10" />
          <path d="M8 8l4 6 4-6M12 14v7" strokeWidth="1.2" />
        </svg>
      );
    case 'latin':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M9 18a4 4 0 1 0 0-8 3 3 0 0 0-1-2.2V3h2v2h2V3h1v5.8a3 3 0 0 0-1 2.2 4 4 0 1 0 0 8z" />
          <circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none" />
          <line x1="16" y1="9" x2="22" y2="9" strokeWidth="1.2" />
          <line x1="15" y1="13" x2="21" y2="13" strokeWidth="1.2" />
          <line x1="16" y1="17" x2="22" y2="17" strokeWidth="1.2" />
        </svg>
      );
    case 'slowed':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 6 12 12 16 14" />
          <path d="M3.5 12a8.5 8.5 0 0 0 2.5 6" strokeDasharray="2 2" strokeWidth="1.5" />
          <path d="M20.5 12a8.5 8.5 0 0 1-2.5 6" strokeDasharray="2 2" strokeWidth="1.5" />
        </svg>
      );
    case 'phonk':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <polygon points="12 2 22 8.5 18 21 6 21 2 8.5 12 2" />
          <circle cx="12" cy="13" r="3.5" />
          <circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" />
          <line x1="12" y1="2" x2="12" y2="9.5" />
          <line x1="3.5" y1="17" x2="8.8" y2="14.5" />
          <line x1="20.5" y1="17" x2="15.2" y2="14.5" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill="currentColor" fillOpacity="0.2" />
          <circle cx="18" cy="16" r="3" fill="currentColor" fillOpacity="0.2" />
        </svg>
      );
  }
};

const ArtistSpotlightCard: React.FC<{
  artistName: string;
  onArtistClick: (name: string, avatarUrl?: string) => void;
  followedArtists?: FollowedArtist[];
}> = React.memo(({ artistName, onArtistClick, followedArtists = [] }) => {
  const isTrackCover = (url?: string) => !url || url.includes('/vi/') || url.includes('mqdefault') || url.includes('hqdefault') || url.includes('maxresdefault');

  const [avatar, setAvatar] = React.useState<string>(() => {
    const key = artistName.toLowerCase();
    const cached = globalArtistAvatarCache.get(key);
    if (cached && !isTrackCover(cached)) return cached;
    const followed = followedArtists.find(a => a.name.toLowerCase() === key && a.avatar && !isTrackCover(a.avatar));
    if (followed?.avatar) return followed.avatar;
    try {
      const thumbs = JSON.parse(localStorage.getItem('vg_artist_thumbs') || '{}');
      if (thumbs[key] && !isTrackCover(thumbs[key])) return thumbs[key];
    } catch {}
    return '';
  });
  const [isLoading, setIsLoading] = React.useState<boolean>(!avatar);

  React.useEffect(() => {
    const key = artistName.toLowerCase();
    const cached = globalArtistAvatarCache.get(key);
    if (cached && !isTrackCover(cached)) {
      setAvatar(cached);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);

    const fetchArtistPfp = async () => {
      try {
        const res = await invoke<string>('search_youtube_artists', { query: artistName });
        if (isCancelled) return;
        const lines = res.trim().split('\n').filter(Boolean);
        let foundPfp = '';
        for (const line of lines) {
          const parts = line.split('====');
          const pfp = parts[1]?.trim();
          if (pfp && pfp.startsWith('http') && !isTrackCover(pfp)) {
            foundPfp = pfp;
            break;
          }
        }
        if (foundPfp) {
          globalArtistAvatarCache.set(key, foundPfp);
          try {
            const thumbs = JSON.parse(localStorage.getItem('vg_artist_thumbs') || '{}');
            thumbs[key] = foundPfp;
            localStorage.setItem('vg_artist_thumbs', JSON.stringify(thumbs));
          } catch {}
          if (!isCancelled) {
            setAvatar(foundPfp);
          }
        }
      } catch {
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    fetchArtistPfp();
    return () => { isCancelled = true; };
  }, [artistName]);

  return (
    <div
      onClick={() => onArtistClick(artistName, avatar || undefined)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        background: 'linear-gradient(135deg, rgba(var(--v-accent-rgb), 0.08) 0%, var(--v-bg2, #141212) 100%)',
        border: '1px solid rgba(var(--v-accent-rgb), 0.25)',
        borderRadius: '12px',
        marginBottom: '16px',
        cursor: 'pointer',
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--v-accent)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(var(--v-accent-rgb), 0.25)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            overflow: 'hidden',
            background: getTrackGradient(artistName, 'artist'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--v-accent)',
            flexShrink: 0,
            position: 'relative'
          }}
        >
          <Music size={18} style={{ color: 'rgba(255,255,255,0.3)', position: 'absolute' }} />
          {avatar ? (
            <img
              src={avatar}
              alt={artistName}
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
              onError={e => {
                e.currentTarget.style.display = 'none';
              }}
              loading="eager"
              decoding="async"
            />
          ) : isLoading ? (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.3)'
            }}>
              <div style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.2)',
                borderTopColor: 'var(--v-accent)',
                animation: 'spin 0.8s linear infinite'
              }} />
            </div>
          ) : null}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--v-accent)' }}>
              Artist
            </span>
            <Sparkles size={11} style={{ color: 'var(--v-accent)' }} />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--v-fg)', marginTop: '2px' }}>
            {artistName}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--v-fg3)', marginTop: '2px' }}>
            View artist profile, banner & all-time top songs
          </div>
        </div>
      </div>

      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--v-accent)',
          color: '#000',
          border: 'none',
          borderRadius: '9999px',
          padding: '7px 16px',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          flexShrink: 0
        }}
      >
        <span>View Artist</span>
        <ChevronRight size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
});

export const HomeView: React.FC<HomeViewProps> = React.memo(({
  searchQuery,
  setSearchQuery,
  searchHistory,
  setSearchHistory,
  showHistory,
  setShowHistory,
  isSearching,
  hasSearched,
  setHasSearched,
  searchError,
  setSearchError,
  ytMusicTracks,
  setYtMusicTracks,
  videoTracks,
  setVideoTracks,
  tracks,
  setTracks,
  searchTab,
  setSearchTab,
  quickPicks,
  setQuickPicks,
  searchRef: customSearchRef,
  searchMusic,
  handlePlayTrack: _handlePlayTrack,
  resetSearch: _resetSearch,
  updateAvailable = null,
  setActiveNav,
  setSettingsTab,
  isHydrated = true,
  isOnline = true,
  onNavigateOffline,
  localTracks = [],
  playHistory,
  playlists = [],
  setPlaylists: _setPlaylists,
  playCounts,
  currentTrack,
  loadingTrackUrl,
  isLoadingTrack,
  isPlaying,
  hoveredTrackUrl: customHoveredTrackUrl,
  setHoveredTrackUrl: customSetHoveredTrackUrl,
  downloadingTracks,
  handlePlayInContext,
  playAll: customPlayAll,
  toggleLikeTrack,
  isTrackLiked,
  handleDownload,
  openCtx,
  prefetchOnHover: customPrefetchOnHover,
  clearSearchHistory: _clearSearchHistory,
  removeSearchHistoryItem: _removeSearchHistoryItem,
  getTrackCover: customGetTrackCover,
  setOpenPlaylistId,
  showToast,
  addToQueue,
  recommendedTracks = [],
  onRefreshRecommendations,
  onOpenPersonalization,
  onArtistClick,
  followedArtists = [],
}) => {
  const defaultSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = customSearchRef || defaultSearchRef;
  const [internalHoveredTrackUrl, setInternalHoveredTrackUrl] = React.useState<string | null>(null);
  const hoveredTrackUrl = customHoveredTrackUrl !== undefined ? customHoveredTrackUrl : internalHoveredTrackUrl;
  const setHoveredTrackUrl = customSetHoveredTrackUrl || setInternalHoveredTrackUrl;
  const prefetchOnHover = customPrefetchOnHover || (() => {});

  const handleClearSearch = () => {
    setShowHistory(false);
    if (_resetSearch) {
      _resetSearch();
    } else {
      setSearchQuery('');
      setHasSearched?.(false);
      setTracks?.([]);
      setYtMusicTracks?.([]);
      setVideoTracks?.([]);
      setSearchError?.(null);
    }
  };

  const handleClearRecentSearches = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (_clearSearchHistory) {
      _clearSearchHistory();
    } else {
      setSearchHistory?.([]);
      setShowHistory(false);
    }
  };

  const { selectedUrls, isMultiSelectActive, toggleSelect, clearSelection } = useMultiSelect();

  React.useEffect(() => {
    clearSelection();
  }, [searchTab, searchQuery, clearSelection]);

  const playAll = customPlayAll || ((list: Track[]) => {
    if (list.length > 0) handlePlayInContext(list[0], list);
  });
  const getTrackCover = customGetTrackCover || ((track: Track | null | undefined) => getTrackCoverUrl(track));

  const localAsTrack: Track[] = useMemo(() => {
    return localTracks.map((lt, i) => ({
      id: -(i + 1),
      title: lt.title,
      artist: lt.artist || '',
      album: lt.album || '',
      url: `local://${lt.path}`,
      cover: lt.cover || '',
      duration: lt.duration || '',
    }));
  }, [localTracks]);

  const allTracksForGenre = useMemo(() => {
    const map = new Map<string, Track>();
    for (let i = 0; i < quickPicks.length; i++) {
      const t = quickPicks[i];
      if (t?.url) map.set(t.url, t);
    }
    for (let i = 0; i < playHistory.length; i++) {
      const t = playHistory[i];
      if (t?.url) map.set(t.url, t);
    }
    for (let i = 0; i < localAsTrack.length; i++) {
      const t = localAsTrack[i];
      if (t?.url) map.set(t.url, t);
    }
    for (let i = 0; i < playlists.length; i++) {
      const p = playlists[i];
      if (p?.tracks) {
        for (let j = 0; j < p.tracks.length; j++) {
          const t = p.tracks[j];
          if (t?.url) map.set(t.url, t);
        }
      }
    }
    return Array.from(map.values());
  }, [quickPicks, playHistory, localAsTrack, playlists]);

  const { genreScores, activeGenres } = useMemo(() => {
    const scores: Record<string, { score: number; tracks: Track[] }> = {};
    const trackSetMap: Record<string, Set<string>> = {};
    for (let i = 0; i < GENRES.length; i++) {
      const g = GENRES[i];
      scores[g.id] = { score: 0, tracks: [] };
      trackSetMap[g.id] = new Set<string>();
    }

    for (let i = 0; i < allTracksForGenre.length; i++) {
      const track = allTracksForGenre[i];
      const playCount = playCounts[track.url] || 1;
      for (let j = 0; j < GENRES.length; j++) {
        const g = GENRES[j];
        if (matchGenreTrack(track, g)) {
          scores[g.id].score += playCount;
          if (!trackSetMap[g.id].has(track.url)) {
            trackSetMap[g.id].add(track.url);
            scores[g.id].tracks.push(track);
          }
        }
      }
    }

    for (let i = 0; i < GENRES.length; i++) {
      const g = GENRES[i];
      scores[g.id].tracks.sort((a, b) => (playCounts[b.url] || 0) - (playCounts[a.url] || 0));
    }

    const active = GENRES.filter(g => scores[g.id].tracks.length >= 2)
      .sort((a, b) => scores[b.id].score - scores[a.id].score)
      .slice(0, 5);

    return { genreScores: scores, activeGenres: active };
  }, [allTracksForGenre, playCounts]);

  const topTracks = useMemo(() => {
    const trackMap = new Map(allTracksForGenre.map(t => [t.url, t]));
    return Object.entries(playCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([url]) => trackMap.get(url))
      .filter(Boolean) as Track[];
  }, [allTracksForGenre, playCounts]);

  const libraryTotalTrackCount = useMemo(() => {
    return localAsTrack.length + playlists.reduce((acc, p) => acc + (p?.tracks?.length || 0), 0);
  }, [localAsTrack, playlists]);

  const recentHistory = useMemo(() => playHistory.slice(0, 5), [playHistory]);
  const hour = new Date().getHours();
  let greeting = 'Welcome back';
  if (hour < 12) {
    greeting = 'Good Morning';
  } else if (hour < 17) {
    greeting = 'Good Afternoon';
  } else {
    greeting = 'Good Evening';
  }

  const hasHomeContent = useMemo(() => {
    return (
      quickPicks.length > 0 ||
      recommendedTracks.length > 0 ||
      playHistory.length > 0 ||
      localTracks.length > 0 ||
      playlists.length > 0
    );
  }, [quickPicks.length, recommendedTracks.length, playHistory.length, localTracks.length, playlists.length]);

  const scrollShelf = (e: React.MouseEvent, direction: 'left' | 'right') => {
    const btn = e.currentTarget as HTMLElement;
    const parent = btn.parentElement;
    if (parent) {
      const container = parent.querySelector('.shelf-scroll-container') as HTMLElement;
      if (container) {
        const offset = direction === 'left' ? -360 : 360;
        container.scrollBy({ left: offset, behavior: 'smooth' });
      }
    }
  };

  const handleSearchSubmit = () => {
    if (!isOnline) {
      showToast?.('Cannot search while offline. Check your internet connection.');
      return;
    }
    if (!isSearching && searchQuery.trim()) {
      setShowHistory(false);
      searchMusic();
    }
  };

  return (
    <>
      <div style={{padding:"16px 24px 10px",position:"relative",zIndex:30,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center"}}>
        {!isOnline && (
          <div style={{
            width: "100%",
            maxWidth: "760px",
            marginBottom: "12px",
            padding: "10px 16px",
            borderRadius: "12px",
            background: "rgba(224, 85, 85, 0.08)",
            border: "1px solid rgba(224, 85, 85, 0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            color: "#ff8a8a",
            fontSize: "12.5px",
            boxSizing: "border-box"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <WifiOff size={15} style={{ color: "#ff6b6b", flexShrink: 0 }} />
              <span>You are offline. Streaming and search are unavailable, but your saved downloads are ready to play.</span>
            </div>
            <button
              onClick={() => onNavigateOffline ? onNavigateOffline() : setActiveNav('downloads')}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                color: "#ffffff",
                borderRadius: "20px",
                padding: "4px 12px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.12s"
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.16)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"}
            >
              Go to Offline
            </button>
          </div>
        )}
        <div className="v-home-search-container" onClick={e=>e.stopPropagation()}>
          <div style={{position:"relative",flex:1}}>
            <button
              type="button"
              onClick={handleSearchSubmit}
              disabled={isSearching || !searchQuery.trim()}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: "4px",
                width: "38px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: searchQuery.trim() && !isSearching ? "pointer" : "default",
                zIndex: 2,
                color: searchQuery.trim() ? "var(--v-accent)" : "#8a807c",
                transition: "all .15s ease",
                padding: 0
              }}
              title="Search"
            >
              {isSearching
                ? <div style={{width:"15px",height:"15px",border:"2px solid var(--v-accent)",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                : <Search size={16} /> }
            </button>
            <input ref={searchRef} type="text"
              placeholder={isOnline ? "Search YouTube..." : "Offline: connect to internet to search..."}
              value={searchQuery} readOnly={isSearching}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => !isSearching && setShowHistory(searchHistory.length > 0)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleSearchSubmit();
                }
                if (e.key === 'Escape') {
                  setShowHistory(false);
                  e.currentTarget.blur();
                }
              }}
              style={{width:'100%',height:'42px',background:'var(--v-bg2)',color:'#e2ddd9',border:`1px solid ${isSearching?'rgba(226,221,217,0.15)':'var(--v-bdr2)'}`,borderRadius:'21px',paddingTop:0,paddingBottom:0,paddingLeft:'44px',paddingRight:searchQuery?'38px':'16px',fontSize:'13.5px',outline:'none',opacity:isSearching?0.5:1,cursor:isSearching?'not-allowed':'text',transition:'border-color .15s',boxSizing:'border-box'}}
            />
            {searchQuery && !isSearching && (
              <button
                type="button"
                onClick={handleClearSearch}
                title="Clear search"
                style={{position:"absolute",right:"12px",top:0,bottom:0,margin:"auto",background:"none",border:"none",color:"#8a807c",cursor:"pointer",display:"flex",alignItems:"center",padding:0}}
                onMouseEnter={e=>(e.currentTarget.style.color="#e2ddd9")}
                onMouseLeave={e=>(e.currentTarget.style.color="#8a807c")}>
                <X size={14}/>
              </button>
            )}
            {showHistory && (
              <div style={{position:'absolute',top:'100%',left:0,right:0,marginTop:'6px',background:'var(--v-bg2)',border:'1px solid var(--v-bdr2)',borderRadius:'12px',overflow:'hidden',boxShadow:'0 12px 32px rgba(0,0,0,0.7)',zIndex:100}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px',borderBottom:'1px solid var(--v-bdr2)'}}>
                  <span style={{fontSize:'9.5px',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'#8a807c'}}>Recent Searches</span>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                    onClick={handleClearRecentSearches}
                    style={{background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:'#8a807c',transition:'color .12s'}}
                    onMouseEnter={e=>(e.currentTarget.style.color='#b05555')}
                    onMouseLeave={e=>(e.currentTarget.style.color='#8a807c')}
                  >
                    Clear
                  </button>
                </div>
                <div style={{ maxHeight: '280px', overflowY: 'auto' }} className="custom-scrollbar">
                  {searchHistory.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 8px 0 14px',
                      background: 'transparent',
                      transition: 'background .08s',
                      boxSizing: 'border-box'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(226,221,217,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={e => {
                        e.stopPropagation();
                        setSearchQuery(h);
                        setShowHistory(false);
                        searchMusic(h);
                      }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '9px 0',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        minWidth: 0
                      }}
                    >
                      <Clock size={12} style={{ color: '#8a807c', flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', color: '#9e9894', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {h}
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Remove from history"
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={e => {
                        e.stopPropagation();
                        if (_removeSearchHistoryItem) {
                          _removeSearchHistoryItem(h);
                        } else {
                          setSearchHistory?.(prev => prev.filter(item => item !== h));
                        }
                      }}
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        color: '#8a807c',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'color .12s, background .12s'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#e05555';
                        e.currentTarget.style.background = 'rgba(224,85,85,0.14)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = '#8a807c';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
          {updateAvailable && (
            <button
              onClick={() => { setActiveNav('settings'); setSettingsTab?.('updates'); }}
              title={`Update available: v${updateAvailable}`}
              style={{
                flexShrink: 0,
                width: "42px",
                height: "42px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "21px",
                border: "1px solid var(--v-bdr2)",
                background: "var(--v-bg2)",
                color: "#8a807c",
                cursor: "pointer",
                position: "relative",
                transition: "all .15s ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "var(--v-bdr3)";
                e.currentTarget.style.color = "#e2ddd9";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "var(--v-bdr2)";
                e.currentTarget.style.color = "#8a807c";
              }}
            >
              <Info size={17} />
              <span style={{position:"absolute",top:"5px",right:"5px",width:"6px",height:"6px",borderRadius:"50%",background:"#9e9894"}}/>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar" style={{padding:"24px 30px 140px",zIndex:10}} onClick={()=>setShowHistory(false)}>
        {!hasSearched && !isSearching && !hasHomeContent && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",minHeight:"280px",gap:"20px"}}>
            <div className="relative">
              <div style={{width:'56px',height:'56px',borderRadius:'12px',background:'var(--v-bg2)',border:'1px solid var(--v-bdr2)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <Music size={24} strokeWidth={1} style={{color:'#363230'}} />
              </div>
              <div style={{position:"absolute",bottom:"-6px",right:"-6px",width:"26px",height:"26px",background:"rgba(226,221,217,0.06)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Search size={12} className="text-[#d4cfcf]/60" />
              </div>
            </div>
            <div style={{textAlign:"center",display:"flex",flexDirection:"column",gap:"5px"}}>
              <p style={{fontSize:"13px",fontWeight:600,color:"#5c5755"}}>Search YouTube to start</p>
              <p style={{fontSize:"11px",color:"#363230"}}>Type above and press <kbd>Ctrl+F</kbd></p>
            </div>
          </div>
        )}

        {!hasSearched && !isSearching && hasHomeContent && isHydrated && (
          <div style={{display:"flex",flexDirection:"column",gap:"36px",paddingTop:"4px"}}>
            {/* Hero Greeting Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 0 8px 0'
            }}>
              <div>
                <h1 style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  color: 'var(--v-fg)',
                  letterSpacing: '-0.02em',
                  margin: 0
                }}>{greeting}</h1>
                <p style={{
                  fontSize: '13px',
                  color: 'var(--v-fg2)',
                  margin: '3px 0 0'
                }}>Ready to discover and play your favorite tracks?</p>
              </div>
              <div style={{
                zIndex: 1,
                display: 'flex',
                gap: '12px',
                alignItems: 'center'
              }}>
                {quickPicks.length > 0 ? (
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <button
                      onClick={() => handlePlayInContext(quickPicks[0], quickPicks)}
                      style={{
                        display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',borderRadius:'20px',
                        background:'var(--v-accent)',color:'#0c0b0b',border:'none',fontSize:'12px',fontWeight:700,cursor:'pointer',
                        boxShadow:'0 4px 14px rgba(0,0,0,0.4)',transition:'transform 0.15s ease'
                      }}
                      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.04)'}
                      onMouseLeave={e=>e.currentTarget.style.transform='none'}
                    >
                      <Play size={12} fill="#0c0b0b" />
                      <span>Resume</span>
                    </button>
                    <button
                      onClick={() => {
                        const shuffled = [...quickPicks].sort(() => 0.5 - Math.random());
                        if (shuffled[0]) handlePlayInContext(shuffled[0], shuffled);
                      }}
                      style={{
                        display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',borderRadius:'20px',
                        background:'rgba(255,255,255,0.06)',color:'var(--v-fg)',border:'1px solid rgba(255,255,255,0.08)',
                        fontSize:'12px',fontWeight:600,cursor:'pointer',transition:'background 0.15s ease'
                      }}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.1)'}
                      onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'}
                    >
                      <Shuffle size={12} />
                      <span>Shuffle</span>
                    </button>
                  </div>
                ) : (recommendedTracks && recommendedTracks.length > 0) ? (
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <button
                      onClick={() => handlePlayInContext(recommendedTracks[0], recommendedTracks)}
                      style={{
                        display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',borderRadius:'20px',
                        background:'var(--v-accent)',color:'#0c0b0b',border:'none',fontSize:'12px',fontWeight:700,cursor:'pointer',
                        boxShadow:'0 4px 14px rgba(0,0,0,0.4)',transition:'transform 0.15s ease'
                      }}
                      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.04)'}
                      onMouseLeave={e=>e.currentTarget.style.transform='none'}
                    >
                      <Play size={12} fill="#0c0b0b" />
                      <span>Play Picks</span>
                    </button>
                    <button
                      onClick={() => {
                        const shuffled = [...recommendedTracks].sort(() => 0.5 - Math.random());
                        if (shuffled[0]) handlePlayInContext(shuffled[0], shuffled);
                      }}
                      style={{
                        display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',borderRadius:'20px',
                        background:'rgba(255,255,255,0.06)',color:'var(--v-fg)',border:'1px solid rgba(255,255,255,0.08)',
                        fontSize:'12px',fontWeight:600,cursor:'pointer',transition:'background 0.15s ease'
                      }}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.1)'}
                      onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'}
                    >
                      <Shuffle size={12} />
                      <span>Shuffle</span>
                    </button>
                  </div>
                ) : null}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  marginLeft: '8px'
                }}>
                  <span style={{ fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--v-fg3)', fontWeight: 700 }}>Library</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--v-fg)', marginTop: '2px' }}>
                    {libraryTotalTrackCount} Tracks
                  </span>
                </div>
              </div>
            </div>

            {/* Recommended for You Shelf (Tailored Starter & Discoveries) */}
            {recommendedTracks && recommendedTracks.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={14} style={{ color: 'var(--v-accent)' }} />
                    <h2 style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--v-fg3)',
                      margin: 0
                    }}>Recommended For You</h2>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {onOpenPersonalization && (
                      <button
                        onClick={onOpenPersonalization}
                        title="Tune Music Preferences"
                        style={{
                          background: 'transparent',
                          color: 'var(--v-fg3)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          transition: 'color .12s, border-color .12s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = 'var(--v-fg)';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = 'var(--v-fg3)';
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <SlidersHorizontal size={12} />
                        <span>Tune Taste</span>
                      </button>
                    )}

                    {onRefreshRecommendations && (
                      <button
                        onClick={onRefreshRecommendations}
                        title="Refresh Suggestions"
                        style={{
                          background: 'transparent',
                          color: 'var(--v-fg3)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'color .12s, border-color .12s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = 'var(--v-fg)';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = 'var(--v-fg3)';
                          e.currentTarget.style.borderColor = 'transparent';
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <RefreshCw size={12} />
                        <span>Refresh</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="v-home-quickpicks-grid">
                  {recommendedTracks.slice(0, 15).map((track, cardIdx) => {
                    const isActive = currentTrack?.url === track.url;
                    const isCardLoading = loadingTrackUrl === track.url || (isActive && isLoadingTrack);
                    return (
                      <div
                        key={track.url}
                        onClick={() => handlePlayInContext(track, recommendedTracks.slice(0, 15))}
                        onContextMenu={e => openCtx(e, { type: 'quickpick', track })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: isActive ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                          border: '1px solid transparent',
                          transition: 'background .15s ease, transform .15s ease',
                          animation: `fadeUpSm .18s cubic-bezier(0.2,0,0,1) ${cardIdx * 25}ms both`,
                        }}
                        onMouseEnter={e => {
                          prefetchOnHover(track.url);
                          e.currentTarget.style.background = isActive ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.035)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = isActive ? 'rgba(255, 255, 255, 0.04)' : 'transparent';
                        }}
                      >
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          flexShrink: 0,
                          position: 'relative',
                          background: getTrackGradient(track.title, track.artist),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid rgba(255, 255, 255, 0.04)'
                        }}>
                          <Music size={14} style={{ position: 'absolute', color: 'rgba(255,255,255,0.2)' }} />
                          {getTrackCover(track) && (
                            <img
                              src={getTrackCover(track)}
                              alt={track.title}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                              }}
                              onError={handleThumbnailError}
                              loading="lazy"
                            />
                          )}
                          {isCardLoading ? (
                            <div style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(0,0,0,0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" style={{ animation: 'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}>
                                <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(226,221,217,0.2)" strokeWidth="2.5" />
                                <circle cx="12" cy="12" r="8.5" fill="none" stroke="#e2ddd9" strokeWidth="2.5" strokeDasharray="53.4" strokeDashoffset="36" strokeLinecap="round" />
                              </svg>
                            </div>
                          ) : isActive && isPlaying ? (
                            <div style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(0,0,0,0.5)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <div style={{
                                display: 'flex',
                                gap: '2px',
                                alignItems: 'flex-end',
                                height: '10px'
                              }}>
                                {[100, 65, 80].map((h, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      width: '2px',
                                      background: 'var(--v-accent)',
                                      borderRadius: '1px',
                                      height: `${h}%`,
                                      animation: `barBounce ${0.7 + i * 0.12}s ease-in-out ${i * 110}ms infinite`,
                                      transformOrigin: 'bottom'
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '13.5px',
                            fontWeight: 600,
                            color: isActive ? 'var(--v-accent)' : 'var(--v-fg)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.3
                          }}>{track.title}</div>
                          {cleanArtist(track.artist) && (
                            <div style={{
                              fontSize: '11.5px',
                              color: 'var(--v-fg2)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: '2px'
                            }}>{cleanArtist(track.artist)}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {quickPicks && quickPicks.length > 0 && (
              <div>
                <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={14} style={{ color: 'var(--v-accent)' }} />
                  <h2 style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--v-fg3)',
                    margin: 0
                  }}>Recently Played</h2>
                </div>
                <button
                  onClick={() => setQuickPicks?.([])}
                  style={{
                    background: 'transparent',
                    color: 'var(--v-fg3)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid transparent',
                    transition: 'color .12s, border-color .12s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--v-fg2)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--v-fg3)';
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >Clear</button>
              </div>
              <div className="v-home-quickpicks-grid">
                {quickPicks.slice(0, 10).map((track, cardIdx) => {
                  const isActive = currentTrack?.url === track.url;
                  const isCardLoading = loadingTrackUrl === track.url || (isActive && isLoadingTrack);
                  return (
                    <div
                      key={track.url}
                      onClick={() => handlePlayInContext(track, quickPicks.slice(0, 10))}
                      onContextMenu={e => openCtx(e, { type: 'quickpick', track })}
                      style={{
                         display: 'flex',
                         alignItems: 'center',
                         gap: '12px',
                         padding: '8px 10px',
                         borderRadius: '8px',
                         cursor: 'pointer',
                         background: isActive ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                         border: '1px solid transparent',
                         transition: 'background .15s ease, transform .15s ease',
                         animation: `fadeUpSm .18s cubic-bezier(0.2,0,0,1) ${cardIdx * 25}ms both`,
                       }}
                       onMouseEnter={e => {
                         prefetchOnHover(track.url);
                         e.currentTarget.style.background = isActive ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.035)';
                       }}
                       onMouseLeave={e => {
                         e.currentTarget.style.background = isActive ? 'rgba(255, 255, 255, 0.04)' : 'transparent';
                       }}
                    >
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        flexShrink: 0,
                        position: 'relative',
                        background: getTrackGradient(track.title, track.artist),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(255, 255, 255, 0.04)'
                      }}>
                        <Music size={14} style={{ position: 'absolute', color: 'rgba(255,255,255,0.2)' }} />
                        {getTrackCover(track) && (
                          <img
                            src={getTrackCover(track)}
                            alt={track.title}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                            onError={handleThumbnailError}
                            loading="lazy"
                          />
                        )}
                        {isCardLoading ? (
                           <div style={{
                             position: 'absolute',
                             inset: 0,
                             background: 'rgba(0,0,0,0.2)',
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'center'
                           }}>
                             <svg width="18" height="18" viewBox="0 0 24 24" style={{ animation: 'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}>
                               <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(226,221,217,0.2)" strokeWidth="2.5" />
                               <circle cx="12" cy="12" r="8.5" fill="none" stroke="#e2ddd9" strokeWidth="2.5" strokeDasharray="53.4" strokeDashoffset="36" strokeLinecap="round" />
                             </svg>
                           </div>
                        ) : isActive && isPlaying ? (
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0,0,0,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <div style={{
                              display: 'flex',
                              gap: '2px',
                              alignItems: 'flex-end',
                              height: '10px'
                            }}>
                              {[100, 65, 80].map((h, i) => (
                                <div
                                  key={i}
                                  style={{
                                    width: '2px',
                                    background: 'var(--v-accent)',
                                    borderRadius: '1px',
                                    height: `${h}%`,
                                    animation: `barBounce ${0.7 + i * 0.12}s ease-in-out ${i * 110}ms infinite`,
                                    transformOrigin: 'bottom'
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: isActive ? 'var(--v-accent)' : 'var(--v-fg)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.3
                        }}>{track.title}</div>
                        {cleanArtist(track.artist) && (
                          <div style={{
                            fontSize: '11.5px',
                            color: 'var(--v-fg2)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: '2px'
                          }}>{cleanArtist(track.artist)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

            <div className="v-home-split-layout">
              <div className="v-home-main-col">
                {activeGenres.map((genre, gIdx) => {
                  const genreTracks = genreScores[genre.id].tracks.slice(0, 10);
                  return (
                    <div
                      key={genre.id}
                      className="shelf-group"
                      style={{
                        position: 'relative',
                        animation: `fadeUp 0.22s cubic-bezier(0.2,0,0,1) ${gIdx * 60 + 100}ms both`
                      }}
                    >
                      <div className="v-section-head" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <VelunaGenreIcon id={genre.id} size={20} style={{ color: 'var(--v-accent)', flexShrink: 0 }} />
                          <div>
                            <h2 style={{
                              fontSize: '12.5px',
                              fontWeight: 800,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: 'var(--v-fg)',
                              margin: 0
                            }}>{genre.label}</h2>
                            {genre.tagline && (
                              <p style={{
                                fontSize: '11px',
                                color: 'var(--v-fg3)',
                                margin: '2px 0 0 0',
                                fontWeight: 500
                              }}>{genre.tagline}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => scrollShelf(e, 'left')}
                        className="shelf-nav-btn"
                        style={{
                          position: 'absolute',
                          left: '-16px',
                          top: '55%',
                          transform: 'translateY(-50%)',
                          zIndex: 10,
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          background: 'rgba(var(--v-bg2-rgb), 0.92)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--v-fg)',
                          cursor: 'pointer',
                          opacity: 0,
                          transition: 'opacity 0.2s, background 0.2s, transform 0.2s',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                        }}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={(e) => scrollShelf(e, 'right')}
                        className="shelf-nav-btn"
                        style={{
                          position: 'absolute',
                          right: '-16px',
                          top: '55%',
                          transform: 'translateY(-50%)',
                          zIndex: 10,
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          background: 'rgba(var(--v-bg2-rgb), 0.92)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--v-fg)',
                          cursor: 'pointer',
                          opacity: 0,
                          transition: 'opacity 0.2s, background 0.2s, transform 0.2s',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                        }}
                      >
                        <ChevronRight size={16} />
                      </button>
                      <div
                        className="shelf-scroll-container"
                        style={{
                          display: 'flex',
                          gap: '12px',
                          overflowX: 'auto',
                          paddingBottom: '8px',
                          scrollbarWidth: 'none'
                        }}
                      >
                        {genreTracks.map((track, tIdx) => {
                          const isActive = currentTrack?.url === track.url;
                          const isCardLoading = loadingTrackUrl === track.url || (isActive && isLoadingTrack);
                          return (
                            <div
                              key={track.url}
                              onClick={() => handlePlayInContext(track, genreTracks)}
                              onContextMenu={e => openCtx(e, { type: 'track', track })}
                              className={`v-card${isActive ? ' v-card--active' : ''}`}
                              style={{
                                animationDelay: `${tIdx * 25 + gIdx * 60}ms`,
                                flexShrink: 0,
                                width: '160px',
                              }}
                              onMouseEnter={() => prefetchOnHover(track.url)}
                            >
                              <div style={{
                                position: 'relative',
                                aspectRatio: '1',
                                width: '100%',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                background: getTrackGradient(track.title, track.artist),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '8px'
                              }} className="v-card__art-container">
                                <div style={{ position: 'absolute', color: 'rgba(255,255,255,0.22)' }}>
                                  <VelunaGenreIcon id={genre.id} size={24} />
                                </div>
                                {getTrackCover(track) && (
                                  <img
                                    src={getTrackCover(track)}
                                    alt={track.title}
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover'
                                    }}
                                    onError={handleThumbnailError}
                                    loading="lazy"
                                  />
                                )}
                                {isCardLoading ? (
                                   <div style={{
                                     position: 'absolute',
                                     inset: 0,
                                     background: 'rgba(0,0,0,0.2)',
                                     display: 'flex',
                                     alignItems: 'center',
                                     justifyContent: 'center'
                                   }}>
                                     <svg width="18" height="18" viewBox="0 0 24 24" style={{ animation: 'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}>
                                       <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(226,221,217,0.15)" strokeWidth="2.5" />
                                       <circle cx="12" cy="12" r="8.5" fill="none" stroke="#e2ddd9" strokeWidth="2.5" strokeDasharray="53.4" strokeDashoffset="36" strokeLinecap="round" />
                                     </svg>
                                   </div>
                                ) : isActive && isPlaying ? (
                                  <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'rgba(0,0,0,0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}>
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
                                  </div>
                                ) : null}
                                {!isActive && (
                                  <div
                                    className="v-card__hover-overlay"
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      background: 'rgba(0,0,0,0.45)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'opacity 0.2s ease',
                                      opacity: 0,
                                      zIndex: 5
                                    }}
                                  >
                                    <div style={{
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '50%',
                                      background: 'var(--v-accent)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#0c0b0b',
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                      transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                                    }}>
                                      <Play size={14} style={{ fill: 'currentColor', marginLeft: '1px' }} />
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="v-card__title" style={{
                                color: isActive ? 'var(--v-accent)' : 'var(--v-fg)',
                                lineHeight: 1.3
                              }}>{track.title}</div>
                              {cleanArtist(track.artist) && (
                                <div className="v-card__artist">{cleanArtist(track.artist)}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="v-home-sidebar-col">
                {topTracks.length >= 3 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(255, 255, 255, 0.015)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    borderRadius: '14px',
                    padding: '14px 14px 16px 14px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                    animation: 'fadeUp 0.22s cubic-bezier(0.2,0,0,1) 200ms both'
                  }}>
                    <h2 style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: 'var(--v-fg)',
                      letterSpacing: '-0.01em',
                      margin: '0 0 10px 0'
                    }}>Most Played</h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {topTracks.map((track, i) => {
                        const isActive = currentTrack?.url === track.url;
                        const count = playCounts[track.url] || 0;
                        const maxCount = playCounts[topTracks[0].url] || 1;
                        return (
                          <div
                            key={track.url}
                            onClick={() => handlePlayInContext(track, topTracks)}
                            onContextMenu={e => openCtx(e, { type: 'track', track })}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '6px 8px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: isActive ? 'rgba(255,255,255,0.045)' : 'transparent',
                              transition: 'background 0.15s ease'
                            }}
                            onMouseEnter={e => {
                              prefetchOnHover(track.url);
                              if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
                            }}
                            onMouseLeave={e => {
                              if (!isActive) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{
                              fontSize: '11.5px',
                              fontWeight: 700,
                              color: i === 0 ? '#d4af37' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--v-fg3)',
                              width: '16px',
                              textAlign: 'center',
                              flexShrink: 0,
                              fontVariantNumeric: 'tabular-nums'
                            }}>{i + 1}</div>

                            <div style={{
                              position: 'relative',
                              width: '36px',
                              height: '36px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              background: getTrackGradient(track.title, track.artist),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              border: '1px solid rgba(255,255,255,0.05)'
                            }}>
                              <Music size={12} style={{ position: 'absolute', color: 'rgba(255,255,255,0.2)' }} />
                              {getTrackCover(track) && (
                                <img
                                  src={getTrackCover(track)}
                                  alt={track.title}
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                  }}
                                  onError={handleThumbnailError}
                                  loading="lazy"
                                />
                              )}
                              {isActive && isPlaying && (
                                <div style={{
                                  position: 'absolute',
                                  inset: 0,
                                  background: 'rgba(0,0,0,0.45)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '10px' }}>
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
                                </div>
                              )}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: '12.5px',
                                fontWeight: 600,
                                color: isActive ? 'var(--v-accent)' : 'var(--v-fg)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: '1.25'
                              }}>{track.title}</div>
                              {cleanArtist(track.artist) && (
                                <div style={{
                                  fontSize: '11px',
                                  color: 'var(--v-fg2)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  marginTop: '1px'
                                }}>{cleanArtist(track.artist)}</div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <div style={{
                                  flex: 1,
                                  height: '2px',
                                  background: 'var(--v-bdr2)',
                                  borderRadius: '1px',
                                  overflow: 'hidden'
                                }}>
                                  <div style={{
                                    height: '100%',
                                    background: 'var(--v-accent)',
                                    borderRadius: '1px',
                                    width: `${(count / maxCount) * 100}%`,
                                    transition: 'width 0.4s ease'
                                  }} />
                                </div>
                                <span style={{
                                  fontSize: '9.5px',
                                  color: 'var(--v-fg2)',
                                  fontVariantNumeric: 'tabular-nums',
                                  flexShrink: 0
                                }}>{count}×</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {recentHistory.length >= 3 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(255, 255, 255, 0.015)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    borderRadius: '14px',
                    padding: '14px 14px 16px 14px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                    animation: 'fadeUp 0.22s cubic-bezier(0.2,0,0,1) 250ms both'
                  }}>
                    <h2 style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: 'var(--v-fg)',
                      letterSpacing: '-0.01em',
                      margin: '0 0 10px 0'
                    }}>Play History</h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {recentHistory.map((track, i) => {
                        const isActive = currentTrack?.url === track.url;
                        return (
                          <div
                            key={track.url + i}
                            onClick={() => handlePlayInContext(track, recentHistory)}
                            onContextMenu={e => openCtx(e, { type: 'track', track })}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '6px 8px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: isActive ? 'rgba(255,255,255,0.045)' : 'transparent',
                              transition: 'background 0.15s ease'
                            }}
                            onMouseEnter={e => {
                              if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
                            }}
                            onMouseLeave={e => {
                              if (!isActive) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <div style={{
                              position: 'relative',
                              width: '36px',
                              height: '36px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              background: getTrackGradient(track.title, track.artist),
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              border: '1px solid rgba(255,255,255,0.05)'
                            }}>
                              <Music size={12} style={{ position: 'absolute', color: 'rgba(255,255,255,0.2)' }} />
                              {getTrackCover(track) && (
                                <img
                                  src={getTrackCover(track)}
                                  alt=""
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                  }}
                                  onError={handleThumbnailError}
                                  loading="lazy"
                                />
                              )}
                              {isActive && isPlaying && (
                                <div style={{
                                  position: 'absolute',
                                  inset: 0,
                                  background: 'rgba(0,0,0,0.45)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '10px' }}>
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
                                </div>
                              )}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: '12.5px',
                                fontWeight: 600,
                                color: isActive ? 'var(--v-accent)' : 'var(--v-fg)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: '1.25'
                              }}>{track.title}</div>
                              {cleanArtist(track.artist) && (
                                <div style={{
                                  fontSize: '11px',
                                  color: 'var(--v-fg2)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  marginTop: '1px'
                                }}>{cleanArtist(track.artist)}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeGenres.length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(255, 255, 255, 0.015)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    borderRadius: '14px',
                    padding: '14px 14px 16px 14px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                    animation: 'fadeUp 0.22s cubic-bezier(0.2,0,0,1) 280ms both'
                  }}>
                    <h2 style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: 'var(--v-fg)',
                      letterSpacing: '-0.01em',
                      margin: '0 0 10px 0'
                    }}>Veluna Insights</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {activeGenres.slice(0, 3).map(genre => {
                        const score = genreScores[genre.id].score;
                        const maxScore = genreScores[activeGenres[0].id]?.score || 1;
                        const percent = Math.min((score / maxScore) * 100, 100);
                        return (
                          <div key={genre.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '5px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: 'var(--v-accent)', display: 'flex', alignItems: 'center' }}>
                                  <VelunaGenreIcon id={genre.id} size={13} />
                                </span>
                                <span style={{ color: 'var(--v-fg)', fontWeight: 600 }}>{genre.label}</span>
                              </div>
                              <span style={{ color: 'var(--v-fg2)', fontSize: '10.5px', fontVariantNumeric: 'tabular-nums' }}>{score} pts</span>
                            </div>
                            <div style={{ height: '3px', background: 'var(--v-bdr2)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', background: 'var(--v-accent)', width: `${percent}%`, borderRadius: '2px' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'rgba(255, 255, 255, 0.015)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '14px',
                  padding: '14px 14px 16px 14px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                  animation: 'fadeUp 0.22s cubic-bezier(0.2,0,0,1) 320ms both'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <h2 style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--v-fg)',
                        letterSpacing: '-0.01em',
                        margin: 0
                      }}>Playlists</h2>
                      {playlists.length > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--v-fg3)', fontWeight: 600 }}>
                          ({playlists.length})
                        </span>
                      )}
                    </div>
                    {playlists.length > 0 && (
                      <button
                        onClick={() => {
                          setOpenPlaylistId?.(null);
                          setActiveNav('playlists');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--v-accent)',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          transition: 'opacity 0.12s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                      >
                        <span>View All</span>
                        <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                  <div
                    className="custom-scrollbar"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      maxHeight: '360px',
                      overflowY: 'auto'
                    }}
                  >
                    {playlists.map(pl => {
                      const isLiked = pl.id === 'p1';
                      const cover = isLiked ? null : ((pl as any).customCover || pl.tracks?.find(t => t.cover)?.cover || null);
                      return (
                        <div
                          key={pl.id}
                          onClick={() => {
                            setOpenPlaylistId?.(pl.id);
                            setActiveNav('playlists');
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '6px 8px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            background: 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '6px',
                            background: isLiked ? 'linear-gradient(135deg, rgba(224,85,85,0.12) 0%, rgba(255,255,255,0.02) 100%)' : 'rgba(255,255,255,0.025)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            overflow: 'hidden',
                            position: 'relative'
                          }}>
                            {cover ? (
                              <img src={cover} alt={pl.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : isLiked ? (
                              <Heart size={14} style={{ color: '#e05555', fill: 'rgba(220,60,60,0.15)' }} />
                            ) : (
                              <ListMusic size={14} style={{ color: 'var(--v-fg2)' }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '12.5px',
                              fontWeight: 600,
                              color: 'var(--v-fg)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>{pl.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--v-fg2)', marginTop: '1px' }}>
                              {pl.tracks.length} {pl.tracks.length === 1 ? 'track' : 'tracks'}
                            </div>
                          </div>
                          <ChevronRight size={14} style={{ color: 'var(--v-fg3)' }} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {followedArtists.length > 0 ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(255, 255, 255, 0.015)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    borderRadius: '14px',
                    padding: '14px 14px 16px 14px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                    animation: 'fadeUp 0.22s cubic-bezier(0.2,0,0,1) 360ms both'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h2 style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: 'var(--v-fg)',
                          letterSpacing: '-0.01em',
                          margin: 0
                        }}>Favorite Artists</h2>
                        <span style={{ fontSize: '11px', color: 'var(--v-fg3)', fontWeight: 600 }}>
                          ({followedArtists.length})
                        </span>
                      </div>
                      <button
                        onClick={() => setActiveNav('artists')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--v-accent)',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          transition: 'opacity 0.12s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                      >
                        <span>View All</span>
                        <ChevronRight size={12} />
                      </button>
                    </div>
                    <div
                      className="custom-scrollbar"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        maxHeight: '220px',
                        overflowY: 'auto'
                      }}
                    >
                      {followedArtists.slice(0, 6).map(artist => (
                        <div
                          key={artist.name}
                          onClick={() => onArtistClick?.(artist.name, artist.avatar)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '6px 8px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            background: 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: getTrackGradient(artist.name, 'artist'),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            overflow: 'hidden',
                            position: 'relative',
                            border: '1px solid rgba(255,255,255,0.08)'
                          }}>
                            <Music size={13} style={{ position: 'absolute', color: 'rgba(255,255,255,0.25)' }} />
                            {artist.avatar && (
                              <img
                                src={artist.avatar}
                                alt={artist.name}
                                referrerPolicy="no-referrer"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '12.5px',
                              fontWeight: 600,
                              color: 'var(--v-fg)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>{artist.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--v-fg3)', marginTop: '1px' }}>
                              Artist
                            </div>
                          </div>
                          <ChevronRight size={14} style={{ color: 'var(--v-fg3)' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(255, 255, 255, 0.015)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    borderRadius: '14px',
                    padding: '14px 14px 16px 14px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
                    animation: 'fadeUp 0.22s cubic-bezier(0.2,0,0,1) 360ms both'
                  }}>
                    <h2 style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: 'var(--v-fg)',
                      letterSpacing: '-0.01em',
                      margin: '0 0 10px 0'
                    }}>Quick Access</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div
                        onClick={() => setActiveNav('artists')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.03)',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--v-accent-rgb), 0.04)'; e.currentTarget.style.borderColor = 'rgba(var(--v-accent-rgb), 0.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.03)'; }}
                      >
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: 'rgba(var(--v-accent-rgb), 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--v-accent)',
                          flexShrink: 0
                        }}>
                          <Mic2 size={15} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--v-fg)' }}>Artists Hub</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--v-fg3)' }}>Search & follow artists</div>
                        </div>
                        <ChevronRight size={13} style={{ color: 'var(--v-fg3)' }} />
                      </div>

                      <div
                        onClick={() => setActiveNav('downloads')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.03)',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                      >
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--v-fg2)',
                          flexShrink: 0
                        }}>
                          <HardDrive size={15} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--v-fg)' }}>Offline Library</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--v-fg3)' }}>{localTracks.length} {localTracks.length === 1 ? 'song' : 'songs'} saved</div>
                        </div>
                        <ChevronRight size={13} style={{ color: 'var(--v-fg3)' }} />
                      </div>

                      <div
                        onClick={() => setActiveNav('stats')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.03)',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                      >
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--v-fg2)',
                          flexShrink: 0
                        }}>
                          <BarChart2 size={15} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--v-fg)' }}>Listening Stats</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--v-fg3)' }}>Top artists & history</div>
                        </div>
                        <ChevronRight size={13} style={{ color: 'var(--v-fg3)' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {hasSearched && (() => {
          const activeTracks = searchTab === 'music' ? (ytMusicTracks.length > 0 ? ytMusicTracks : tracks) : (videoTracks.length > 0 ? videoTracks : tracks);
          const hasAnyResults = ytMusicTracks.length > 0 || videoTracks.length > 0 || tracks.length > 0;
          return (
            <div className="v-home-search-results v-page-container">
              <div className="v-section-head" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                  <h2 style={{fontSize:'16px',fontWeight:700,color:'#e2ddd9',margin:0,textTransform:'none',letterSpacing:'normal'}}>
                    {isSearching ? 'SEARCHING YOUTUBE...' : `RESULTS FOR "${searchQuery}"`}
                  </h2>
                  {isSearching && <div style={{display:"flex",gap:"3px",alignItems:"flex-end",height:"16px"}}>{[100, 60, 80, 50].map((h, i) => <div key={i} style={{ width:"4px",borderRadius:"2px",background:"rgba(226,221,217,0.4)",height: `${h}%`, animation: `barBounce ${0.65 + i * 0.1}s ease-in-out ${i * 100}ms infinite`, transformOrigin: "bottom" }} />)}</div>}
                </div>
                {activeTracks.length > 0 && !isSearching && (
                  <button onClick={() => playAll(activeTracks)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'5px 14px',background:'rgba(226,221,217,0.06)',border:'1px solid rgba(226,221,217,0.12)',color:'#9e9894',borderRadius:'9999px',cursor:'pointer',fontSize:'11px',fontWeight:600,transition:'background .12s'}}>
                    <Play size={11} style={{fill:'currentColor'}} /> Play All
                  </button>
                )}
              </div>

              {!isSearching && (ytMusicTracks.length > 0 || videoTracks.length > 0) && (
                <div style={{display:'flex',alignItems:'center',gap:'8px',margin:'10px 0 16px'}}>
                  <button
                    onClick={() => setSearchTab('music')}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: searchTab === 'music' ? 'none' : '1px solid var(--v-bdr2)',
                      background: searchTab === 'music' ? 'var(--v-accent)' : 'var(--v-bg2)',
                      color: searchTab === 'music' ? '#0c0b0b' : '#8a807c',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all .15s ease'
                    }}
                  >
                    <Music size={13} />
                    <span>YT Music</span>
                    {ytMusicTracks.length > 0 && <span style={{fontSize:'10.5px',opacity:0.8}}>({ytMusicTracks.length})</span>}
                  </button>
                  
                  <button
                    onClick={() => setSearchTab('video')}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: searchTab === 'video' ? 'none' : '1px solid var(--v-bdr2)',
                      background: searchTab === 'video' ? 'var(--v-accent)' : 'var(--v-bg2)',
                      color: searchTab === 'video' ? '#0c0b0b' : '#8a807c',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all .15s ease'
                    }}
                  >
                    <Play size={13} />
                    <span>Videos</span>
                    {videoTracks.length > 0 && <span style={{fontSize:'10.5px',opacity:0.8}}>({videoTracks.length})</span>}
                  </button>
                </div>
              )}

              {!isSearching && (() => {
                const q = searchQuery.trim().toLowerCase();
                const firstMatch = activeTracks.find(t => {
                  const a = cleanArtist(t.artist).toLowerCase();
                  return a && (a === q || a.includes(q) || q.includes(a));
                });
                const detectedName = firstMatch ? cleanArtist(firstMatch.artist) : (activeTracks[0] ? cleanArtist(activeTracks[0].artist) : searchQuery.trim());
                const isGeneric = !detectedName || ['various artists', 'unknown', 'youtube', 'various', 'artist'].includes(detectedName.toLowerCase());
                if (isGeneric || !onArtistClick) return null;

                return (
                  <ArtistSpotlightCard
                    artistName={detectedName}
                    onArtistClick={onArtistClick}
                    followedArtists={followedArtists}
                  />
                );
              })()}

              {isSearching && (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:"14px",padding:"0 12px 6px",borderBottom:"1px solid var(--v-bdr2)",marginBottom:"4px"}}>
                    <div style={{width:"26px",flexShrink:0}}/><div style={{width:"38px",flexShrink:0}}/>
                    <p style={{flex:1,fontSize:"9.5px",fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--v-fg3)"}}>Title</p>
                    <div style={{width:"60px",flexShrink:0}}/>
                    <Clock size={12} style={{color:"var(--v-fg3)",width:"36px",flexShrink:0}}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"3px",marginTop:"4px"}}>{Array.from({ length: 8 }).map((_, i) => <TrackRowSkeleton key={i} index={i} />)}</div>
                </>
              )}

              {!isSearching && activeTracks.length > 0 && (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:"14px",padding:"0 12px 6px",borderBottom:"1px solid var(--v-bdr2)",marginBottom:"4px"}}>
                    <div style={{width:"26px",flexShrink:0}}/><div style={{width:"38px",flexShrink:0}}/>
                    <p style={{flex:1,fontSize:"9.5px",fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:"var(--v-fg3)"}}>Title</p>
                    <div style={{width:"60px",flexShrink:0}}/>
                    <Clock size={12} style={{color:"var(--v-fg3)",width:"36px",flexShrink:0}}/>
                  </div>
                  <div style={{marginTop:"4px"}}>
                    <VirtualTrackList
                      items={activeTracks}
                      itemHeight={56}
                      keyExtractor={(track) => track.id || track.url}
                      renderItem={(track, i) => (
                        <TrackRow
                          track={track}
                          index={i}
                          isActive={currentTrack?.url === track.url}
                          isHovered={hoveredTrackUrl === track.url}
                          isLoadingTrack={loadingTrackUrl === track.url || (currentTrack?.url === track.url && isLoadingTrack)}
                          isPlaying={isPlaying}
                          isLiked={isTrackLiked(track.url)}
                          isDownloading={(downloadingTracks[track.url] ?? 0)}
                          isSelected={selectedUrls.has(track.url)}
                          isMultiSelectActive={isMultiSelectActive}
                          onPlay={() => handlePlayInContext(track, activeTracks)}
                          onHoverEnter={() => { setHoveredTrackUrl(track.url); prefetchOnHover(track.url); }}
                          onHoverLeave={() => setHoveredTrackUrl(null)}
                          onLike={() => toggleLikeTrack(track)}
                          onDownload={() => handleDownload(track)}
                          onCtx={e => openCtx(e, { type: 'track', track })}
                          onSelectToggle={e => toggleSelect(track, i, e, activeTracks)}
                          onArtistClick={onArtistClick ? (name) => onArtistClick(name) : undefined}
                        />
                      )}
                    />
                    {isMultiSelectActive && (
                      <BatchActionBar
                        selectedTracks={activeTracks.filter(t => selectedUrls.has(t.url))}
                        playlists={playlists}
                        onClearSelection={clearSelection}
                        onPlaySelected={() => {
                          const selected = activeTracks.filter(t => selectedUrls.has(t.url));
                          if (selected.length > 0) {
                            handlePlayInContext(selected[0], selected);
                          }
                          clearSelection();
                        }}
                        onQueueSelected={() => {
                          const selected = activeTracks.filter(t => selectedUrls.has(t.url));
                          if (selected.length > 0 && addToQueue) {
                            addToQueue(selected);
                            showToast?.(`Added ${selected.length} track${selected.length > 1 ? 's' : ''} to queue`);
                          }
                          clearSelection();
                        }}
                        onAddToPlaylist={(playlistId) => {
                          const selected = activeTracks.filter(t => selectedUrls.has(t.url) && !t.url.startsWith('local://'));
                          if (selected.length === 0) {
                            showToast?.('Offline tracks cannot be added to playlists');
                            clearSelection();
                            return;
                          }
                          if (_setPlaylists) {
                            _setPlaylists(prev => prev.map(p => {
                              if (p.id !== playlistId) return p;
                              const existingUrls = new Set(p.tracks.map(t => t.url));
                              const newTracks = selected.filter(t => !existingUrls.has(t.url));
                              return { ...p, tracks: [...p.tracks, ...newTracks] };
                            }));
                            showToast?.(`Added ${selected.length} tracks to playlist`);
                          }
                          clearSelection();
                        }}
                        onCreatePlaylistWithSelected={(name) => {
                          const selected = activeTracks.filter(t => selectedUrls.has(t.url) && !t.url.startsWith('local://'));
                          if (selected.length === 0) {
                            showToast?.('Offline tracks cannot be added to playlists');
                            clearSelection();
                            return;
                          }
                          if (_setPlaylists) {
                            const newPl: Playlist = {
                              id: `pl-${Date.now()}`,
                              name,
                              description: '',
                              tracks: selected,
                            };
                            _setPlaylists(prev => [...prev, newPl]);
                            showToast?.(`Created playlist "${name}" with ${selected.length} tracks`);
                          }
                          clearSelection();
                        }}
                        onDownloadSelected={() => {
                          const selected = activeTracks.filter(t => selectedUrls.has(t.url));
                          selected.forEach(t => handleDownload(t));
                          showToast?.(`Queued ${selected.length} downloads`);
                          clearSelection();
                        }}
                      />
                    )}
                  </div>
                </>
              )}

              {!isSearching && !hasAnyResults && (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"260px",gap:"16px",padding:"40px 20px",textAlign:"center"}}>
                  <div style={{width:'52px',height:'52px',borderRadius:'14px',background:'var(--v-bg2)',border:'1px solid var(--v-bdr2)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <Search size={22} style={{color:'#8a807c'}} />
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                    <h3 style={{fontSize:"14px",fontWeight:700,color:"#e2ddd9",margin:0}}>
                      {searchError ? "Search Error" : `No ${searchTab === 'music' ? 'YT Music' : 'Video'} results found for "${searchQuery}"`}
                    </h3>
                    <p style={{fontSize:"12px",color:"#8a807c",maxWidth:"360px",margin:0}}>
                      {searchError ? searchError : "Double check spelling or try switching tabs above."}
                    </p>
                  </div>
                  <div style={{display:"flex",gap:"10px",marginTop:"6px"}}>
                    <button onClick={() => searchMusic(searchQuery)}
                      style={{padding:"8px 16px",borderRadius:"8px",background:"var(--v-accent)",color:"#0c0b0b",border:"none",fontWeight:700,fontSize:"12px",cursor:"pointer"}}>
                      Try Again
                    </button>
                    <button onClick={() => { setHasSearched?.(false); setSearchQuery(''); setTracks?.([]); setYtMusicTracks?.([]); setVideoTracks?.([]); setSearchError?.(null); }}
                      style={{padding:"8px 16px",borderRadius:"8px",background:"var(--v-bg2)",color:"#e2ddd9",border:"1px solid var(--v-bdr2)",fontWeight:600,fontSize:"12px",cursor:"pointer"}}>
                      Back to Home
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </>
  );
});
