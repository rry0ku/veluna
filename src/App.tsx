import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open } from '@tauri-apps/plugin-dialog';
import {
  AlignLeft,
  CheckCircle,
  Maximize2,
  Music,
  X,
  Trash2,
} from 'lucide-react';

import {
  Track,
  LocalTrack,
  Playlist,
  CtxMenu,
  NavView,
  SettingsTab,
  ActiveDownload,
  UserPreferences,
  FollowedArtist,
  ArtistPageData,
  RepeatMode,
} from './types';
import {
  loadLS,
  saveLS,
  clampMenu,
  getTrackGradient,
  cleanArtist,
  parseTrackMeta,
  findDuplicateTracks,
  fetchArtistYouTubeTracks,
  globalArtistAvatarCache,
} from './utils';
import { getStarterRecommendations } from './constants';

import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import { useListeningStats } from './hooks/useListeningStats';
import { useQueue } from './hooks/useQueue';
import { useLyrics } from './hooks/useLyrics';
import { useSearch } from './hooks/useSearch';
import { usePlaylists } from './hooks/usePlaylists';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useScrobbler } from './hooks/useScrobbler';

import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { DownloadsFlyout } from './components/layout/DownloadsFlyout';
import { QueuePanel } from './components/layout/QueuePanel';
import { PlayerBar } from './components/layout/PlayerBar';
import { ContextMenu } from './components/layout/ContextMenu';

import { HomeView } from './components/views/HomeView';
import { PlaylistsView } from './components/views/PlaylistsView';
import { DownloadsPanel } from './components/DownloadsPanel';

const StatsView = lazy(() => import('./components/views/StatsView').then(m => ({ default: m.StatsView })));
const HistoryView = lazy(() => import('./components/views/HistoryView').then(m => ({ default: m.HistoryView })));
const LyricsView = lazy(() => import('./components/views/LyricsView').then(m => ({ default: m.LyricsView })));
const ArtistsView = lazy(() => import('./components/views/ArtistsView').then(m => ({ default: m.ArtistsView })));
const ArtistView = lazy(() => import('./components/views/ArtistView').then(m => ({ default: m.ArtistView })));
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const OnboardingModal = lazy(() => import('./components/OnboardingModal').then(m => ({ default: m.OnboardingModal })));

function ViewLoader() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px' }}>
      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--v-accent)', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
}

import {
  ImportResultModal,
  CsvImportModal,
  YtImportModal,
  MetadataEditModal,
  PlaylistDeleteConfirmModal,
} from './components/Modals';

export function App() {
  
  const { toast, showToast } = useToast();

  const {
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    customBgColor,
    setCustomBgColor,
    performanceMode,
    setPerformanceMode,
  } = useTheme();

  const {
    playCounts,
    setPlayCounts,
    listenSecs,
    setListenSecs,
    firstSeen,
    setFirstSeen,
    dailyPlays,
    setDailyPlays,
    playHistory,
    setPlayHistory,
    listeningHistory,
    setListeningHistory,
    playbackHistory,
    setPlaybackHistory,
    clearPlaybackHistory,
    removePlaybackHistoryItem,
    statsTimeRange,
    setStatsTimeRange,
    artistThumbs,
    recordTrackPlayed,
    recordListeningStep,
  } = useListeningStats();

  const {
    queue,
    setQueue,
    queueRef,
    isQueueOpen,
    setIsQueueOpen,
    showClearConfirm,
    setShowClearConfirm,
    queuePulseKey,
    dragQueueIdx,
    dragOverQueueIdx,
    setDragOverQueueIdx,
    dragOverQueueIdxRef,
    clearQueue,
    removeFromQueue,
    reorderQueue: moveQueueItem,
    playNext,
    addToQueue,
  } = useQueue(showToast);

  const [cacheEnabled, setCacheEnabledState] = useState<boolean>(() => loadLS('vg_cacheEnabled', true));
  const [uiScale, setUiScaleState] = useState<number>(() => loadLS('vg_uiScale', 0));
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Connection restored: online mode active');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Network disconnected: offline mode active');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  const {
    searchQuery,
    setSearchQuery,
    searchHistory,
    setSearchHistory,
    showHistory,
    setShowHistory,
    isSearching,
    hasSearched,
    searchError,
    searchTab,
    setSearchTab,
    ytMusicTracks,
    videoTracks,
    tracks,
    quickPicks,
    setQuickPicks,
    searchMusic,
    clearSearchHistory,
    removeSearchHistoryItem,
    resetSearch,
  } = useSearch(showToast, cacheEnabled);

  const searchRef = useRef<HTMLInputElement>(null);

  const [volume, setVolume] = useState<number>(() => loadLS('vg_volume', 100));
  const [previousVolume, setPreviousVolume] = useState(100);
  const [playbackSpeed, setPlaybackSpeedState] = useState<number>(() => loadLS('vg_speed', 1));
  const [crossfadeSeconds] = useState<number>(() => loadLS('vg_crossfade', 0));
  const [loudnormEnabled, setLoudnormEnabledState] = useState<boolean>(() => loadLS('vg_loudnorm', false));
  const [skipSilence, setSkipSilenceState] = useState<boolean>(() => loadLS('vg_skipSilence', false));
  const [downloadQuality, setDownloadQuality] = useState<string>(() => loadLS('vg_dlQuality', 'High'));
  const [downloadFormat, setDownloadFormatState] = useState<string>(() => loadLS('vg_dlFormat', 'mp3'));
  const [embedThumbnail, setEmbedThumbnailState] = useState<boolean>(() => loadLS('vg_embedThumb', true));
  const [duplicateDetect, setDuplicateDetectState] = useState<boolean>(() => loadLS('vg_dupDetect', true));
  const [autoCheckUpdates, setAutoCheckUpdatesState] = useState<boolean>(() => loadLS('vg_autoCheckUpdates', true));
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [downloadPath, setDownloadPath] = useState<string>(() => loadLS('vg_dlPath', '~/Downloads'));
  const [backupPath, setBackupPathState] = useState<string>(() => loadLS('vg_backupPath', ''));
  const [trayEnabled, setTrayEnabled] = useState<boolean>(() => loadLS('vg_trayEnabled', false));
  const [discordRpcEnabled, setDiscordRpcEnabled] = useState<boolean>(() => loadLS('vg_discordRpcEnabled', true));
  const [discordShowCover, setDiscordShowCover] = useState<boolean>(() => loadLS('vg_discordShowCover', true));
  const [discordTimeDisplay, setDiscordTimeDisplay] = useState<'remaining' | 'elapsed'>(() => {
    const v = loadLS<string>('vg_discordTimeDisplay', 'remaining');
    return v === 'elapsed' ? 'elapsed' : 'remaining';
  });
  const [discordCustomBtn, setDiscordCustomBtn] = useState<boolean>(() => loadLS('vg_discordCustomBtn', false));
  const [discordBtnLabel, setDiscordBtnLabel] = useState<string>(() => loadLS('vg_discordBtnLabel', ''));
  const [discordBtnUrl, setDiscordBtnUrl] = useState<string>(() => loadLS('vg_discordBtnUrl', ''));
  const [autoplayEnabled, setAutoplayEnabled] = useState<boolean>(() => loadLS('vg_autoplay', true));
  const [appVersion, setAppVersion] = useState<string>('0.1.5');
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);

  const setCacheEnabled = useCallback((enabled: boolean) => {
    setCacheEnabledState(enabled);
    saveLS('vg_cacheEnabled', enabled);
    invoke('set_cache_enabled', { enabled }).catch(() => {});
  }, []);

  const setUiScale = useCallback((scale: number) => {
    setUiScaleState(scale);
    saveLS('vg_uiScale', scale);
    (document.documentElement.style as any).zoom = `${100 + scale * 5}%`;
  }, []);

  useEffect(() => {
    (document.documentElement.style as any).zoom = `${100 + uiScale * 5}%`;
  }, [uiScale]);

  useEffect(() => {
    invoke('set_cache_enabled', { enabled: cacheEnabled }).catch(() => {});
  }, [cacheEnabled]);

  const [eq, setEqState] = useState<{ bass: number; mid: number; treble: number }>(() =>
    loadLS('vg_eq', { bass: 0, mid: 0, treble: 0 })
  );

  const setAutoCheckUpdates = useCallback((v: boolean) => {
    setAutoCheckUpdatesState(v);
    saveLS('vg_autoCheckUpdates', v);
  }, []);

  const setBackupPath = useCallback((p: string) => {
    setBackupPathState(p);
    saveLS('vg_backupPath', p);
  }, []);

  useEffect(() => { saveLS('vg_volume', volume); }, [volume]);
  useEffect(() => { saveLS('vg_speed', playbackSpeed); }, [playbackSpeed]);
  useEffect(() => { saveLS('vg_dlQuality', downloadQuality); }, [downloadQuality]);
  useEffect(() => { saveLS('vg_dlFormat', downloadFormat); }, [downloadFormat]);
  useEffect(() => { saveLS('vg_embedThumb', embedThumbnail); }, [embedThumbnail]);
  useEffect(() => { saveLS('vg_dupDetect', duplicateDetect); }, [duplicateDetect]);
  useEffect(() => { saveLS('vg_dlPath', downloadPath); }, [downloadPath]);
  useEffect(() => { saveLS('vg_eq', eq); }, [eq]);
  useEffect(() => { saveLS('vg_trayEnabled', trayEnabled); }, [trayEnabled]);
  useEffect(() => { saveLS('vg_discordRpcEnabled', discordRpcEnabled); }, [discordRpcEnabled]);
  useEffect(() => { saveLS('vg_discordShowCover', discordShowCover); }, [discordShowCover]);
  useEffect(() => { saveLS('vg_discordTimeDisplay', discordTimeDisplay); }, [discordTimeDisplay]);
  useEffect(() => { saveLS('vg_discordCustomBtn', discordCustomBtn); }, [discordCustomBtn]);
  useEffect(() => { saveLS('vg_discordBtnLabel', discordBtnLabel); }, [discordBtnLabel]);
  useEffect(() => { saveLS('vg_discordBtnUrl', discordBtnUrl); }, [discordBtnUrl]);
  useEffect(() => { saveLS('vg_autoplay', autoplayEnabled); }, [autoplayEnabled]);
  useEffect(() => {
    saveLS('vg_loudnorm', loudnormEnabled);
    invoke('set_loudnorm_enabled', { enabled: loudnormEnabled }).catch(() => {});
  }, [loudnormEnabled]);
  useEffect(() => {
    saveLS('vg_skipSilence', skipSilence);
    invoke('set_skip_silence', { enabled: skipSilence }).catch(() => {});
  }, [skipSilence]);

  const {
    currentTrack,
    currentTrackRef,
    setCurrentTrack,
    currentLocalPath,
    isPlaying,
    setIsPlaying,
    isLoadingTrack,
    loadingTrackUrl,
    audioInfo,
    progressSeconds,
    trackDurationSeconds,
    waveformData,
    abLoop,
    setAbLoop,
    shuffle,
    setShuffle,
    repeatMode,
    setRepeatMode,
    toggleShuffle,
    cycleRepeat,
    playlistContextRef,
    sleepTimer,
    showSleepPopover,
    setShowSleepPopover,
    setSleepTimerMinutes,
    cancelSleepTimer,
    handlePlayTrack: baseHandlePlayTrack,
    handlePlayLocalTrack,
    handlePlayInContext,
    togglePlayPause,
    toggleMute,
    handleSkipForward,
    handleSkipBack,
    prefetchOnHover,
    progressRef,
    volumeRef,
    isDraggingProgress,
    setIsDraggingProgress,
    isDraggingProgressRef,
    isDraggingVolume,
    setIsDraggingVolume,
    progressSecondsRef,
    abLoopRef,
    trackDurationRef,
    updateProgressFromEvent,
    updateVolumeFromEvent,
    calculateProgressPercent,
  } = useAudioPlayer({
    volume,
    setVolume,
    previousVolume,
    setPreviousVolume,
    eq,
    playbackSpeed,
    setPlaybackSpeed: setPlaybackSpeedState,
    crossfadeSeconds,
    autoplayEnabled,
    queue,
    setQueue,
    queueRef,
    playHistory,
    setPlayHistory,
    setQuickPicks,
    onTrackPlayed: recordTrackPlayed,
    onListeningStep: recordListeningStep,
    showToast,
  });

  const handlePlayTrack = useCallback((track: Track, fromQueue?: boolean) => {
    if (!isOnline && !track.url.startsWith('local://')) {
      showToast('Cannot stream while offline. Switch to Offline library to play saved tracks.');
      return Promise.resolve();
    }
    return baseHandlePlayTrack(track, fromQueue);
  }, [isOnline, baseHandlePlayTrack, showToast]);

  const {
    showLyrics,
    setShowLyrics,
    lyricsData,
    lyricsLoading,
    lyricsSource,
    setLyricsSource,
    lyricsScrollContainerRef,
  } = useLyrics(currentTrack, trackDurationSeconds, progressSeconds);

  const {
    lastfmEnabled,
    setLastfmEnabled,
    lastfmSessionKey,
    setLastfmSessionKey,
    lastfmApiKey,
    setLastfmApiKey,
    lastfmApiSecret,
    setLastfmApiSecret,
    lastfmUsername,
    setLastfmUsername,
  } = useScrobbler({
    currentTrack,
    isPlaying,
    progressSeconds,
    trackDurationSeconds,
    showToast,
  });

  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([]);
  const [localRefreshNonce, setLocalRefreshNonce] = useState(0);
  const [downloadingTracks, setDownloadingTracks] = useState<Record<string, number>>({});
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  const [isDownloadsFlyoutOpen, setIsDownloadsFlyoutOpen] = useState(false);
  const [downloadPulseKey, setDownloadPulseKey] = useState(0);
  const flyoutAutoCloseTimerRef = useRef<any>(null);
  const [metadataEditingTrack, setMetadataEditingTrack] = useState<Track | null>(null);

  const [userPreferences, setUserPreferences] = useState<UserPreferences>(() =>
    loadLS('vg_userPreferences', { languages: [], genres: [], artists: [] })
  );
  const [recommendedTracks, setRecommendedTracks] = useState<Track[]>(() => {
    const cached = loadLS('vg_recommendedTracks', []);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    return getStarterRecommendations(loadLS('vg_userPreferences', undefined)) as Track[];
  });
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(() =>
    !loadLS('vg_onboardingCompleted', false)
  );

  const handleCloseOnboarding = useCallback(() => {
    setShowOnboardingModal(false);
  }, []);

  const handleCompleteOnboarding = useCallback((prefs: UserPreferences, tracks: Track[]) => {
    setUserPreferences(prefs);
    setRecommendedTracks(tracks);
    saveLS('vg_userPreferences', prefs);
    saveLS('vg_recommendedTracks', tracks);
    saveLS('vg_onboardingCompleted', true);
    setShowOnboardingModal(false);
    showToast('Personalized recommendations updated');

    if (prefs.artists && prefs.artists.length > 0) {
      fetchArtistYouTubeTracks(prefs.artists).then(ytTracks => {
        if (ytTracks.length > 0) {
          setRecommendedTracks(prev => {
            const seen = new Set(ytTracks.map(t => t.url));
            const merged = [...ytTracks, ...prev.filter(t => !seen.has(t.url))].slice(0, 15);
            saveLS('vg_recommendedTracks', merged);
            return merged;
          });
        }
      });
    }
  }, [showToast]);

  const handleRefreshRecommendations = useCallback(() => {
    const base = getStarterRecommendations(userPreferences) as Track[];
    setRecommendedTracks(base);
    saveLS('vg_recommendedTracks', base);
    showToast('Recommendations refreshed');

    if (userPreferences.artists && userPreferences.artists.length > 0) {
      fetchArtistYouTubeTracks(userPreferences.artists).then(ytTracks => {
        if (ytTracks.length > 0) {
          setRecommendedTracks(prev => {
            const seen = new Set(ytTracks.map(t => t.url));
            const merged = [...ytTracks, ...prev.filter(t => !seen.has(t.url))].slice(0, 15);
            saveLS('vg_recommendedTracks', merged);
            return merged;
          });
        }
      });
    }
  }, [userPreferences, showToast]);

  // Followed Artists State
  const [followedArtists, setFollowedArtists] = useState<FollowedArtist[]>(() =>
    loadLS('vg_followedArtists', [])
  );
  useEffect(() => {
    saveLS('vg_followedArtists', followedArtists);
  }, [followedArtists]);

  const toggleFollowArtist = useCallback((artist: { name: string; avatar?: string; banner?: string }) => {
    const raw = artist.name.trim();
    if (!raw) return;
    setFollowedArtists(prev => {
      const exists = prev.some(a => a.name.toLowerCase() === raw.toLowerCase());
      if (exists) {
        showToast(`Unfollowed ${raw}`);
        return prev.filter(a => a.name.toLowerCase() !== raw.toLowerCase());
      } else {
        showToast(`Following ${raw}`);
        return [
          {
            name: raw,
            avatar: artist.avatar,
            banner: artist.banner,
            followedAt: new Date().toISOString()
          },
          ...prev
        ];
      }
    });
  }, [showToast]);

  // Artist Page State
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [artistPageData, setArtistPageData] = useState<ArtistPageData | null>(null);
  const [isArtistLoading, setIsArtistLoading] = useState(false);
  const [artistError, setArtistError] = useState<string | null>(null);
  const artistCacheRef = useRef<Map<string, ArtistPageData>>(new Map());
  const previousNavRef = useRef<NavView>('home');
  const activeArtistQueryIdRef = useRef<number>(0);

  useEffect(() => {
    const unlistenPromise = listen<{ url: string; percent: number; status: string; error?: string }>('download_progress', (event) => {
      const { url, percent, status, error } = event.payload;
      setDownloadingTracks(p => ({ ...p, [url]: percent }));
      setActiveDownloads(prev => prev.map(item => {
        if (item.url === url) {
          return {
            ...item,
            progress: percent,
            status: status === 'completed' || percent >= 100 ? 'completed' : error ? 'error' : 'downloading',
            error,
          };
        }
        return item;
      }));
    });
    return () => {
      unlistenPromise.then(fn => fn());
    };
  }, []);

  const getTrackCover = useCallback((track: Track | null | undefined) => {
    if (!track) return '';
    if (track.cover) return track.cover;
    if (track.url?.startsWith('local://')) {
      const path = track.url.slice(8);
      const found = localTracks.find(lt => lt.path === path);
      if (found && found.cover) return found.cover;
    }
    return '';
  }, [localTracks]);

  const {
    playlists,
    setPlaylists,
    openPlaylistId,
    setOpenPlaylistId,
    selectedPlaylistIds,
    setSelectedPlaylistIds,
    isPlaylistMultiSelect,
    setIsPlaylistMultiSelect,
    playlistViewMode,
    setPlaylistViewMode,
    playlistSearchQ,
    setPlaylistSearchQ,
    isPlaylistModalOpen,
    setIsPlaylistModalOpen,
    newPlaylistName,
    setNewPlaylistName,
    newPlaylistDesc,
    setNewPlaylistDesc,
    renamingPlaylist,
    setRenamingPlaylist,
    renameVal,
    setRenameVal,
    renameDescVal,
    setRenameDescVal,
    playlistDeleteModal,
    setPlaylistDeleteModal,
    toggleLikeTrack,
    isTrackLiked,
    confirmCreatePlaylist,
    confirmRenamePlaylist,
    confirmDeletePlaylist,
    handleCoverUpload: handlePlaylistCoverUpload,
  } = usePlaylists(showToast);

  const getPlaylistCover = useCallback((p: Playlist) => p.id === 'p1' ? null : (p.customCover || (p.tracks.find(t => t.cover)?.cover || null)), []);

  const [startupNav, setStartupNavState] = useState<string>(() => loadLS('vg_startupNav', 'home'));
  const setStartupNav = useCallback((nav: string) => {
    setStartupNavState(nav);
    saveLS('vg_startupNav', nav);
  }, []);

  const [activeNav, setActiveNavState] = useState<NavView>(() => {
    const startup = loadLS<string>('vg_startupNav', 'home');
    if (startup === 'last') return loadLS<NavView>('vg_lastNav', 'home');
    if (startup === 'library' || startup === 'playlists') return 'playlists';
    if (['home', 'downloads', 'stats', 'settings'].includes(startup)) return startup as NavView;
    return 'home';
  });

  const [navHistory, setNavHistory] = useState<NavView[]>(() => {
    const startup = loadLS<string>('vg_startupNav', 'home');
    const initial: NavView = (startup === 'last')
      ? loadLS<NavView>('vg_lastNav', 'home')
      : (startup === 'library' || startup === 'playlists')
        ? 'playlists'
        : ['home', 'downloads', 'stats', 'settings'].includes(startup)
          ? (startup as NavView)
          : 'home';
    return [initial];
  });
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('playback');

  const setActiveNav = useCallback((nav: NavView) => {
    setActiveNavState(nav);
    saveLS('vg_lastNav', nav);
    setNavHistory(prev => (prev[prev.length - 1] === nav ? prev : [...prev, nav]));
  }, []);

  const openArtistPage = useCallback(async (artistName: string, avatarUrl?: string) => {
    const rawName = cleanArtist(artistName).trim();
    if (!rawName) return;

    const queryId = ++activeArtistQueryIdRef.current;

    if (activeNav !== 'artist') {
      previousNavRef.current = activeNav;
    }
    setSelectedArtistName(rawName);
    setActiveNav('artist');

    const cacheKey = rawName.toLowerCase();
    const cached = artistCacheRef.current.get(cacheKey);
    if (cached && cached.name.toLowerCase() === rawName.toLowerCase()) {
      setArtistPageData(cached);
      setSelectedArtistName(cached.name);
      setIsArtistLoading(false);
      setArtistError(null);
      return;
    }

    // Validate avatarUrl to ensure it is NOT a song cover
    const isTrackCover = (url?: string) => !url || url.includes('/vi/') || url.includes('mqdefault') || url.includes('hqdefault') || url.includes('maxresdefault');
    const cachedPfp = globalArtistAvatarCache.get(rawName.toLowerCase());
    const initialAvatar = (!isTrackCover(avatarUrl) ? avatarUrl : undefined) || cachedPfp;

    // Set optimistic placeholder strictly for THIS artist
    setArtistPageData({
      name: rawName,
      avatar: initialAvatar,
      banner: initialAvatar,
      topTracks: []
    });
    setIsArtistLoading(true);
    setArtistError(null);

    try {
      const res = await invoke<string>('get_artist_page_details', { artistName: rawName });
      if (activeArtistQueryIdRef.current !== queryId) return;

      const lines = res.trim().split('\n').filter(Boolean);
      let canonicalName = rawName;
      let finalAvatar = initialAvatar;
      let finalBanner = initialAvatar;
      const tracks: Track[] = [];

      lines.forEach((line, i) => {
        if (line.startsWith('ARTIST_INFO====')) {
          const parts = line.split('====');
          if (parts[1]?.trim()) canonicalName = parts[1].trim();
          if (parts[2]?.trim() && parts[2].startsWith('http') && !isTrackCover(parts[2].trim())) {
            finalAvatar = parts[2].trim();
          }
          if (parts[3]?.trim() && parts[3].startsWith('http')) finalBanner = parts[3].trim();
          return;
        }

        const parts = line.split('====');
        const meta = parseTrackMeta(parts[0], parts[1] || canonicalName);
        const duration = parts[2]?.trim() || '0:00';
        const id = parts[3]?.trim() || '';
        if (!id || id === 'NA') return;

        tracks.push({
          id: Date.now() + Math.floor(Math.random() * 1000000) + i,
          title: meta.title || parts[0]?.trim() || '',
          artist: meta.artist || canonicalName,
          duration,
          url: `https://youtube.com/watch?v=${id}`,
          cover: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
          mediaType: 'music'
        });
      });

      // If finalAvatar is missing or was a track cover, fetch the real YouTube artist profile picture
      if (isTrackCover(finalAvatar)) {
        const cached = globalArtistAvatarCache.get(canonicalName.toLowerCase()) || globalArtistAvatarCache.get(rawName.toLowerCase());
        if (cached && !isTrackCover(cached)) {
          finalAvatar = cached;
        } else {
          try {
            const ytArtRes = await invoke<string>('search_youtube_artists', { query: canonicalName });
            for (const artLine of ytArtRes.trim().split('\n')) {
              const artParts = artLine.split('====');
              const foundPfp = artParts[1]?.trim();
              if (foundPfp && foundPfp.startsWith('http') && !isTrackCover(foundPfp)) {
                finalAvatar = foundPfp;
                globalArtistAvatarCache.set(canonicalName.toLowerCase(), foundPfp);
                globalArtistAvatarCache.set(rawName.toLowerCase(), foundPfp);
                break;
              }
            }
          } catch {}
        }
      }

      if (isTrackCover(finalAvatar)) {
        finalAvatar = undefined;
      } else if (finalAvatar) {
        globalArtistAvatarCache.set(canonicalName.toLowerCase(), finalAvatar);
        globalArtistAvatarCache.set(rawName.toLowerCase(), finalAvatar);
      }

      if (!finalBanner) {
        finalBanner = finalAvatar;
      }

      const pageData: ArtistPageData = {
        name: canonicalName,
        avatar: finalAvatar,
        banner: finalBanner,
        topTracks: tracks
      };

      if (activeArtistQueryIdRef.current !== queryId) return;

      setSelectedArtistName(canonicalName);
      artistCacheRef.current.set(cacheKey, pageData);
      artistCacheRef.current.set(canonicalName.toLowerCase(), pageData);
      setArtistPageData(pageData);
      setIsArtistLoading(false);

      if (finalAvatar) {
        setFollowedArtists(prev => prev.map(a => {
          if (a.name.toLowerCase() === canonicalName.toLowerCase() || a.name.toLowerCase() === rawName.toLowerCase()) {
            return { ...a, name: canonicalName, avatar: finalAvatar, banner: finalBanner };
          }
          return a;
        }));
      }

      if (tracks.length === 0) {
        setArtistError(`No songs found for "${canonicalName}".`);
      }
    } catch {
      if (activeArtistQueryIdRef.current === queryId) {
        setIsArtistLoading(false);
        setArtistError(`Failed to load songs for "${rawName}".`);
      }
    }
  }, [activeNav, setActiveNav]);

  const handleArtistBack = useCallback(() => {
    const target = previousNavRef.current && previousNavRef.current !== 'artist' ? previousNavRef.current : 'artists';
    setActiveNav(target);
  }, [setActiveNav]);

  const handlePlayArtist = useCallback((name: string) => {
    openArtistPage(name);
  }, [openArtistPage]);

  const navigateBack = useCallback(() => {
    if (activeNav === 'artist') {
      handleArtistBack();
      return;
    }
    if (activeNav === 'home' && (searchQuery || hasSearched)) {
      resetSearch();
      return;
    }
    if (activeNav === 'playlists' && openPlaylistId) {
      setOpenPlaylistId(null);
      return;
    }
    if (navHistory.length > 1) {
      const newHistory = [...navHistory];
      newHistory.pop();
      const prevNav = newHistory[newHistory.length - 1];
      setNavHistory(newHistory);
      setActiveNavState(prevNav);
      saveLS('vg_lastNav', prevNav);
    } else if (activeNav !== 'home') {
      setActiveNav('home');
    }
  }, [activeNav, handleArtistBack, searchQuery, hasSearched, resetSearch, openPlaylistId, navHistory, setActiveNav, setOpenPlaylistId]);

  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [infoModalTrack, setInfoModalTrack] = useState<Track | null>(null);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);
  const [hoveredTrackUrl, setHoveredTrackUrl] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [isSpotifyImporting, setIsSpotifyImporting] = useState(false);
  const [droppedCsvBatch, setDroppedCsvBatch] = useState<{ id: number; items: { name: string; getText: () => Promise<string> }[] } | null>(null);
  const [showYtImportModal, setShowYtImportModal] = useState(false);
  const spotifyAbortRef = useRef<(() => void) | null>(null);
  const isSpotifyImportActiveRef = useRef(false);
  const [bgImport, setBgImport] = useState<{
    currentFile: number;
    totalFiles: number;
    matchedTracks: number;
    totalTracks: number;
    fileName: string;
  } | null>(null);
  const [bgYtImport, setBgYtImport] = useState<{ progress: number } | null>(null);
  const [pendingSpotifyImport, setPendingSpotifyImport] = useState<{ tracks: Track[]; matchedCount: number; failedCount: number } | null>(null);
  const [showDuplicatesPlaylist, setShowDuplicatesPlaylist] = useState<Playlist | null>(null);
  const [bulkEditPlaylist, setBulkEditPlaylist] = useState<Playlist | null>(null);

  const openCtx = useCallback((e: React.MouseEvent, menu: Omit<CtxMenu, 'x' | 'y'>) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenu(e.clientX, e.clientY);
    setCtxMenu({ x, y, ...menu });
  }, []);

  const mprisToggleRef = useRef<() => void>(() => {});
  const mprisNextRef = useRef<() => void>(() => {});
  const mprisPrevRef = useRef<() => void>(() => {});
  const isPlayingRef = useRef(isPlaying);
  const setIsPlayingRef = useRef(setIsPlaying);
  const handlePlayTrackRef = useRef(handlePlayTrack);
  const handlePlayLocalTrackRef = useRef(handlePlayLocalTrack);
  const setVolumeRef = useRef(setVolume);
  const setShuffleRef = useRef(setShuffle);
  const setRepeatModeRef = useRef(setRepeatMode);
  const setPlaybackSpeedStateRef = useRef(setPlaybackSpeedState);

  mprisToggleRef.current = togglePlayPause;
  mprisNextRef.current = handleSkipForward;
  mprisPrevRef.current = handleSkipBack;
  isPlayingRef.current = isPlaying;
  setIsPlayingRef.current = setIsPlaying;
  handlePlayTrackRef.current = handlePlayTrack;
  handlePlayLocalTrackRef.current = handlePlayLocalTrack;
  setVolumeRef.current = setVolume;
  setShuffleRef.current = setShuffle;
  setRepeatModeRef.current = setRepeatMode;
  setPlaybackSpeedStateRef.current = setPlaybackSpeedState;

  useEffect(() => {
    let active = true;
    const cleanups: (() => void)[] = [];
    const register = (event: string, handler: () => void) => {
      listen(event, handler).then(unlisten => {
        if (active) {
          cleanups.push(unlisten);
        } else {
          unlisten();
        }
      });
    };

    register('mpris_play_pause', () => mprisToggleRef.current());
    register('mpris_next', () => mprisNextRef.current());
    register('mpris_prev', () => mprisPrevRef.current());
    register('mpris_play', () => {
      if (!isPlayingRef.current) {
        invoke('resume_audio').catch(() => {});
        setIsPlayingRef.current(true);
      }
    });
    register('mpris_pause', () => {
      if (isPlayingRef.current) {
        invoke('pause_audio').catch(() => {});
        setIsPlayingRef.current(false);
      }
    });
    register('mpris_stop', () => {
      invoke('pause_audio').catch(() => {});
      invoke('seek_audio', { time: 0 }).catch(() => {});
      setIsPlayingRef.current(false);
    });

    listen<string>('mpris_set_loop_status', e => {
      const status = e.payload;
      const mode: RepeatMode = status === 'Track' ? 'one' : status === 'Playlist' ? 'all' : 'off';
      setRepeatModeRef.current(mode);
    }).then(unlisten => {
      if (active) cleanups.push(unlisten);
      else unlisten();
    });

    listen<boolean>('mpris_set_shuffle', e => {
      setShuffleRef.current(!!e.payload);
    }).then(unlisten => {
      if (active) cleanups.push(unlisten);
      else unlisten();
    });

    listen<number>('mpris_set_volume', e => {
      const vol = typeof e.payload === 'number' ? Math.round(e.payload) : 100;
      setVolumeRef.current(vol);
    }).then(unlisten => {
      if (active) cleanups.push(unlisten);
      else unlisten();
    });

    listen<number>('mpris_set_rate', e => {
      if (typeof e.payload === 'number' && Number.isFinite(e.payload)) {
        setPlaybackSpeedStateRef.current(e.payload);
      }
    }).then(unlisten => {
      if (active) cleanups.push(unlisten);
      else unlisten();
    });

    listen<string>('mpris_open_uri', e => {
      const uri = e.payload;
      if (!uri) return;
      if (uri.startsWith('file://')) {
        const path = decodeURIComponent(uri.replace(/^file:\/\//, ''));
        const filename = path.split('/').pop() || 'Track';
        const ext = filename.includes('.') ? filename.split('.').pop() || 'mp3' : 'mp3';
        handlePlayLocalTrackRef.current({
          path,
          title: filename.replace(/\.[^/.]+$/, ''),
          extension: ext,
          size_bytes: 0,
          artist: 'Offline Audio',
        });
      } else if (uri.startsWith('/')) {
        const filename = uri.split('/').pop() || 'Track';
        const ext = filename.includes('.') ? filename.split('.').pop() || 'mp3' : 'mp3';
        handlePlayLocalTrackRef.current({
          path: uri,
          title: filename.replace(/\.[^/.]+$/, ''),
          extension: ext,
          size_bytes: 0,
          artist: 'Offline Audio',
        });
      } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
        handlePlayTrackRef.current({
          id: Date.now(),
          title: uri.split('/').pop() || 'Streaming Audio',
          artist: 'Unknown Artist',
          url: uri,
          duration: '0:00',
          cover: '',
        });
      }
    }).then(unlisten => {
      if (active) cleanups.push(unlisten);
      else unlisten();
    });

    register('tray_play_pause', () => mprisToggleRef.current());
    register('tray_next', () => mprisNextRef.current());
    register('tray_prev', () => mprisPrevRef.current());

    if (trayEnabled) {
      invoke('tray_set', { enabled: true }).catch(() => {});
    }

    return () => {
      active = false;
      cleanups.forEach(fn => fn());
    };
  }, []);

  useEffect(() => {
    const loopStatus = repeatMode === 'one' ? 'Track' : repeatMode === 'all' ? 'Playlist' : 'None';
    invoke('sync_mpris_controls', {
      loopStatus,
      shuffle,
      volume: volume / 100,
      rate: playbackSpeed,
    }).catch(() => {});
  }, [repeatMode, shuffle, volume, playbackSpeed]);

  useEffect(() => {
    if (trayEnabled) {
      invoke('tray_update_title', {
        title: currentTrack?.title || null,
        artist: currentTrack?.artist || null,
        isPlaying,
      }).catch(() => {});
    }
  }, [currentTrack?.title, currentTrack?.artist, isPlaying, trayEnabled]);

  useEffect(() => {
    if (!cacheEnabled) return;
    const limit = loadLS<string>('vg_cacheLimit', '1gb');
    const limitMap: Record<string, number> = {
      '500mb': 500 * 1024 * 1024,
      '1gb': 1024 * 1024 * 1024,
      '2gb': 2 * 1024 * 1024 * 1024,
      '5gb': 5 * 1024 * 1024 * 1024,
      'unlimited': 0,
    };
    const maxBytes = limitMap[limit] ?? 1024 * 1024 * 1024;
    invoke('prune_cache_if_needed', { maxBytes }).catch(() => {});
  }, [currentTrack?.url, cacheEnabled]);

  useEffect(() => {
    if (!currentTrack) {
      invoke('set_mpris_metadata', {
        title: '',
        artist: '',
        album: '',
        albumArtist: '',
        url: '',
        coverUrl: '',
        durationSecs: 0,
        playing: false,
      }).catch(() => {});
      return;
    }
    const parseDuration = (d: string): number => {
      const parts = d.split(':').map(Number);
      if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
      if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
      return 0;
    };
    const parsed = parseDuration(currentTrack.duration ?? '0:00');
    const finalDuration = trackDurationSeconds > 0 ? trackDurationSeconds : parsed;
    invoke('set_mpris_metadata', {
      title: currentTrack.title ?? '',
      artist: currentTrack.artist ?? '',
      album: currentTrack.album ?? '',
      albumArtist: currentTrack.artist ?? '',
      url: currentTrack.url ?? '',
      coverUrl: getTrackCover(currentTrack) || currentTrack.cover || '',
      durationSecs: finalDuration,
      playing: isPlaying,
    }).catch(() => {});
  }, [currentTrack, isPlaying, getTrackCover, trackDurationSeconds]);

  const lastRpcProgressRef = useRef<number>(0);
  const lastRpcStateRef = useRef<string>('');

  useEffect(() => {
    if (discordRpcEnabled && isPlaying && currentTrack) {
      const delta = Math.abs(progressSeconds - lastRpcProgressRef.current);
      const stateSig = `${currentTrack.id}-${discordShowCover}-${discordTimeDisplay}-${discordCustomBtn}-${discordBtnLabel}-${discordBtnUrl}`;
      const stateChanged = stateSig !== lastRpcStateRef.current;

      if (delta > 2 || lastRpcProgressRef.current === 0 || stateChanged) {
        lastRpcProgressRef.current = progressSeconds;
        lastRpcStateRef.current = stateSig;
        const coverUrl = currentTrack.cover && !currentTrack.cover.startsWith('data:') && !currentTrack.cover.startsWith('blob:') ? currentTrack.cover : null;
        const trackUrl = currentTrack.url && currentTrack.url.startsWith('http') ? currentTrack.url : null;
        const now = Math.floor(Date.now() / 1000);
        const remainingSecs = Math.max(0, trackDurationSeconds - progressSeconds);
        const startTimestamp = now - Math.floor(progressSeconds);
        const endTimestamp = trackDurationSeconds > 0 ? now + Math.floor(remainingSecs) : null;

        const customBtnLabel = discordCustomBtn ? discordBtnLabel : null;
        const customBtnUrl = discordCustomBtn ? discordBtnUrl : null;

        invoke('update_discord_rpc', {
          title: currentTrack.title,
          artist: cleanArtist(currentTrack.artist) || null,
          coverUrl,
          trackUrl,
          startTimestamp,
          endTimestamp,
          showCover: discordShowCover,
          timeDisplay: discordTimeDisplay,
          customButtonLabel: customBtnLabel || null,
          customButtonUrl: customBtnUrl || null,
        }).catch(() => {});
      }
    } else {
      lastRpcProgressRef.current = 0;
      lastRpcStateRef.current = '';
      invoke('clear_discord_rpc').catch(() => {});
    }
  }, [
    discordRpcEnabled,
    isPlaying,
    currentTrack,
    trackDurationSeconds,
    progressSeconds,
    discordShowCover,
    discordTimeDisplay,
    discordCustomBtn,
    discordBtnLabel,
    discordBtnUrl
  ]);

  useEffect(() => {
    invoke<string>('get_app_version').then(setAppVersion).catch(() => {});
    const autoCheck = loadLS('vg_autoCheckUpdates', true);
    if (autoCheck) {
      invoke<string | null>('check_for_update').then(v => setUpdateAvailable(v ?? null)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const p = loadLS<string>('vg_networkProxy', '');
    const inst = loadLS<string>('vg_customInstance', '');
    if (p || inst) {
      invoke('set_network_config', {
        proxyUrl: p.trim() || null,
        customInstance: inst.trim() || null,
      }).catch(() => {});
    }
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setIsCheckingUpdate(true);
    try {
      const v = await invoke<string | null>('check_for_update');
      setUpdateAvailable(v ?? null);
      if (v) showToast(`Update available: v${v}`);
      else showToast("You're up to date!");
    } catch (e) {
      showToast(`Failed to check updates: ${e}`);
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [showToast]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.ctrlKey || e.metaKey) {
        if (e.code === 'KeyF' || e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          e.stopPropagation();
          if (activeNav !== 'home') {
            setActiveNav('home');
            setTimeout(() => {
              searchRef.current?.focus();
              searchRef.current?.select();
            }, 100);
          } else {
            searchRef.current?.focus();
            searchRef.current?.select();
          }
          return;
        }

        if (e.code === 'Digit1' || e.key === '1') {
          e.preventDefault();
          setActiveNav('home');
          return;
        }

        if (e.code === 'Digit2' || e.key === '2') {
          e.preventDefault();
          setActiveNav('artists');
          return;
        }

        if (e.code === 'Digit3' || e.key === '3') {
          e.preventDefault();
          setActiveNav('downloads');
          return;
        }

        if (e.code === 'Digit4' || e.key === '4') {
          e.preventDefault();
          setActiveNav('stats');
          return;
        }

        if (e.code === 'Digit5' || e.key === '5') {
          e.preventDefault();
          setActiveNav('history');
          return;
        }

        if (e.code === 'Digit6' || e.key === '6') {
          e.preventDefault();
          setActiveNav('settings');
          return;
        }

        if (e.code === 'Digit7' || e.key === '7') {
          e.preventDefault();
          setIsQueueOpen(prev => !prev);
          return;
        }

        if (e.code === 'Digit8' || e.key === '8' || e.code === 'KeyP' || e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          setOpenPlaylistId(null);
          setActiveNav('playlists');
          return;
        }

        if (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          setUiScaleState(prev => {
            const next = Math.max(-5, Math.min(5, prev - 1));
            saveLS('vg_uiScale', next);
            (document.documentElement.style as any).zoom = `${100 + next * 5}%`;
            showToast(`UI Scale: ${next > 0 ? `+${next}` : next} (${100 + next * 5}%)`);
            return next;
          });
          return;
        }

        if (e.key === '+' || e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd') {
          e.preventDefault();
          setUiScaleState(prev => {
            const next = Math.max(-5, Math.min(5, prev + 1));
            saveLS('vg_uiScale', next);
            (document.documentElement.style as any).zoom = `${100 + next * 5}%`;
            showToast(`UI Scale: ${next > 0 ? `+${next}` : next} (${100 + next * 5}%)`);
            return next;
          });
          return;
        }

        if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault();
          setUiScaleState(prev => {
            if (prev === 0) return 0;
            saveLS('vg_uiScale', 0);
            (document.documentElement.style as any).zoom = '100%';
            showToast('UI Scale: Default (100%)');
            return 0;
          });
          return;
        }
      }

      if (!isInput && ((e.altKey && (e.code === 'ArrowLeft' || e.key === 'ArrowLeft')) || e.code === 'BrowserBack')) {
        e.preventDefault();
        navigateBack();
        return;
      }

      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !isInput) {
        const digitMatch = e.code.match(/^Digit([1-9])$/);
        if (digitMatch) {
          const num = parseInt(digitMatch[1], 10);
          const targetIdx = num - 1;
          if (playlists[targetIdx]) {
            e.preventDefault();
            setActiveNav('playlists');
            setOpenPlaylistId(playlists[targetIdx].id);
            showToast(`Opened "${playlists[targetIdx].name}"`);
            return;
          }
        }
      }

      if (e.code === 'Space' && !isInput) { e.preventDefault(); togglePlayPause(); }
      if (e.code === 'ArrowRight' && !isInput && currentTrackRef.current) { e.preventDefault(); invoke('seek_relative', { seconds: 10 }).catch(() => {}); }
      if (e.code === 'ArrowLeft' && !isInput && currentTrackRef.current) { e.preventDefault(); invoke('seek_relative', { seconds: -10 }).catch(() => {}); }
      if (e.code === 'KeyM' && !isInput) toggleMute();
      if (e.key === '?' && !isInput) { e.preventDefault(); setShowShortcuts(s => !s); }
      if (e.code === 'Escape') {
        if (showLyrics) {
          setShowLyrics(false);
          return;
        }
        setShowShortcuts(false);
        setConfirmModal(null);
        setShowCsvImportModal(false);
        setShowYtImportModal(false);
        setShowDuplicatesPlaylist(null);
        setBulkEditPlaylist(null);
        setInfoModalTrack(null);
        setAddToPlaylistTrack(null);
        setCtxMenu(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [togglePlayPause, toggleMute, searchRef, currentTrackRef, activeNav, setActiveNav, setIsQueueOpen, setOpenPlaylistId, playlists, showToast, showLyrics, setShowLyrics, setConfirmModal, setShowCsvImportModal, setShowYtImportModal, setShowDuplicatesPlaylist, setBulkEditPlaylist, setInfoModalTrack, setAddToPlaylistTrack, setCtxMenu, navigateBack]);

  useEffect(() => {
    const h = () => {
      setCtxMenu(null);
      setShowHistory(false);
      setShowSleepPopover(false);
    };
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [setShowHistory, setShowSleepPopover]);

  useEffect(() => {
    let lastDropTime = 0;
    let unlisten: (() => void) | undefined;

    const handleBatch = (items: { name: string; getText: () => Promise<string> }[]) => {
      const uniqueItems: { name: string; getText: () => Promise<string> }[] = [];
      const seen = new Set<string>();
      for (const it of items) {
        if (!seen.has(it.name)) {
          seen.add(it.name);
          uniqueItems.push(it);
        }
      }
      if (uniqueItems.length > 0) {
        setDroppedCsvBatch({ id: Date.now(), items: uniqueItems });
        setShowCsvImportModal(false);
      }
    };

    try {
      getCurrentWebviewWindow().onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          const now = Date.now();
          if (now - lastDropTime < 600) return;
          lastDropTime = now;

          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            const csvs = paths.filter(p => p.toLowerCase().endsWith('.csv'));
            if (csvs.length > 0) {
              handleBatch(csvs.map(p => ({
                name: p.split(/[/\\]/).pop() || 'Spotify Playlist',
                getText: () => invoke<string>('read_text_file', { path: p }),
              })));
            }
          }
        }
      }).then(u => { unlisten = u; }).catch(() => {});
    } catch {}

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastDropTime < 600) return;
      lastDropTime = now;

      if (e.dataTransfer?.files?.length) {
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.csv'));
        if (files.length > 0) {
          handleBatch(files.map(f => ({
            name: f.name,
            getText: () => f.text(),
          })));
        }
      }
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);

    return () => {
      if (unlisten) unlisten();
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
    };
  }, []);

  useEffect(() => {
    if (showCsvImportModal || droppedCsvBatch || isSpotifyImporting) {
      isSpotifyImportActiveRef.current = true;
    }
  }, [showCsvImportModal, droppedCsvBatch, isSpotifyImporting]);

  const cancelSpotifyImport = useCallback(() => {
    isSpotifyImportActiveRef.current = false;
    if (spotifyAbortRef.current) {
      try { spotifyAbortRef.current(); } catch {}
    }
    setIsSpotifyImporting(false);
    setBgImport(null);
    setShowCsvImportModal(false);
    setDroppedCsvBatch(null);
    showToast('Spotify import cancelled');
  }, [showToast]);

  const handleCancelDownload = useCallback(async (url: string) => {
    try { await invoke('cancel_download', { url }); } catch {}
    setDownloadingTracks(p => { const n = { ...p }; delete n[url]; return n; });
    setActiveDownloads(prev => prev.filter(d => d.url !== url));
    showToast('Download cancelled');
  }, [showToast]);

  const handleDownload = useCallback(async (track: Track) => {
    if (downloadingTracks[track.url] !== undefined) {
      handleCancelDownload(track.url);
      return;
    }
    if (duplicateDetect) {
      try {
        const scanned: LocalTrack[] = await invoke('scan_downloads', { path: downloadPath });
        const existing = scanned.map(t => t.title.toLowerCase());
        if (existing.includes(track.title.toLowerCase())) {
          showToast(`Already downloaded: ${track.title}`);
          return;
        }
      } catch {}
    }
    setDownloadingTracks(p => ({ ...p, [track.url]: 1 }));
    setActiveDownloads(prev => [
      {
        url: track.url,
        title: track.title,
        artist: track.artist || 'YouTube Music',
        cover: track.cover,
        progress: 5,
        status: 'downloading',
        startedAt: Date.now(),
      },
      ...prev.filter(d => d.url !== track.url),
    ]);

    setDownloadPulseKey(k => k + 1);
    setIsDownloadsFlyoutOpen(true);
    if (flyoutAutoCloseTimerRef.current) clearTimeout(flyoutAutoCloseTimerRef.current);
    flyoutAutoCloseTimerRef.current = setTimeout(() => {
      setIsDownloadsFlyoutOpen(false);
    }, 6500);

    try {
      await invoke('download_song', {
        url: track.url,
        quality: downloadQuality,
        format: downloadFormat,
        embedThumbnail,
        path: downloadPath,
      });
      setDownloadingTracks(p => ({ ...p, [track.url]: 100 }));
      setActiveDownloads(prev => prev.map(item => item.url === track.url ? { ...item, progress: 100, status: 'completed' } : item));
      setTimeout(() => setDownloadingTracks(p => { const n = { ...p }; delete n[track.url]; return n; }), 1200);
      showToast(`Downloaded: ${track.title}`);
      setLocalRefreshNonce(n => n + 1);
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || '';
      if (!msg.includes('cancelled')) showToast(`Download failed: ${msg}`);
      setDownloadingTracks(p => { const n = { ...p }; delete n[track.url]; return n; });
      setActiveDownloads(prev => prev.map(item => item.url === track.url ? { ...item, status: 'error', error: msg } : item));
    }
  }, [downloadingTracks, duplicateDetect, downloadPath, downloadQuality, downloadFormat, embedThumbnail, handleCancelDownload, showToast]);

  const handleDeleteLocalTrack = useCallback(async (t: LocalTrack) => {
    try {
      await invoke('delete_local_file', { path: t.path });
      showToast(`Deleted: ${t.title}`);
      setLocalRefreshNonce(n => n + 1);
    } catch (e) {
      showToast(`Delete failed: ${e}`);
    }
  }, [showToast]);

  const handleOpenInFileManager = useCallback((p: string) => {
    invoke('open_in_file_manager', { path: p }).catch(() => {});
  }, []);

  const handleSaveMetadata = useCallback(async (title: string, artist: string, album: string) => {
    if (!metadataEditingTrack) return;
    const path = metadataEditingTrack.url.substring(8);
    try {
      await invoke('write_audio_metadata', { path, title, artist, album });
      const newPath: string = await invoke('rename_local_file', { oldPath: path, newTitle: title.trim() });
      const newUrl = `local://${newPath}`;
      
      const updateSynth = (t: Track | null): Track | null => {
        if (!t || t.url !== metadataEditingTrack.url) return t;
        return { ...t, title, artist, url: newUrl };
      };
      
      if (currentTrack && currentTrack.url === metadataEditingTrack.url) {
        setCurrentTrack(updateSynth(currentTrack));
      }
      setQueue(prev => prev.map(t => t.url === metadataEditingTrack.url ? (updateSynth(t) || t) : t));
      setPlayHistory(prev => prev.map(t => t.url === metadataEditingTrack.url ? (updateSynth(t) || t) : t));
      setPlaylists(prev => prev.map(pl => ({
        ...pl,
        tracks: pl.tracks.map(t => t.url === metadataEditingTrack.url ? (updateSynth(t) || t) : t)
      })));
      setLocalTracks(prev => prev.map(t => t.path === path ? { ...t, title, artist, path: newPath } : t));
      showToast('Metadata updated successfully');
      setMetadataEditingTrack(null);
      setLocalRefreshNonce(prev => prev + 1);
    } catch (e) {
      showToast(`Failed to save metadata: ${e}`);
      throw e;
    }
  }, [metadataEditingTrack, currentTrack, setCurrentTrack, setQueue, setPlayHistory, setPlaylists, showToast]);

  const handleSelectDirectory = useCallback(async () => {
    try {
      const sel = await open({ directory: true, multiple: false, defaultPath: downloadPath });
      if (sel) setDownloadPath(sel as string);
    } catch {}
  }, [downloadPath]);

  const handleExportPlaylistM3u = useCallback(async (playlist: Playlist) => {
    try {
      const tracksData = playlist.tracks.map(t => ({
        title: t.title,
        artist: t.artist || '',
        url: t.url,
        duration_secs: 0,
      }));
      const safeName = playlist.name.replace(/[/\\:*?"<>|]/g, '_');
      const path = `${downloadPath}/${safeName}.m3u`;
      await invoke('export_playlist_m3u', { tracks: tracksData, path });
      showToast(`Exported "${playlist.name}" to ${path}`);
    } catch (e) { showToast(`Export failed: ${e}`); }
  }, [downloadPath, showToast]);

  const handleExportLocalTracksM3u = useCallback(async (ts: LocalTrack[]) => {
    try {
      const tracksData = ts.map(t => ({
        title: t.title,
        artist: t.artist || '',
        url: `local://${t.path}`,
        duration_secs: 0,
      }));
      const path = `${downloadPath}/Local_Library.m3u`;
      await invoke('export_playlist_m3u', { tracks: tracksData, path });
      showToast(`Exported local library to ${path}`);
    } catch (e) { showToast(`Export failed: ${e}`); }
  }, [downloadPath, showToast]);

  const handleImportPlaylistM3u = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.m3u,.m3u8';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async (e) => {
      document.body.removeChild(input);
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) { showToast('Empty M3U file'); return; }

        const importedTracks: Track[] = [];
        let pendingTitle = '';
        let pendingArtist = '';

        for (const line of lines) {
          if (line.startsWith('#EXTINF:')) {
            const meta = line.slice(line.indexOf(',') + 1);
            const dashIdx = meta.indexOf(' - ');
            if (dashIdx !== -1) {
              pendingArtist = meta.slice(0, dashIdx).trim();
              pendingTitle = meta.slice(dashIdx + 3).trim();
            } else {
              pendingTitle = meta.trim();
              pendingArtist = '';
            }
          } else if (!line.startsWith('#')) {
            const url = line;
            const ytId = url.match(/(?:[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1] || '';
            if (!pendingTitle) {
              pendingTitle = ytId ? 'YouTube Track' : url.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Track';
            }
            importedTracks.push({
              id: Date.now() + importedTracks.length,
              title: pendingTitle,
              artist: pendingArtist,
              duration: '0:00',
              url,
              cover: ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : '',
            });
            pendingTitle = '';
            pendingArtist = '';
          }
        }

        if (!importedTracks.length) { showToast('No tracks found in M3U file'); return; }
        const name = file.name.replace(/\.m3u8?$/i, '');
        setPlaylists(prev => [...prev, {
          id: `pl_${Date.now()}`,
          name,
          description: `Imported from ${file.name}`,
          tracks: importedTracks,
        }]);
        showToast(`Imported "${name}" (${importedTracks.length} track${importedTracks.length !== 1 ? 's' : ''})`);
      } catch (err) {
        showToast(`Import failed: ${err}`);
      }
    };
    input.click();
  }, [showToast, setPlaylists]);

  const handleBackup = useCallback(async () => {
    try {
      
      const cleanPlaylists = (playlists || []).map(p => ({
        ...p,
        tracks: (p.tracks || []).filter(t => t && t.url && !t.url.startsWith('local://')),
      }));

      const cleanQueue = (queue || []).filter(t => t && t.url && !t.url.startsWith('local://'));
      const cleanPlayHistory = (playHistory || []).filter(t => t && t.url && !t.url.startsWith('local://'));
      const cleanQuickPicks = (quickPicks || []).filter(t => t && t.url && !t.url.startsWith('local://'));
      const cleanCurrentTrack = currentTrack && !currentTrack.url?.startsWith('local://') ? currentTrack : null;

      const cleanPlayCounts: Record<string, number> = {};
      Object.entries(playCounts || {}).forEach(([k, v]) => {
        if (!k.startsWith('local://')) cleanPlayCounts[k] = v;
      });

      const cleanListenSecs: Record<string, number> = {};
      Object.entries(listenSecs || {}).forEach(([k, v]) => {
        if (!k.startsWith('local://')) cleanListenSecs[k] = v;
      });

      const cleanDailyPlays: Record<string, number> = {};
      Object.entries(dailyPlays || {}).forEach(([k, v]) => {
        if (!k.startsWith('local://')) cleanDailyPlays[k] = v;
      });

      const cleanFirstSeen: Record<string, string> = {};
      Object.entries(firstSeen || {}).forEach(([k, v]) => {
        if (!k.startsWith('local://')) cleanFirstSeen[k] = v;
      });

      const cleanListeningHistory = (listeningHistory || []).filter(item => item && item.url && !item.url.startsWith('local://'));
      const cleanPlaybackHistory = (playbackHistory || []).filter(item => item && item.track && item.track.url && !item.track.url.startsWith('local://'));

      const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        
        playlists: cleanPlaylists,
        playlistViewMode,
        queue: cleanQueue,
        currentTrack: cleanCurrentTrack,
        quickPicks: cleanQuickPicks,
        searchHistory: searchHistory || [],

        playHistory: cleanPlayHistory,
        playbackHistory: cleanPlaybackHistory,
        playCounts: cleanPlayCounts,
        listenSecs: cleanListenSecs,
        dailyPlays: cleanDailyPlays,
        firstSeen: cleanFirstSeen,
        listeningHistory: cleanListeningHistory,
        statsTimeRange,
        artistThumbs: loadLS('vg_artistThumbs', {}),

        volume,
        playbackSpeed,
        crossfadeSeconds,
        shuffle,
        repeatMode,
        eq,
        loudnormEnabled,
        skipSilence,
        autoplayEnabled,

        theme,
        customBgColor,
        accentColor,
        uiScale,
        performanceMode,
        startupNav,
        trayEnabled,

        downloadQuality,
        downloadFormat,
        downloadPath,
        backupPath,
        embedThumbnail,
        duplicateDetect,
        cacheEnabled,
        cacheLimit: loadLS('vg_cacheLimit', '1gb'),
        autoCheckUpdates,

        discordRpcEnabled,
        discordShowCover,
        discordTimeDisplay,
        discordCustomBtn,
        discordBtnLabel,
        discordBtnUrl,

        networkProxy: loadLS('vg_networkProxy', ''),
        customInstance: loadLS('vg_customInstance', ''),

        lyricsSource,
        lastfmEnabled,

        onboardingCompleted: loadLS('vg_onboardingCompleted', false),
        userPreferences,
        recommendedTracks,
        followedArtists,
      };

      const json = JSON.stringify(data, null, 2);
      const sep = navigator.platform.includes('Win') ? '\\' : '/';
      const resolvedBase = backupPath || downloadPath || '';
      if (resolvedBase) {
        const filePath = resolvedBase.replace(/[/\\]$/, '') + sep + 'veluna_backup.json';
        await invoke('write_text_file', { path: filePath, content: json });
        showToast(`Backup saved to ${filePath}`);
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'veluna_backup.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Backup saved');
      }
    } catch (e) {
      showToast(`Backup failed: ${e}`);
    }
  }, [
    playlists, playlistViewMode, queue, playHistory, playbackHistory, playCounts, listenSecs, dailyPlays, firstSeen,
    listeningHistory, statsTimeRange, shuffle, repeatMode, volume, playbackSpeed, crossfadeSeconds, eq, downloadQuality,
    downloadFormat, downloadPath, backupPath, embedThumbnail, duplicateDetect, loudnormEnabled,
    skipSilence, autoplayEnabled, theme, customBgColor, accentColor, uiScale, performanceMode,
    startupNav, trayEnabled, cacheEnabled, autoCheckUpdates, discordRpcEnabled, discordShowCover, discordTimeDisplay,
    discordCustomBtn, discordBtnLabel, discordBtnUrl, lyricsSource,
    searchHistory, quickPicks, currentTrack, showToast, followedArtists, userPreferences, recommendedTracks
  ]);

  const handleRestore = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async (e) => {
      document.body.removeChild(input);
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data || typeof data !== 'object') {
          showToast('Invalid backup file');
          return;
        }

        const ls = (k: string, v: any) => {
          saveLS(k, v);
          return v;
        };

        if (Array.isArray(data.playlists)) {
          setPlaylists(ls('vg_playlists', data.playlists));
        }
        if (data.playlistViewMode) {
          setPlaylistViewMode(ls('vg_playlistViewMode', data.playlistViewMode));
        }
        if (Array.isArray(data.queue)) {
          setQueue(ls('vg_queue', data.queue));
        }
        if (data.currentTrack) {
          setCurrentTrack(ls('vg_currentTrack', data.currentTrack));
        }
        if (Array.isArray(data.quickPicks)) {
          setQuickPicks(ls('vg_quickPicks', data.quickPicks));
        }
        if (Array.isArray(data.searchHistory)) {
          ls('vg_searchHistory', data.searchHistory);
        }

        if (Array.isArray(data.playHistory)) {
          setPlayHistory(ls('vg_playHistory', data.playHistory));
        }
        if (Array.isArray(data.playbackHistory)) {
          setPlaybackHistory(ls('vg_playbackHistory', data.playbackHistory));
        }
        if (data.playCounts && typeof data.playCounts === 'object') {
          setPlayCounts(ls('vg_playCounts', data.playCounts));
        }
        if (data.listenSecs && typeof data.listenSecs === 'object') {
          setListenSecs(ls('vg_listenSecs', data.listenSecs));
        }
        if (data.dailyPlays && typeof data.dailyPlays === 'object') {
          setDailyPlays(ls('vg_dailyPlays', data.dailyPlays));
        }
        if (data.firstSeen && typeof data.firstSeen === 'object') {
          setFirstSeen(ls('vg_firstSeen', data.firstSeen));
        }
        if (Array.isArray(data.listeningHistory)) {
          setListeningHistory(ls('vg_listeningHistory', data.listeningHistory));
        }
        if (data.statsTimeRange) {
          setStatsTimeRange(ls('vg_statsTimeRange', data.statsTimeRange));
        }
        if (data.artistThumbs && typeof data.artistThumbs === 'object') {
          ls('vg_artistThumbs', data.artistThumbs);
        }

        const vol = typeof data.volume === 'number' ? data.volume : data.vg_volume;
        if (typeof vol === 'number') {
          setVolume(ls('vg_volume', vol));
          invoke('set_volume', { volume: vol }).catch(() => {});
        }

        const spd = data.playbackSpeed || data.vg_playbackSpeed;
        if (spd) setPlaybackSpeedState(ls('vg_playbackSpeed', Number(spd)));

        const cf = data.crossfadeSeconds !== undefined ? data.crossfadeSeconds : data.vg_crossfade;
        if (cf !== undefined) ls('vg_crossfade', Number(cf));

        const shuf = data.shuffle !== undefined ? data.shuffle : data.vg_shuffle;
        if (shuf !== undefined) setShuffle(ls('vg_shuffle', Boolean(shuf)));

        const rep = data.repeatMode || data.vg_repeatMode;
        if (rep) setRepeatMode(ls('vg_repeatMode', rep));

        if (data.eq) setEqState(ls('vg_eq', data.eq));

        const loudnorm = data.loudnormEnabled !== undefined ? data.loudnormEnabled : data.vg_loudnormEnabled;
        if (loudnorm !== undefined) setLoudnormEnabledState(ls('vg_loudnormEnabled', Boolean(loudnorm)));

        const skipSil = data.skipSilence !== undefined ? data.skipSilence : data.vg_skipSilence;
        if (skipSil !== undefined) setSkipSilenceState(ls('vg_skipSilence', Boolean(skipSil)));

        const autoPlay = data.autoplayEnabled !== undefined ? data.autoplayEnabled : data.vg_autoplayEnabled;
        if (autoPlay !== undefined) setAutoplayEnabled(ls('vg_autoplayEnabled', Boolean(autoPlay)));

        const thm = data.theme || data.vg_theme;
        if (thm) setTheme(ls('vg_theme', thm));

        const customBg = data.customBgColor || data.vg_customBgColor;
        if (customBg !== undefined) setCustomBgColor(ls('vg_customBgColor', customBg));

        const acc = data.accentColor || data.vg_accentColor;
        if (acc) setAccentColor(ls('vg_accentColor', acc));

        const scale = data.uiScale !== undefined ? data.uiScale : data.vg_uiScale;
        if (scale !== undefined) setUiScale(ls('vg_uiScale', Number(scale)));

        const perf = data.performanceMode !== undefined ? data.performanceMode : data.vg_performanceMode;
        if (perf !== undefined) setPerformanceMode(ls('vg_performanceMode', Boolean(perf)));

        const stNav = data.startupNav || data.vg_startupNav;
        if (stNav) setStartupNav(ls('vg_startupNav', stNav));

        const tray = data.trayEnabled !== undefined ? data.trayEnabled : data.vg_trayEnabled;
        if (tray !== undefined) setTrayEnabled(ls('vg_trayEnabled', Boolean(tray)));

        const dlQuality = data.downloadQuality || data.dlQuality || data.vg_dlQuality;
        if (dlQuality) setDownloadQuality(ls('vg_dlQuality', dlQuality));

        const dlFormat = data.downloadFormat || data.dlFormat || data.vg_dlFormat;
        if (dlFormat) setDownloadFormatState(ls('vg_dlFormat', dlFormat));

        const dlPath = data.downloadPath || data.dlPath || data.vg_dlPath;
        if (dlPath) setDownloadPath(ls('vg_dlPath', dlPath));

        const bkpPath = data.backupPath || data.vg_backupPath;
        if (bkpPath !== undefined) setBackupPath(ls('vg_backupPath', bkpPath));

        const embedThumb = data.embedThumbnail !== undefined ? data.embedThumbnail : (data.embedThumb !== undefined ? data.embedThumb : data.vg_embedThumb);
        if (embedThumb !== undefined) setEmbedThumbnailState(ls('vg_embedThumb', Boolean(embedThumb)));

        const dupDetect = data.duplicateDetect !== undefined ? data.duplicateDetect : (data.dupDetect !== undefined ? data.dupDetect : data.vg_dupDetect);
        if (dupDetect !== undefined) setDuplicateDetectState(ls('vg_dupDetect', Boolean(dupDetect)));

        const cacheEn = data.cacheEnabled !== undefined ? data.cacheEnabled : data.vg_cacheEnabled;
        if (cacheEn !== undefined) setCacheEnabled(ls('vg_cacheEnabled', Boolean(cacheEn)));

        const cacheLim = data.cacheLimit || data.vg_cacheLimit;
        if (cacheLim) ls('vg_cacheLimit', cacheLim);

        const autoUpdates = data.autoCheckUpdates !== undefined ? data.autoCheckUpdates : data.vg_autoCheckUpdates;
        if (autoUpdates !== undefined) setAutoCheckUpdates(ls('vg_autoCheckUpdates', Boolean(autoUpdates)));

        const discordRpc = data.discordRpcEnabled !== undefined ? data.discordRpcEnabled : data.vg_discordRpcEnabled;
        if (discordRpc !== undefined) setDiscordRpcEnabled(ls('vg_discordRpcEnabled', Boolean(discordRpc)));

        const showCover = data.discordShowCover !== undefined ? data.discordShowCover : data.vg_discordShowCover;
        if (showCover !== undefined) setDiscordShowCover(ls('vg_discordShowCover', Boolean(showCover)));

        const timeDisplay = data.discordTimeDisplay || data.vg_discordTimeDisplay;
        if (timeDisplay) setDiscordTimeDisplay(ls('vg_discordTimeDisplay', timeDisplay === 'elapsed' ? 'elapsed' : 'remaining'));

        const customBtn = data.discordCustomBtn !== undefined ? data.discordCustomBtn : data.vg_discordCustomBtn;
        if (customBtn !== undefined) setDiscordCustomBtn(ls('vg_discordCustomBtn', Boolean(customBtn)));

        const btnLabel = data.discordBtnLabel !== undefined ? data.discordBtnLabel : data.vg_discordBtnLabel;
        if (btnLabel !== undefined) setDiscordBtnLabel(ls('vg_discordBtnLabel', btnLabel));

        const btnUrl = data.discordBtnUrl !== undefined ? data.discordBtnUrl : data.vg_discordBtnUrl;
        if (btnUrl !== undefined) setDiscordBtnUrl(ls('vg_discordBtnUrl', btnUrl));

        const proxyVal = data.networkProxy !== undefined ? data.networkProxy : data.vg_networkProxy;
        if (proxyVal !== undefined) ls('vg_networkProxy', proxyVal);

        const instVal = data.customInstance !== undefined ? data.customInstance : data.vg_customInstance;
        if (instVal !== undefined) ls('vg_customInstance', instVal);

        if (proxyVal !== undefined || instVal !== undefined) {
          invoke('set_network_config', {
            proxyUrl: proxyVal?.trim() || null,
            customInstance: instVal?.trim() || null,
          }).catch(() => {});
        }

        const lyrics = data.lyricsSource || data.vg_lyricsSource;
        if (lyrics) setLyricsSource(ls('vg_lyricsSource', lyrics));

        const lfmEn = data.lastfmEnabled !== undefined ? data.lastfmEnabled : (data.vg_lastfmEnabled !== undefined ? data.vg_lastfmEnabled : data.vg_lfm_enabled);
        if (lfmEn !== undefined) setLastfmEnabled(Boolean(lfmEn));

        if (data.userPreferences) {
          setUserPreferences(data.userPreferences);
          ls('vg_userPreferences', data.userPreferences);
        }
        if (Array.isArray(data.recommendedTracks)) {
          setRecommendedTracks(data.recommendedTracks);
          ls('vg_recommendedTracks', data.recommendedTracks);
        }
        if (Array.isArray(data.followedArtists)) {
          setFollowedArtists(ls('vg_followedArtists', data.followedArtists));
        }
        if (data.onboardingCompleted !== undefined) {
          ls('vg_onboardingCompleted', data.onboardingCompleted);
        }

        showToast('Backup restored successfully');
      } catch (err) {
        showToast(`Restore failed: ${err}`);
      }
    };
    input.click();
  }, [
    showToast, setPlaylists, setPlaylistViewMode, setQueue, setPlayHistory, setPlayCounts, setListenSecs,
    setDailyPlays, setFirstSeen, setListeningHistory, setStatsTimeRange, setQuickPicks, setCurrentTrack, setVolume,
    setPlaybackSpeedState, setEqState, setShuffle, setRepeatMode, setLoudnormEnabledState,
    setSkipSilenceState, setAutoplayEnabled, setTheme, setAccentColor, setCustomBgColor,
    setPerformanceMode, setUiScale, setStartupNav, setTrayEnabled, setDownloadQuality,
    setDownloadFormatState, setDownloadPath, setBackupPath, setEmbedThumbnailState,
    setDuplicateDetectState, setCacheEnabled, setAutoCheckUpdates, setDiscordRpcEnabled,
    setLyricsSource, setLastfmEnabled, setLastfmUsername, setLastfmSessionKey, setLastfmApiKey,
    setLastfmApiSecret, setFollowedArtists, setUserPreferences, setRecommendedTracks
  ]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: "var(--v-bg0)",
        color: "var(--v-fg)",
        overflow: "hidden",
        fontSize: "16px",
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* 1. Main Content Body (Sidebar + View + Queue Panel) */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
        {/* Sidebar */}
        <Sidebar
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          playlists={playlists}
          openPlaylistId={openPlaylistId}
          setOpenPlaylistId={setOpenPlaylistId}
          performanceMode={performanceMode}
          setSettingsTab={setSettingsTab}
          isQueueOpen={isQueueOpen}
          setIsQueueOpen={setIsQueueOpen}
          queueLength={queue.length}
          queuePulseKey={queuePulseKey}
          setIsPlaylistModalOpen={setIsPlaylistModalOpen}
          setNewPlaylistName={setNewPlaylistName}
          setNewPlaylistDesc={setNewPlaylistDesc}
          setShowCsvImportModal={setShowCsvImportModal}
          setShowYtImportModal={setShowYtImportModal}
          handleImportPlaylistM3u={handleImportPlaylistM3u}
          openCtx={openCtx}
          getPlaylistCover={getPlaylistCover}
        />

        {/* Main View Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative", zIndex: 1 }}>
        <TopBar
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          openPlaylistId={openPlaylistId}
          setOpenPlaylistId={setOpenPlaylistId}
          hasSearched={hasSearched}
          tracks={tracks}
          ytMusicTracks={ytMusicTracks}
          videoTracks={videoTracks}
          isSearching={isSearching}
          navHistory={navHistory}
          navigateBack={navigateBack}
          resetSearch={resetSearch}
          activeDownloads={activeDownloads}
          isDownloadsFlyoutOpen={isDownloadsFlyoutOpen}
          setIsDownloadsFlyoutOpen={setIsDownloadsFlyoutOpen}
          downloadPulseKey={downloadPulseKey}
          onOpenShortcuts={() => setShowShortcuts(s => !s)}
          isOnline={isOnline}
        />

        <DownloadsFlyout
          isOpen={isDownloadsFlyoutOpen}
          onClose={() => setIsDownloadsFlyoutOpen(false)}
          downloads={activeDownloads}
          onCancelDownload={handleCancelDownload}
          onClearCompleted={() => setActiveDownloads(prev => prev.filter(d => d.status === 'downloading'))}
          onOpenFolder={() => handleOpenInFileManager(downloadPath)}
          onNavigateToDownloads={() => {
            setActiveNav('downloads');
            setIsDownloadsFlyoutOpen(false);
          }}
        />

        {/* View Routing */}
        <Suspense fallback={<ViewLoader />}>
        {activeNav === 'home' && (
          <HomeView
            isOnline={isOnline}
            onNavigateOffline={() => setActiveNav('downloads')}
            searchRef={searchRef}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchHistory={searchHistory}
            showHistory={showHistory}
            setShowHistory={setShowHistory}
            isSearching={isSearching}
            hasSearched={hasSearched}
            searchError={searchError}
            searchTab={searchTab}
            setSearchTab={setSearchTab}
            tracks={tracks}
            ytMusicTracks={ytMusicTracks}
            videoTracks={videoTracks}
            quickPicks={quickPicks}
            playCounts={playCounts}
            playHistory={playHistory}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            isLoadingTrack={isLoadingTrack}
            loadingTrackUrl={loadingTrackUrl}
            searchMusic={searchMusic}
            handlePlayTrack={handlePlayTrack}
            handlePlayInContext={handlePlayInContext}
            handleDownload={handleDownload}
            downloadingTracks={downloadingTracks}
            openCtx={openCtx}
            isTrackLiked={isTrackLiked}
            toggleLikeTrack={toggleLikeTrack}
            clearSearchHistory={clearSearchHistory}
            setSearchHistory={setSearchHistory}
            removeSearchHistoryItem={removeSearchHistoryItem}
            prefetchOnHover={prefetchOnHover}
            hoveredTrackUrl={hoveredTrackUrl}
            setHoveredTrackUrl={setHoveredTrackUrl}
            setActiveNav={setActiveNav}
            setPlaylists={setPlaylists}
            playlists={playlists}
            showToast={showToast}
            updateAvailable={updateAvailable}
            setSettingsTab={setSettingsTab}
            getTrackCover={getTrackCover}
            localTracks={localTracks}
            addToQueue={addToQueue}
            resetSearch={resetSearch}
            recommendedTracks={recommendedTracks}
            onRefreshRecommendations={handleRefreshRecommendations}
            onOpenPersonalization={() => setShowOnboardingModal(true)}
            onArtistClick={openArtistPage}
            setOpenPlaylistId={setOpenPlaylistId}
            followedArtists={followedArtists}
          />
        )}

        {activeNav === 'artists' && (
          <ArtistsView
            followedArtists={followedArtists}
            onToggleFollow={toggleFollowArtist}
            onArtistClick={openArtistPage}
            onPlayArtist={handlePlayArtist}
            showToast={showToast}
          />
        )}

        {activeNav === 'artist' && (
          <ArtistView
            artistName={selectedArtistName || 'Artist'}
            artistData={artistPageData}
            isLoading={isArtistLoading}
            error={artistError}
            isFollowed={followedArtists.some(a => a.name.toLowerCase() === (selectedArtistName || '').toLowerCase())}
            onToggleFollow={() => toggleFollowArtist({
              name: selectedArtistName || 'Artist',
              avatar: artistPageData?.avatar,
              banner: artistPageData?.banner
            })}
            onBack={handleArtistBack}
            onArtistClick={openArtistPage}
            handlePlayTrack={handlePlayTrack}
            handlePlayInContext={handlePlayInContext}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            loadingTrackUrl={loadingTrackUrl}
            isLoadingTrack={isLoadingTrack}
            hoveredTrackUrl={hoveredTrackUrl}
            setHoveredTrackUrl={setHoveredTrackUrl}
            toggleLikeTrack={toggleLikeTrack}
            isTrackLiked={(t) => isTrackLiked(t.url)}
            handleDownload={handleDownload}
            downloadingTracks={downloadingTracks}
            openCtx={openCtx}
            prefetchOnHover={prefetchOnHover}
            showToast={showToast}
            addToQueue={addToQueue}
            playlists={playlists}
          />
        )}

        {activeNav === 'downloads' && (
          <DownloadsPanel
            downloadPath={downloadPath}
            onPlayLocalTrack={handlePlayLocalTrack}
            onDeleteLocalTrack={handleDeleteLocalTrack}
            currentTrackPath={currentLocalPath}
            isPlaying={isPlaying}
            isLoadingTrack={isLoadingTrack}
            onOpenInFileManager={handleOpenInFileManager}
            onExportM3u={handleExportLocalTracksM3u}
            onChangeFolder={handleSelectDirectory}
            refreshNonce={localRefreshNonce}
            onCtx={(e: React.MouseEvent, track: LocalTrack) => openCtx(e, {
              type: 'local',
              track: {
                id: 0,
                title: track.title,
                artist: track.artist || '',
                url: `local://${track.path}`,
                cover: track.cover || '',
                duration: track.duration || '0:00',
              },
              localTracksList: localTracks,
              localTrackIndex: localTracks.findIndex(t => t.path === track.path),
            })}
            tracks={localTracks}
            setTracks={setLocalTracks}
            playlists={playlists}
            addToQueue={addToQueue}
            showToast={showToast}
          />
        )}

        {(activeNav === 'playlists' || activeNav === 'library') && (
          <PlaylistsView
            playlists={playlists}
            setPlaylists={setPlaylists}
            openPlaylistId={openPlaylistId}
            setOpenPlaylistId={setOpenPlaylistId}
            playlistViewMode={playlistViewMode}
            setPlaylistViewMode={setPlaylistViewMode}
            isPlaylistMultiSelect={isPlaylistMultiSelect}
            setIsPlaylistMultiSelect={setIsPlaylistMultiSelect}
            selectedPlaylistIds={selectedPlaylistIds}
            setSelectedPlaylistIds={setSelectedPlaylistIds}
            playlistSearchQ={playlistSearchQ}
            setPlaylistSearchQ={setPlaylistSearchQ}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            isLoadingTrack={isLoadingTrack}
            loadingTrackUrl={loadingTrackUrl}
            handlePlayTrack={handlePlayTrack}
            handlePlayInContext={handlePlayInContext}
            handleDownload={handleDownload}
            downloadingTracks={downloadingTracks}
            openCtx={openCtx}
            isTrackLiked={isTrackLiked}
            toggleLikeTrack={toggleLikeTrack}
            setIsPlaylistModalOpen={setIsPlaylistModalOpen}
            setShowCsvImportModal={setShowCsvImportModal}
            setShowYtImportModal={setShowYtImportModal}
            handleImportPlaylistM3u={handleImportPlaylistM3u}
            setPlaylistDeleteModal={setPlaylistDeleteModal}
            setRenamingPlaylist={setRenamingPlaylist}
            setRenameVal={setRenameVal}
            setRenameDescVal={setRenameDescVal}
            handlePlaylistCoverUpload={handlePlaylistCoverUpload}
            playHistory={playHistory}
            setPlayHistory={setPlayHistory}
            listenSecs={listenSecs}
            playCounts={playCounts}
            showToast={showToast}
            getPlaylistCover={getPlaylistCover}
            addToQueue={addToQueue}
            onArtistClick={openArtistPage}
          />
        )}

        {activeNav === 'stats' && (
          <StatsView
            listenSecs={listenSecs}
            setListenSecs={setListenSecs}
            playCounts={playCounts}
            setPlayCounts={setPlayCounts}
            dailyPlays={dailyPlays}
            setDailyPlays={setDailyPlays}
            firstSeen={firstSeen}
            setFirstSeen={setFirstSeen}
            playHistory={playHistory}
            setPlayHistory={setPlayHistory}
            listeningHistory={listeningHistory}
            setListeningHistory={setListeningHistory}
            statsTimeRange={statsTimeRange}
            setStatsTimeRange={setStatsTimeRange}
            quickPicks={quickPicks}
            playlists={playlists}
            handlePlayInContext={handlePlayInContext}
            setSearchQuery={setSearchQuery}
            searchMusic={searchMusic}
            setActiveNav={setActiveNav}
            artistThumbs={artistThumbs}
            setConfirmModal={setConfirmModal}
            showToast={showToast}
            onArtistClick={openArtistPage}
          />
        )}

        {activeNav === 'history' && (
          <HistoryView
            playbackHistory={playbackHistory}
            onClearHistory={clearPlaybackHistory}
            onRemoveHistoryItem={removePlaybackHistoryItem}
            handlePlayTrack={handlePlayTrack}
            handlePlayInContext={handlePlayInContext}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            loadingTrackUrl={loadingTrackUrl}
            isLoadingTrack={isLoadingTrack}
            hoveredTrackUrl={hoveredTrackUrl}
            setHoveredTrackUrl={setHoveredTrackUrl}
            toggleLikeTrack={toggleLikeTrack}
            isTrackLiked={(t) => isTrackLiked(t.url)}
            handleDownload={handleDownload}
            downloadingTracks={downloadingTracks}
            openCtx={openCtx}
            prefetchOnHover={prefetchOnHover}
            getTrackCover={getTrackCover}
            onArtistClick={openArtistPage}
            showToast={showToast}
            setConfirmModal={setConfirmModal}
          />
        )}

        {activeNav === 'settings' && (
          <SettingsPanel
            initialTab={settingsTab}
            downloadQuality={downloadQuality}
            setDownloadQuality={setDownloadQuality}
            downloadPath={downloadPath}
            handleSelectDirectory={handleSelectDirectory}
            downloadFormat={downloadFormat}
            setDownloadFormat={setDownloadFormatState}
            embedThumbnail={embedThumbnail}
            setEmbedThumbnail={setEmbedThumbnailState}
            duplicateDetect={duplicateDetect}
            setDuplicateDetect={setDuplicateDetectState}
            onBackup={handleBackup}
            onRestore={handleRestore}
            onReset={() => setConfirmModal({
              message: 'Reset all Veluna data? This cannot be undone.',
              onConfirm: () => { localStorage.clear(); window.location.reload(); }
            })}
            backupPath={backupPath}
            setBackupPath={setBackupPath}
            loudnormEnabled={loudnormEnabled}
            setLoudnormEnabled={setLoudnormEnabledState}
            skipSilence={skipSilence}
            setSkipSilence={setSkipSilenceState}
            theme={theme}
            setThemeState={setTheme}
            accentColor={accentColor}
            setAccentColorState={setAccentColor}
            customBgColor={customBgColor}
            setCustomBgColorState={setCustomBgColor}
            performanceMode={performanceMode}
            setPerformanceMode={setPerformanceMode}
            lyricsSource={lyricsSource}
            setLyricsSource={setLyricsSource}
            autoCheckUpdates={autoCheckUpdates}
            setAutoCheckUpdates={setAutoCheckUpdates}
            isCheckingUpdate={isCheckingUpdate}
            updateAvailable={updateAvailable}
            handleCheckUpdate={handleCheckUpdate}
            appVersion={appVersion}
            trayEnabled={trayEnabled}
            setTrayEnabled={setTrayEnabled}
            discordRpcEnabled={discordRpcEnabled}
            setDiscordRpcEnabled={setDiscordRpcEnabled}
            discordShowCover={discordShowCover}
            setDiscordShowCover={setDiscordShowCover}
            discordTimeDisplay={discordTimeDisplay}
            setDiscordTimeDisplay={setDiscordTimeDisplay}
            discordCustomBtn={discordCustomBtn}
            setDiscordCustomBtn={setDiscordCustomBtn}
            discordBtnLabel={discordBtnLabel}
            setDiscordBtnLabel={setDiscordBtnLabel}
            discordBtnUrl={discordBtnUrl}
            setDiscordBtnUrl={setDiscordBtnUrl}
            lastfmEnabled={lastfmEnabled}
            setLastfmEnabled={setLastfmEnabled}
            lastfmSessionKey={lastfmSessionKey}
            setLastfmSessionKey={setLastfmSessionKey}
            lastfmApiKey={lastfmApiKey}
            setLastfmApiKey={setLastfmApiKey}
            lastfmApiSecret={lastfmApiSecret}
            setLastfmApiSecret={setLastfmApiSecret}
            lastfmUsername={lastfmUsername}
            setLastfmUsername={setLastfmUsername}
            autoplayEnabled={autoplayEnabled}
            setAutoplayEnabled={setAutoplayEnabled}
            eq={eq}
            setEq={setEqState}
            startupNav={startupNav}
            setStartupNav={setStartupNav}
            cacheEnabled={cacheEnabled}
            setCacheEnabled={setCacheEnabled}
            uiScale={uiScale}
            setUiScale={setUiScale}
            showToast={showToast}
          />
        )}
        </Suspense>
      </div>

      {/* 3. Slide-out Queue Panel */}
      <QueuePanel
        isQueueOpen={isQueueOpen}
        setIsQueueOpen={setIsQueueOpen}
        queue={queue}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isLoadingTrack={isLoadingTrack}
        loadingTrackUrl={loadingTrackUrl}
        showClearConfirm={showClearConfirm}
        setShowClearConfirm={setShowClearConfirm}
        playlistContextRef={playlistContextRef}
        handlePlayTrack={handlePlayTrack}
        clearQueue={clearQueue}
        removeFromQueue={removeFromQueue}
        moveQueueItem={moveQueueItem}
        openCtx={openCtx}
        setPlaylists={setPlaylists}
        showToast={showToast}
        dragQueueIdx={dragQueueIdx}
        dragOverQueueIdx={dragOverQueueIdx}
        setDragOverQueueIdx={setDragOverQueueIdx}
        dragOverQueueIdxRef={dragOverQueueIdxRef}
      />
      </div>

      {/* 4. Bottom Player Bar */}
      <PlayerBar
        currentTrack={currentTrack}
        getTrackCover={getTrackCover}
        isPlaying={isPlaying}
        isLoadingTrack={isLoadingTrack}
        loadingTrackUrl={loadingTrackUrl}
        audioInfo={audioInfo}
        progressSeconds={progressSeconds}
        trackDurationSeconds={trackDurationSeconds}
        waveformData={waveformData}
        abLoop={abLoop}
        setAbLoop={setAbLoop}
        shuffle={shuffle}
        repeatMode={repeatMode}
        toggleShuffle={toggleShuffle}
        cycleRepeat={cycleRepeat}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeedState}
        crossfadeSeconds={crossfadeSeconds}
        sleepTimer={sleepTimer}
        showSleepPopover={showSleepPopover}
        setShowSleepPopover={setShowSleepPopover}
        setSleepTimerMinutes={setSleepTimerMinutes}
        cancelSleepTimer={cancelSleepTimer}
        showLyrics={showLyrics}
        setShowLyrics={setShowLyrics}
        volume={volume}
        setVolume={setVolume}
        togglePlayPause={togglePlayPause}
        toggleMute={toggleMute}
        handleSkipForward={handleSkipForward}
        handleSkipBack={handleSkipBack}
        handleDownload={handleDownload}
        downloadingTracks={downloadingTracks}
        isTrackLiked={isTrackLiked}
        toggleLikeTrack={toggleLikeTrack}
        openCtx={openCtx}
        setInfoModalTrack={setInfoModalTrack}
        progressRef={progressRef}
        volumeRef={volumeRef}
        isDraggingProgress={isDraggingProgress}
        setIsDraggingProgress={setIsDraggingProgress}
        isDraggingProgressRef={isDraggingProgressRef}
        isDraggingVolume={isDraggingVolume}
        setIsDraggingVolume={setIsDraggingVolume}
        updateProgressFromEvent={updateProgressFromEvent}
        updateVolumeFromEvent={updateVolumeFromEvent}
        calculateProgressPercent={calculateProgressPercent}
        queue={queue}
        playlistContextRef={playlistContextRef}
        progressSecondsRef={progressSecondsRef}
        abLoopRef={abLoopRef}
        trackDurationRef={trackDurationRef}
        showToast={showToast}
        onArtistClick={openArtistPage}
      />

      {/* 5. Context Menu & Shared Modals */}
      <ContextMenu
        ctxMenu={ctxMenu}
        setCtxMenu={setCtxMenu}
        playlists={playlists}
        setPlaylists={setPlaylists}
        setQueue={setQueue}
        playNext={playNext}
        addToQueue={addToQueue}
        handlePlayTrack={handlePlayTrack}
        handlePlayLocalTrack={handlePlayLocalTrack}
        handleDownload={handleDownload}
        handleCancelDownload={handleCancelDownload}
        handleDeleteLocalTrack={handleDeleteLocalTrack}
        handleOpenInFileManager={handleOpenInFileManager}
        handleExportPlaylistM3u={handleExportPlaylistM3u}
        downloadingTracks={downloadingTracks}
        isTrackLiked={isTrackLiked}
        toggleLikeTrack={toggleLikeTrack}
        setRenamingPlaylist={setRenamingPlaylist}
        setRenameVal={setRenameVal}
        setRenameDescVal={setRenameDescVal}
        setPlaylistDeleteModal={setPlaylistDeleteModal}
        setShowDuplicatesPlaylist={setShowDuplicatesPlaylist}
        setBulkEditPlaylist={setBulkEditPlaylist}
        handlePlaylistCoverUpload={handlePlaylistCoverUpload}
        setInfoModalTrack={setInfoModalTrack}
        infoModalTrack={infoModalTrack}
        addToPlaylistTrack={addToPlaylistTrack}
        setAddToPlaylistTrack={setAddToPlaylistTrack}
        setMetadataEditingTrack={setMetadataEditingTrack}
        showToast={showToast}
      />

      {/* 6. Fullscreen Lyrics View */}
      <Suspense fallback={null}>
        <LyricsView
          showLyrics={showLyrics}
          setShowLyrics={setShowLyrics}
          currentTrack={currentTrack}
          getTrackCover={getTrackCover}
          progressSeconds={progressSeconds}
          trackDurationSeconds={trackDurationSeconds}
          shuffle={shuffle}
          toggleShuffle={toggleShuffle}
          handleSkipBack={handleSkipBack}
          togglePlayPause={togglePlayPause}
          isLoadingTrack={isLoadingTrack}
          isPlaying={isPlaying}
          handleSkipForward={handleSkipForward}
          repeatMode={repeatMode}
          cycleRepeat={cycleRepeat}
          volume={volume}
          setVolume={setVolume}
          toggleMute={toggleMute}
          lyricsLoading={lyricsLoading}
          lyricsData={lyricsData}
          lyricsScrollContainerRef={lyricsScrollContainerRef}
          onArtistClick={openArtistPage}
        />
      </Suspense>

      {/* 7. Dialogs and Overlays */}
      {/* Create Playlist Modal */}
      {isPlaylistModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 16px 100px 16px',
            background: 'rgba(var(--v-bg0-rgb), 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          onClick={() => setIsPlaylistModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--v-bg2)',
              border: '1px solid var(--v-bdr2)',
              borderRadius: '20px',
              padding: '22px 20px 18px',
              width: '340px',
              boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--v-fg)', margin: 0, letterSpacing: '-0.01em' }}>Create Playlist</h3>
              <button
                onClick={() => setIsPlaylistModalOpen(false)}
                style={{
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  background: 'var(--v-bg3)',
                  border: '1px solid var(--v-bdr2)',
                  cursor: 'pointer',
                  color: 'var(--v-fg2)',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--v-fg)'; e.currentTarget.style.borderColor = 'var(--v-bdr3)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--v-fg2)'; e.currentTarget.style.borderColor = 'var(--v-bdr2)'; }}
              >
                <X size={11} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
              <div>
                <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--v-fg3)', display: 'block', marginBottom: '6px' }}>Name</label>
                <input
                  autoFocus
                  type="text"
                  value={newPlaylistName}
                  onChange={e => setNewPlaylistName(e.target.value)}
                  placeholder="e.g. Cyberpunk Mix"
                  style={{
                    width: '100%',
                    background: 'var(--v-bg3)',
                    border: '1px solid var(--v-bdr2)',
                    color: 'var(--v-fg)',
                    borderRadius: '10px',
                    padding: '9px 14px',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color .15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--v-accent)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--v-bdr2)'; }}
                  onKeyDown={e => e.key === 'Enter' && confirmCreatePlaylist()}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--v-fg3)', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                  <AlignLeft size={9} /> Description <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--v-fg4)' }}>optional</span>
                </label>
                <textarea
                  value={newPlaylistDesc}
                  onChange={e => setNewPlaylistDesc(e.target.value)}
                  placeholder="What's this playlist about?"
                  rows={2}
                  style={{
                    width: '100%',
                    background: 'var(--v-bg3)',
                    border: '1px solid var(--v-bdr2)',
                    color: 'var(--v-fg)',
                    borderRadius: '10px',
                    padding: '9px 14px',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color .15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--v-accent)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--v-bdr2)'; }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setIsPlaylistModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  border: '1px solid var(--v-bdr2)',
                  color: 'var(--v-fg2)',
                  background: 'var(--v-bg3)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--v-fg)'; e.currentTarget.style.borderColor = 'var(--v-bdr3)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--v-fg2)'; e.currentTarget.style.borderColor = 'var(--v-bdr2)'; }}
              >
                Cancel
              </button>
              <button
                onClick={confirmCreatePlaylist}
                disabled={!newPlaylistName.trim()}
                style={{
                  padding: '8px 20px',
                  borderRadius: '9999px',
                  border: 'none',
                  background: 'var(--v-accent)',
                  color: 'var(--v-bg0)',
                  fontWeight: 700,
                  cursor: newPlaylistName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '12px',
                  opacity: newPlaylistName.trim() ? 1 : 0.4,
                  transition: 'opacity .15s',
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Playlist Modal */}
      {renamingPlaylist && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 16px 100px 16px',
            background: 'rgba(var(--v-bg0-rgb), 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          onClick={() => setRenamingPlaylist(null)}
        >
          <div
            style={{
              background: 'var(--v-bg2)',
              border: '1px solid var(--v-bdr2)',
              borderRadius: '20px',
              padding: '22px 20px 18px',
              width: '340px',
              boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--v-fg)', margin: 0, letterSpacing: '-0.01em' }}>Edit Playlist</h3>
              <button
                onClick={() => setRenamingPlaylist(null)}
                style={{
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  background: 'var(--v-bg3)',
                  border: '1px solid var(--v-bdr2)',
                  cursor: 'pointer',
                  color: 'var(--v-fg2)',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--v-fg)'; e.currentTarget.style.borderColor = 'var(--v-bdr3)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--v-fg2)'; e.currentTarget.style.borderColor = 'var(--v-bdr2)'; }}
              >
                <X size={11} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
              <div>
                <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--v-fg3)', display: 'block', marginBottom: '6px' }}>Name</label>
                <input
                  autoFocus
                  type="text"
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--v-bg3)',
                    border: '1px solid var(--v-bdr2)',
                    color: 'var(--v-fg)',
                    borderRadius: '10px',
                    padding: '9px 14px',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color .15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--v-accent)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--v-bdr2)'; }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmRenamePlaylist();
                    if (e.key === 'Escape') setRenamingPlaylist(null);
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--v-fg3)', display: 'block', marginBottom: '6px' }}>
                  Description <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--v-fg4)' }}>optional</span>
                </label>
                <textarea
                  value={renameDescVal}
                  onChange={e => setRenameDescVal(e.target.value)}
                  rows={2}
                  placeholder="e.g. Chill vibes, road trip..."
                  style={{
                    width: '100%',
                    background: 'var(--v-bg3)',
                    border: '1px solid var(--v-bdr2)',
                    color: 'var(--v-fg)',
                    borderRadius: '10px',
                    padding: '9px 14px',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color .15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--v-accent)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--v-bdr2)'; }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setRenamingPlaylist(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  border: '1px solid var(--v-bdr2)',
                  color: 'var(--v-fg2)',
                  background: 'var(--v-bg3)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--v-fg)'; e.currentTarget.style.borderColor = 'var(--v-bdr3)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--v-fg2)'; e.currentTarget.style.borderColor = 'var(--v-bdr2)'; }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRenamePlaylist}
                style={{
                  padding: '8px 20px',
                  borderRadius: '9999px',
                  border: 'none',
                  background: 'var(--v-accent)',
                  color: 'var(--v-bg0)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(var(--v-bg0-rgb),0.88)' }}
          onClick={() => setShowShortcuts(false)}
        >
          <div
            style={{ background: 'var(--v-bg2)', border: '1px solid var(--v-bdr2)', borderRadius: '14px', width: '500px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.85)' }}
            className="custom-scrollbar"
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--v-bdr2)' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--v-fg)', margin: 0 }}>Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--v-fg3)', display: 'flex', padding: '3px', borderRadius: '5px' }}>
                <X size={15} />
              </button>
            </div>
            <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '4px' }}>
              {([
                ['Playback', null],
                ['Space', 'Play / Pause'],
                ['←', 'Seek back 10s'],
                ['→', 'Seek forward 10s'],
                ['M', 'Mute / Unmute'],
                ['Navigation', null],
                ['Ctrl+1', 'Home View'],
                ['Ctrl+2', 'Artists Hub'],
                ['Ctrl+3', 'Offline Library'],
                ['Ctrl+4', 'Listening Stats'],
                ['Ctrl+5', 'Playback History'],
                ['Ctrl+6', 'Settings Panel'],
                ['Ctrl+7', 'Toggle Play Queue'],
                ['Ctrl+8 / Ctrl+P', 'Playlists Menu'],
                ['Alt+←', 'Back Navigation'],
                ['Shift+1..9', 'Open Playlist 1..9'],
                ['Ctrl+F', 'Focus Search'],
                ['Interface & Zoom', null],
                ['Ctrl + +', 'Increase UI Scale (+5%)'],
                ['Ctrl + -', 'Decrease UI Scale (-5%)'],
                ['Ctrl + 0', 'Reset UI Scale (100%)'],
                ['General', null],
                ['?', 'Show this overlay'],
                ['Esc', 'Close any overlay'],
              ] as [string, string | null][]).map(([key, action], i) =>
                action === null ? (
                  <div key={i} style={{ gridColumn: '1/-1', marginTop: '10px', marginBottom: '4px', fontSize: '9.5px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--v-fg3)' }}>
                    {key}
                  </div>
                ) : (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--v-bdr2)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--v-fg2)' }}>{action}</span>
                    <kbd style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, background: 'var(--v-bg3)', border: '1px solid var(--v-bdr2)', color: 'var(--v-fg)', marginLeft: '12px', flexShrink: 0, fontFamily: 'monospace' }}>
                      {key}
                    </kbd>
                  </div>
                )
              )}
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--v-bdr2)', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: 'var(--v-fg3)' }}>
                Press <kbd style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9.5px', background: 'var(--v-bg3)', border: '1px solid var(--v-bdr2)', color: 'var(--v-fg)', fontFamily: 'monospace' }}>?</kbd> or <kbd style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9.5px', background: 'var(--v-bg3)', border: '1px solid var(--v-bdr2)', color: 'var(--v-fg)', fontFamily: 'monospace' }}>Esc</kbd> to close
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(var(--v-bg0-rgb),0.88)' }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            style={{ background: 'var(--v-bg2)', border: '1px solid var(--v-bdr2)', borderRadius: '12px', width: '320px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.85)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--v-bdr2)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--v-fg)', margin: 0 }}>Confirm</h3>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <p style={{ fontSize: '13px', color: 'var(--v-fg2)', lineHeight: 1.5, margin: 0 }}>{confirmModal.message}</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '10px 18px', borderTop: '1px solid var(--v-bdr2)' }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--v-bdr2)', color: 'var(--v-fg2)', background: 'var(--v-bg3)', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                style={{ padding: '7px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Playlist Delete Modal */}
      {playlistDeleteModal && (
        <PlaylistDeleteConfirmModal
          isOpen={!!playlistDeleteModal}
          modalData={playlistDeleteModal}
          onClose={() => setPlaylistDeleteModal(null)}
          onConfirmDelete={confirmDeletePlaylist}
        />
      )}

      {/* Metadata Edit Modal */}
      {metadataEditingTrack && (
        <MetadataEditModal
          track={metadataEditingTrack}
          onSave={handleSaveMetadata}
          onClose={() => setMetadataEditingTrack(null)}
        />
      )}

      {/* YouTube Import Modal */}
      {(showYtImportModal || bgYtImport) && (
        <YtImportModal
          visible={showYtImportModal}
          onClose={() => setShowYtImportModal(false)}
          onProgress={progress => setBgYtImport(progress !== null ? { progress } : null)}
          onAbort={() => {
            setBgYtImport(null);
            setShowYtImportModal(false);
            showToast('YouTube import cancelled');
          }}
          onSavePlaylist={(name, desc, importedTracks) => {
            const id = `yt_${Date.now()}`;
            setPlaylists(prev => [...prev, { id, name, description: desc || 'Imported from YouTube', tracks: importedTracks }]);
            showToast(`"${name}" saved (${importedTracks.length} tracks)`);
            setBgYtImport(null);
          }}
          showToast={showToast}
        />
      )}

      {/* Spotify CSV Import Modal */}
      {(showCsvImportModal || isSpotifyImporting || bgImport || droppedCsvBatch) && (
        <CsvImportModal
          visible={showCsvImportModal}
          droppedBatch={droppedCsvBatch}
          onStartImport={(info) => {
            setIsSpotifyImporting(true);
            isSpotifyImportActiveRef.current = true;
            setBgImport(info);
          }}
          onFinishImport={() => {
            setIsSpotifyImporting(false);
            setBgImport(null);
          }}
          onClose={() => {
            setShowCsvImportModal(false);
            setDroppedCsvBatch(null);
          }}
          registerAbort={(fn) => { spotifyAbortRef.current = fn; }}
          onAbort={cancelSpotifyImport}
          onSavePlaylist={(name, desc, importedTracks) => {
            const cleanName = name.trim();
            setPlaylists(prev => {
              const existingIndex = prev.findIndex(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());
              if (existingIndex !== -1) {
                return prev.map((p, idx) => idx === existingIndex ? { ...p, tracks: importedTracks, description: desc || p.description } : p);
              }
              const id = `csv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              return [...prev, { id, name: cleanName, description: desc || 'Imported from Spotify', tracks: importedTracks }];
            });
            showToast(`"${cleanName}" saved (${importedTracks.length} tracks)`);
            setPendingSpotifyImport(null);
          }}
          showToast={showToast}
          onProgress={(p) => {
            if (!isSpotifyImportActiveRef.current && p !== null) return;
            setBgImport(p);
          }}
        />
      )}

      {/* Import Result Modal */}
      {pendingSpotifyImport && !showCsvImportModal && (
        <ImportResultModal
          matchedCount={pendingSpotifyImport.matchedCount}
          failedCount={pendingSpotifyImport.failedCount}
          onSave={(name, desc) => {
            const id = `csv_${Date.now()}`;
            setPlaylists(prev => [...prev, { id, name, description: desc || 'Imported from Spotify', tracks: pendingSpotifyImport.tracks }]);
            showToast(`"${name}" saved (${pendingSpotifyImport.tracks.length} tracks)`);
            setBgImport(null);
            setPendingSpotifyImport(null);
          }}
          onClose={() => {
            setPendingSpotifyImport(null);
            setBgImport(null);
          }}
        />
      )}

      {/* Duplicate Finder Modal */}
      {showDuplicatesPlaylist && (() => {
        const duplicatesWithIndex = findDuplicateTracks(showDuplicatesPlaylist.tracks);

        const handleRemoveSingle = (indexToRemove: number) => {
          setPlaylists(prev => prev.map(p => {
            if (p.id !== showDuplicatesPlaylist.id) return p;
            return {
              ...p,
              tracks: p.tracks.filter((_, idx) => idx !== indexToRemove)
            };
          }));
          setShowDuplicatesPlaylist(prev => {
            if (!prev) return null;
            return {
              ...prev,
              tracks: prev.tracks.filter((_, idx) => idx !== indexToRemove)
            };
          });
          showToast('Duplicate track removed');
        };

        const handleRemoveAll = () => {
          const dupeIndices = new Set(duplicatesWithIndex.map(d => d.originalIndex));
          const cleanedTracks = showDuplicatesPlaylist.tracks.filter((_, idx) => !dupeIndices.has(idx));
          const removedCount = duplicatesWithIndex.length;

          setPlaylists(prev => prev.map(p => {
            if (p.id !== showDuplicatesPlaylist.id) return p;
            return { ...p, tracks: cleanedTracks };
          }));
          setShowDuplicatesPlaylist(prev => prev ? { ...prev, tracks: cleanedTracks } : null);
          showToast(`Removed ${removedCount} duplicate track${removedCount > 1 ? 's' : ''}`);
        };

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 16px 100px 16px',
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)'
            }}
            onClick={() => setShowDuplicatesPlaylist(null)}
          >
            <div
              style={{
                background: 'var(--v-bg2)',
                border: '1px solid var(--v-bdr2)',
                borderRadius: '18px',
                width: '100%',
                maxWidth: '520px',
                maxHeight: 'calc(100vh - 130px)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 32px 80px rgba(0,0,0,0.85)'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--v-bdr2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--v-fg)', margin: 0, letterSpacing: '-0.01em' }}>Duplicate Finder</h3>
                  <p style={{ fontSize: '11.5px', color: 'var(--v-fg3)', margin: '3px 0 0' }}>Playlist: <span style={{ color: 'var(--v-fg2)', fontWeight: 600 }}>{showDuplicatesPlaylist.name}</span></p>
                </div>
                <button
                  onClick={() => setShowDuplicatesPlaylist(null)}
                  style={{
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    background: 'var(--v-bg3)',
                    border: '1px solid var(--v-bdr)',
                    cursor: 'pointer',
                    color: 'var(--v-fg3)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--v-fg)';
                    e.currentTarget.style.borderColor = 'var(--v-bdr2)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--v-fg3)';
                    e.currentTarget.style.borderColor = 'var(--v-bdr)';
                  }}
                >
                  <X size={13} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }} className="custom-scrollbar">
                {duplicatesWithIndex.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 0', gap: '8px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--v-bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                      <CheckCircle size={24} style={{ color: 'var(--v-accent)' }} />
                    </div>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--v-fg)', margin: 0 }}>No duplicates found</p>
                    <p style={{ fontSize: '12px', color: 'var(--v-fg3)', margin: 0 }}>All tracks in this playlist are unique.</p>
                    <button
                      onClick={() => setShowDuplicatesPlaylist(null)}
                      style={{
                        marginTop: '12px',
                        padding: '7px 20px',
                        borderRadius: '9999px',
                        background: 'var(--v-bg3)',
                        border: '1px solid var(--v-bdr2)',
                        color: 'var(--v-fg)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--v-fg3)', fontWeight: 600 }}>
                        {duplicatesWithIndex.length} duplicate track{duplicatesWithIndex.length > 1 ? 's' : ''} found
                      </span>
                      {duplicatesWithIndex.length > 1 && (
                        <button
                          onClick={handleRemoveAll}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color: 'var(--v-accent)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            transition: 'opacity 0.15s ease'
                          }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                        >
                          <Trash2 size={12} /> Remove All ({duplicatesWithIndex.length})
                        </button>
                      )}
                    </div>

                    {duplicatesWithIndex.map(({ track: t, originalIndex }) => (
                      <div
                        key={originalIndex}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          background: 'var(--v-bg3)',
                          border: '1px solid var(--v-bdr)',
                          transition: 'border-color 0.15s ease'
                        }}
                      >
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            flexShrink: 0,
                            border: '1px solid var(--v-bdr2)',
                            position: 'relative',
                            background: getTrackGradient(t.title, t.artist),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Music size={14} style={{ position: 'absolute', color: 'rgba(255,255,255,0.25)' }} />
                          {getTrackCover(t) && (
                            <img
                              src={getTrackCover(t)}
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => { e.currentTarget.style.display = 'none'; }}
                              alt=""
                            />
                          )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--v-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.title}
                          </div>
                          {t.artist && (
                            <div style={{ fontSize: '11.5px', color: 'var(--v-fg3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                              {t.artist}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleRemoveSingle(originalIndex)}
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            padding: '6px 14px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.22)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.45)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.22)';
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk Tag Editor Modal */}
      {bulkEditPlaylist && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
          <div style={{ background: 'var(--v-bg2)', border: '1px solid var(--v-bdr2)', borderRadius: '20px', width: '100%', maxWidth: 'min(680px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.85)' }}>
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--v-bdr2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--v-fg)', margin: 0, letterSpacing: '-0.01em' }}>Bulk Tag Editor</h3>
                <p style={{ fontSize: '11px', color: 'var(--v-fg3)', margin: '3px 0 0' }}>{bulkEditPlaylist.tracks.length} tracks in <span style={{ color: 'var(--v-fg2)', fontWeight: 600 }}>{bulkEditPlaylist.name}</span></p>
              </div>
              <button
                onClick={() => setBulkEditPlaylist(null)}
                style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'var(--v-bg3)', border: '1px solid var(--v-bdr)', cursor: 'pointer', color: 'var(--v-fg3)', transition: 'all 0.15s ease' }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--v-fg)';
                  e.currentTarget.style.borderColor = 'var(--v-bdr2)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--v-fg3)';
                  e.currentTarget.style.borderColor = 'var(--v-bdr)';
                }}
              >
                <X size={12} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }} className="custom-scrollbar">
              <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr', padding: '6px 8px', marginBottom: '2px' }}>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--v-fg3)', letterSpacing: '.12em', textTransform: 'uppercase' }}>#</span>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--v-fg3)', letterSpacing: '.12em', textTransform: 'uppercase' }}>Title</span>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--v-fg3)', letterSpacing: '.12em', textTransform: 'uppercase' }}>Artist</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {bulkEditPlaylist.tracks.map((t, i) => (
                  <div key={t.url} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr', alignItems: 'center', padding: '4px 8px', borderRadius: '10px', background: 'var(--v-bg3)', border: '1px solid var(--v-bdr)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--v-fg3)', fontVariantNumeric: 'tabular-nums', paddingLeft: '4px' }}>{i + 1}</span>
                    <input
                      defaultValue={t.title}
                      onBlur={e => {
                        const newTitle = e.target.value.trim();
                        if (newTitle && newTitle !== t.title) {
                          setPlaylists(prev => prev.map(p => p.id === bulkEditPlaylist.id
                            ? { ...p, tracks: p.tracks.map(x => x.url === t.url ? { ...x, title: newTitle } : x) }
                            : p));
                          setBulkEditPlaylist(prev => prev ? { ...prev, tracks: prev.tracks.map(x => x.url === t.url ? { ...x, title: newTitle } : x) } : null);
                        }
                      }}
                      style={{ width: '100%', background: 'transparent', color: 'var(--v-fg)', fontSize: '12.5px', fontWeight: 500, padding: '5px 8px', borderRadius: '7px', border: '1px solid transparent', outline: 'none' }}
                      onFocus={e => {
                        e.currentTarget.style.borderColor = 'var(--v-accent)';
                        e.currentTarget.style.background = 'var(--v-bg2)';
                      }}
                      onBlurCapture={e => {
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    />
                    <input
                      defaultValue={t.artist}
                      onBlur={e => {
                        const newArtist = e.target.value.trim();
                        if (newArtist !== t.artist) {
                          setPlaylists(prev => prev.map(p => p.id === bulkEditPlaylist.id
                            ? { ...p, tracks: p.tracks.map(x => x.url === t.url ? { ...x, artist: newArtist } : x) }
                            : p));
                          setBulkEditPlaylist(prev => prev ? { ...prev, tracks: prev.tracks.map(x => x.url === t.url ? { ...x, artist: newArtist } : x) } : null);
                        }
                      }}
                      style={{ width: '100%', background: 'transparent', color: 'var(--v-fg2)', fontSize: '12px', padding: '5px 8px', borderRadius: '7px', border: '1px solid transparent', outline: 'none' }}
                      onFocus={e => {
                        e.currentTarget.style.borderColor = 'var(--v-accent)';
                        e.currentTarget.style.background = 'var(--v-bg2)';
                      }}
                      onBlurCapture={e => {
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.background = 'transparent';
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--v-bdr2)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button
                onClick={() => { showToast('Tags saved'); setBulkEditPlaylist(null); }}
                style={{ padding: '9px 22px', background: 'var(--v-accent)', color: '#000000', fontWeight: 700, borderRadius: '9999px', border: 'none', cursor: 'pointer', fontSize: '12.5px', transition: 'all 0.15s ease' }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                Save &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Spotify Background Import Pill */}
      {bgImport && !showCsvImportModal && !pendingSpotifyImport && (
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowCsvImportModal(true);
          }}
          style={{
            position: 'fixed',
            bottom: '92px',
            right: '20px',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '9999px',
            border: '1px solid rgba(29, 185, 84, 0.25)',
            background: 'rgba(18, 16, 16, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1db954">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2ddd9', whiteSpace: 'nowrap' }}>
            {bgImport.totalFiles > 1
              ? `Importing playlists in progress... (${bgImport.currentFile} of ${bgImport.totalFiles})`
              : 'Importing playlist in progress...'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }} onClick={e => { e.preventDefault(); e.stopPropagation(); }}>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowCsvImportModal(true);
              }}
              title="Expand import modal"
              style={{
                color: '#8a807c',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                borderRadius: '6px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#8a807c'; e.currentTarget.style.background = 'transparent'; }}
            >
              <Maximize2 size={13} />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                cancelSpotifyImport();
              }}
              title="Cancel import"
              style={{
                color: '#8a807c',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                borderRadius: '6px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ff6060'; e.currentTarget.style.background = 'rgba(255,96,96,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#8a807c'; e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Floating YouTube Background Import Pill */}
      {bgYtImport && !showYtImportModal && (
        <div
          onClick={() => setShowYtImportModal(true)}
          style={{
            position: 'fixed', bottom: bgImport ? '156px' : '84px', right: '16px', zIndex: 9998, display: 'flex', alignItems: 'center',
            gap: '12px', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255, 30, 39, 0.15)', background: 'rgba(22, 20, 20, 0.95)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.7)', cursor: 'pointer'
          }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#ff1e27">
              <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.507a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.507 9.388.507 9.388.507s7.517 0 9.388-.507a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '150px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#e2ddd9' }}>Importing YouTube...</span>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#ff1e27', fontVariantNumeric: 'tabular-nums' }}>{Math.round(bgYtImport.progress)}%</span>
            </div>
            <div style={{ height: '3px', borderRadius: '1.5px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '1.5px', background: 'linear-gradient(90deg, #ff1e27 0%, #ff4b55 100%)', width: `${bgYtImport.progress}%` }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowYtImportModal(true)} style={{ color: '#8a807c', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Maximize2 size={11} />
            </button>
            <button onClick={() => { setBgYtImport(null); setShowYtImportModal(false); showToast('YouTube import cancelled'); }} style={{ color: '#8a807c', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Onboarding & Taste Personalization Modal */}
      <Suspense fallback={null}>
        <OnboardingModal
          isOpen={showOnboardingModal}
          initialPreferences={userPreferences}
          onComplete={handleCompleteOnboarding}
          onClose={handleCloseOnboarding}
        />
      </Suspense>

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '96px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: '#181615',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          color: '#ffffff',
          fontSize: '13px',
          fontWeight: 600,
          padding: '9px 18px',
          borderRadius: '9999px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.85), 0 2px 8px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
          animation: 'toastIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          letterSpacing: '-0.01em',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
