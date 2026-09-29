import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { Track, SearchSource, SearchDateFilter } from '../types';
import { loadLS, saveLS, parseTrackMeta } from '../utils';

export function useSearch(showToast?: (msg: string) => void, cacheEnabled: boolean = true) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>(() => loadLS('vg_searchHistory', []));
  const [showHistory, setShowHistory] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ytMusicTracks, setYtMusicTracks] = useState<Track[]>([]);
  const [videoTracks, setVideoTracks] = useState<Track[]>([]);
  const [searchTab, setSearchTab] = useState<'music' | 'video'>('music');
  const [searchSource, setSearchSource] = useState<SearchSource>('all');
  const [searchDateFilter, setSearchDateFilter] = useState<SearchDateFilter>('all');
  const [quickPicks, setQuickPicks] = useState<Track[]>(() => loadLS('vg_quickPicks', []));

  const searchCacheRef = useRef<Map<string, { music: Track[]; video: Track[] }>>(new Map());
  const searchIdRef = useRef(0);

  useEffect(() => {
    if (!cacheEnabled) {
      searchCacheRef.current.clear();
    }
  }, [cacheEnabled]);

  useEffect(() => {
    saveLS('vg_searchHistory', searchHistory);
  }, [searchHistory]);

  useEffect(() => {
    saveLS('vg_quickPicks', quickPicks);
  }, [quickPicks]);

  const resetSearch = useCallback(() => {
    searchIdRef.current++;
    setSearchQuery('');
    setYtMusicTracks([]);
    setVideoTracks([]);
    setIsSearching(false);
    setHasSearched(false);
    setSearchError(null);
    setSearchTab('music');
  }, []);

  const searchMusic = useCallback(async (override?: string) => {
    const q = (override ?? searchQuery).trim();
    if (!q) return;
    const currentId = ++searchIdRef.current;
    const cacheKey = `${q.toLowerCase()}_${searchSource}_${searchDateFilter}`;
    setShowHistory(false);
    setSearchHistory(prev => [q, ...prev.filter(h => h !== q)].slice(0, 8));

    const cached = cacheEnabled ? searchCacheRef.current.get(cacheKey) : undefined;
    let hasInstantHit = false;

    if (cached) {
      hasInstantHit = true;
      startTransition(() => {
        setHasSearched(true);
        setIsSearching(false);
        setSearchError(null);
        setYtMusicTracks(cached.music);
        setVideoTracks(cached.video);
      });
    } else {
      setIsSearching(true);
      setHasSearched(true);
      setSearchError(null);
      setYtMusicTracks([]);
      setVideoTracks([]);
    }

    try {
      const isSoundcloudUrl = q.includes('soundcloud.com');
      const isUrl = q.startsWith('http://') || q.startsWith('https://') || q.includes('youtube.com') || q.includes('youtu.be') || isSoundcloudUrl;

      if (searchSource === 'soundcloud' || isSoundcloudUrl) {
        const scRaw = await invoke<string>('search_soundcloud', { query: q }).catch(() => '');
        if (currentId !== searchIdRef.current) return;

        const parsedSc: Track[] = scRaw.trim().split('\n').filter(Boolean).map((line, i): Track | null => {
          const parts = line.split('====');
          const title = parts[0]?.trim() || 'Unknown Track';
          const artist = parts[1]?.trim() || 'SoundCloud';
          const duration = parts[2]?.trim() || '0:00';
          const trackUrl = parts[3]?.trim();
          const cover = parts[4]?.trim() || 'https://a-v2.sndcdn.com/assets/images/default/avatar-large-52a1ba2e.png';
          if (!trackUrl) return null;
          return {
            id: i,
            title,
            artist,
            duration,
            url: trackUrl,
            cover,
            mediaType: 'music'
          };
        }).filter((t): t is Track => t !== null);

        if (cacheEnabled) {
          if (searchCacheRef.current.size > 100) {
            const firstKey = searchCacheRef.current.keys().next().value;
            if (firstKey) searchCacheRef.current.delete(firstKey);
          }
          searchCacheRef.current.set(cacheKey, { music: parsedSc, video: [] });
        }

        if (currentId !== searchIdRef.current) return;

        startTransition(() => {
          setYtMusicTracks(parsedSc);
          setVideoTracks([]);
          setIsSearching(false);
          setSearchTab('music');
          if (parsedSc.length === 0) {
            setSearchError(`No tracks found on SoundCloud for "${q}".`);
          } else {
            setSearchError(null);
          }
        });
        return;
      }

      const dateArg = searchDateFilter === 'all' ? undefined : searchDateFilter;
      const [resMusic, resVideo] = isUrl 
        ? await Promise.all([invoke<string>('search_youtube', { query: q, dateFilter: dateArg }).catch(() => ''), Promise.resolve('')])
        : await Promise.all([
            invoke<string>('search_youtube', { query: `${q} music`, dateFilter: dateArg }).catch(() => ''),
            invoke<string>('search_youtube', { query: `${q} video`, dateFilter: dateArg }).catch(() => '')
          ]);

      if (currentId !== searchIdRef.current) return;

      const parseLines = (res: string, mediaType: 'music' | 'video'): Track[] => {
        return res.trim().split('\n').filter(Boolean).map((line, i): Track | null => {
          const parts = line.split('====');
          const meta = parseTrackMeta(parts[0], parts[1]);
          const duration = parts[2]?.trim() || '0:00';
          const id = parts[3]?.trim() || '';
          if (!id || id === 'NA') return null;
          return {
            id: i,
            title: meta.title || parts[0]?.trim() || 'Unknown Track',
            artist: meta.artist || 'YouTube',
            duration: duration || '0:00',
            url: id.startsWith('http') ? id : `https://youtube.com/watch?v=${id}`,
            cover: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
            mediaType
          };
        }).filter((t): t is Track => t !== null);
      };

      let parsedMusic = parseLines(resMusic, 'music');
      let parsedVideo = parseLines(resVideo, 'video');

      if (parsedMusic.length === 0 && parsedVideo.length === 0) {
        const resFallback = await invoke<string>('search_youtube', { query: q, dateFilter: dateArg }).catch(() => '');
        if (currentId !== searchIdRef.current) return;
        parsedMusic = parseLines(resFallback, 'music');
      }

      if (cacheEnabled) {
        if (searchCacheRef.current.size > 100) {
          const firstKey = searchCacheRef.current.keys().next().value;
          if (firstKey) searchCacheRef.current.delete(firstKey);
        }
        searchCacheRef.current.set(cacheKey, { music: parsedMusic, video: parsedVideo });
      }

      [...parsedMusic.slice(0, 8), ...parsedVideo.slice(0, 4)].forEach(t => {
        if (t.cover) {
          const img = new Image();
          img.src = t.cover;
        }
      });

      if (currentId !== searchIdRef.current) return;

      startTransition(() => {
        setYtMusicTracks(parsedMusic);
        setVideoTracks(parsedVideo);
        setIsSearching(false);

        if (parsedMusic.length === 0 && parsedVideo.length > 0) {
          setSearchTab('video');
        } else if (parsedMusic.length > 0) {
          setSearchTab('music');
        }

        if (parsedMusic.length === 0 && parsedVideo.length === 0) {
          setSearchError(`No tracks found for "${q}". Try another search term.`);
        } else {
          setSearchError(null);
        }
      });

      if (cacheEnabled) {
        [...parsedMusic.slice(0, 3), ...parsedVideo.slice(0, 2)].forEach(track => {
          if (track.url) invoke('prefetch_track', { url: track.url }).catch(() => {});
        });
      }
    } catch (err: unknown) {
      if (currentId !== searchIdRef.current) return;
      if (!hasInstantHit) {
        startTransition(() => {
          setYtMusicTracks([]);
          setVideoTracks([]);
          setIsSearching(false);
        });
        const msg = typeof err === 'string' ? err : (err instanceof Error ? err.message : 'Search failed');
        setSearchError(msg);
        if (showToast) showToast(`Search failed: ${msg}`);
      } else {
        setIsSearching(false);
      }
    }
  }, [searchQuery, searchSource, searchDateFilter, showToast, cacheEnabled]);

  const tracks = searchTab === 'music' ? ytMusicTracks : videoTracks;

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
    setShowHistory(false);
  }, []);

  const removeSearchHistoryItem = useCallback((item: string) => {
    setSearchHistory(prev => prev.filter(h => h !== item));
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    searchHistory,
    setSearchHistory,
    showHistory,
    setShowHistory,
    isSearching,
    hasSearched,
    searchError,
    ytMusicTracks,
    videoTracks,
    tracks,
    searchTab,
    setSearchTab,
    searchSource,
    setSearchSource,
    searchDateFilter,
    setSearchDateFilter,
    quickPicks,
    setQuickPicks,
    resetSearch,
    searchMusic,
    clearSearchHistory,
    removeSearchHistoryItem,
  };
}
