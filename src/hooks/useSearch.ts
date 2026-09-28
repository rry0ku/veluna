import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { Track } from '../types';
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
    const cacheKey = q.toLowerCase();
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
      const isUrl = q.startsWith('http://') || q.startsWith('https://') || q.includes('youtube.com') || q.includes('youtu.be');
      const [resMusic, resVideo] = isUrl 
        ? await Promise.all([invoke<string>('search_youtube', { query: q }).catch(() => ''), Promise.resolve('')])
        : await Promise.all([
            invoke<string>('search_youtube', { query: `${q} music` }).catch(() => ''),
            invoke<string>('search_youtube', { query: `${q} video` }).catch(() => '')
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
            url: `https://youtube.com/watch?v=${id}`,
            cover: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
            mediaType
          };
        }).filter((t): t is Track => t !== null);
      };

      let parsedMusic = parseLines(resMusic, 'music');
      let parsedVideo = parseLines(resVideo, 'video');

      if (parsedMusic.length === 0 && parsedVideo.length === 0) {
        const resFallback = await invoke<string>('search_youtube', { query: q }).catch(() => '');
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
    } catch (err: any) {
      if (currentId !== searchIdRef.current) return;
      if (!hasInstantHit) {
        startTransition(() => {
          setYtMusicTracks([]);
          setVideoTracks([]);
          setIsSearching(false);
        });
        const msg = typeof err === 'string' ? err : (err?.message || 'Search failed');
        setSearchError(msg);
        if (showToast) showToast(`Search failed: ${msg}`);
      } else {
        setIsSearching(false);
      }
    }
  }, [searchQuery, showToast, cacheEnabled]);

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
    quickPicks,
    setQuickPicks,
    resetSearch,
    searchMusic,
    clearSearchHistory,
    removeSearchHistoryItem,
  };
}
