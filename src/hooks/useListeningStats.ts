import { useState, useEffect, useRef, useCallback } from 'react';
import { Track, ListeningEvent, HistoryItem } from '../types';
import { loadLS, saveLS } from '../utils';
import { dbRecordPlayEvent, dbUpdateListeningTime, dbClearListeningStats } from '../services/db';

export function useListeningStats() {
  const [playCounts, setPlayCounts] = useState<Record<string, number>>(() => loadLS('vg_playCounts', {}));
  const [listenSecs, setListenSecs] = useState<Record<string, number>>(() => loadLS('vg_listenSecs', {}));
  const [firstSeen, setFirstSeen] = useState<Record<string, string>>(() => loadLS('vg_firstSeen', {}));
  const [dailyPlays, setDailyPlays] = useState<Record<string, number>>(() => loadLS('vg_dailyPlays', {}));
  const [listeningHistory, setListeningHistory] = useState<ListeningEvent[]>(() => loadLS('vg_listeningHistory', []));
  const [playHistory, setPlayHistory] = useState<Track[]>(() => loadLS('vg_playHistory', []));
  const [playbackHistory, setPlaybackHistory] = useState<HistoryItem[]>(() => {
    const saved = loadLS<HistoryItem[]>('vg_playbackHistory', []);
    if (saved && Array.isArray(saved) && saved.length > 0) {
      const seen = new Set<string>();
      const deduped: HistoryItem[] = [];
      for (const item of saved) {
        if (!item || !item.track || !item.track.url) continue;
        const key = item.track.url.trim();
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }
      return deduped;
    }
    const legacyPlays = loadLS<Track[]>('vg_playHistory', []);
    if (legacyPlays && Array.isArray(legacyPlays) && legacyPlays.length > 0) {
      const seen = new Set<string>();
      const result: HistoryItem[] = [];
      for (let i = 0; i < legacyPlays.length; i++) {
        const t = legacyPlays[i];
        if (!t || !t.url) continue;
        const key = t.url.trim();
        if (!seen.has(key)) {
          seen.add(key);
          result.push({
            id: `hist-${t.url}-${Date.now() - i * 60000}`,
            track: t,
            playedAt: new Date(Date.now() - i * 60000).toISOString()
          });
        }
      }
      return result;
    }
    return [];
  });
  const [statsTimeRange, setStatsTimeRange] = useState<'7days' | 'all'>(() => loadLS('vg_statsTimeRange', 'all'));

  useEffect(() => {
    saveLS('vg_statsTimeRange', statsTimeRange);
  }, [statsTimeRange]);

  const listenSecsRef = useRef(listenSecs);
  useEffect(() => {
    listenSecsRef.current = listenSecs;
    saveLS('vg_listenSecs', listenSecs);
  }, [listenSecs]);

  useEffect(() => {
    saveLS('vg_listeningHistory', listeningHistory);
  }, [listeningHistory]);

  useEffect(() => {
    saveLS('vg_playHistory', playHistory);
  }, [playHistory]);

  useEffect(() => {
    saveLS('vg_playbackHistory', playbackHistory);
  }, [playbackHistory]);

  const pendingSecsRef = useRef<{ url: string; secs: number }>({ url: '', secs: 0 });

  const flushPendingListening = useCallback(() => {
    const { url, secs } = pendingSecsRef.current;
    if (!url || secs <= 0) return;
    pendingSecsRef.current = { url: '', secs: 0 };

    setListenSecs(prev => {
      const next = { ...prev, [url]: (prev[url] || 0) + secs };
      listenSecsRef.current = next;
      return next;
    });

    setListeningHistory(prev => {
      if (prev.length === 0) return prev;
      const idx = prev.findIndex(item => item && item.url === url);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], secs: next[idx].secs + secs };
      return next;
    });

    dbUpdateListeningTime(url, secs);
  }, []);

  useEffect(() => {
    return () => {
      flushPendingListening();
    };
  }, [flushPendingListening]);

  const recordTrackPlay = useCallback((track: Track, fromQueue: boolean = false) => {
    flushPendingListening();

    setPlayCounts(prev => {
      const n = { ...prev, [track.url]: (prev[track.url] || 0) + 1 };
      saveLS('vg_playCounts', n);
      return n;
    });

    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setDailyPlays(prev => {
      const n = { ...prev, [today]: (prev[today] || 0) + 1 };
      saveLS('vg_dailyPlays', n);
      return n;
    });

    setFirstSeen(prev => {
      if (prev[track.url]) return prev;
      const n = { ...prev, [track.url]: new Date().toISOString() };
      saveLS('vg_firstSeen', n);
      return n;
    });

    setListeningHistory(prev => [{ url: track.url, playedAt: new Date().toISOString(), secs: 0 }, ...prev].slice(0, 300));
    dbRecordPlayEvent(track, 0);

    const histEntry: HistoryItem = {
      id: `${track.url}-${Date.now()}`,
      track,
      playedAt: new Date().toISOString()
    };
    setPlaybackHistory(prev => {
      const filtered = prev.filter(item => item && item.track && item.track.url !== track.url);
      const next = [histEntry, ...filtered].slice(0, 200);
      saveLS('vg_playbackHistory', next);
      return next;
    });

    if (!fromQueue) {
      setPlayHistory(prev => [track, ...prev.filter(t => t.url !== track.url)].slice(0, 50));
    }
  }, [flushPendingListening]);

  const recordListeningStep = useCallback((url: string, step: number) => {
    if (!url || step <= 0) return;
    if (pendingSecsRef.current.url && pendingSecsRef.current.url !== url) {
      flushPendingListening();
    }
    pendingSecsRef.current.url = url;
    pendingSecsRef.current.secs += step;

    if (pendingSecsRef.current.secs >= 10) {
      flushPendingListening();
    }
  }, [flushPendingListening]);

  const clearPlaybackHistory = useCallback(() => {
    setPlaybackHistory([]);
    saveLS('vg_playbackHistory', []);
    setPlayHistory([]);
    saveLS('vg_playHistory', []);
  }, []);

  const removePlaybackHistoryItem = useCallback((idOrUrl: string) => {
    setPlaybackHistory(prev => {
      const next = prev.filter(item => item.id !== idOrUrl && item.track?.url !== idOrUrl);
      saveLS('vg_playbackHistory', next);
      return next;
    });
  }, []);

  const resetAllStats = useCallback(() => {
    setPlayCounts({});
    saveLS('vg_playCounts', {});
    setListenSecs({});
    saveLS('vg_listenSecs', {});
    setDailyPlays({});
    saveLS('vg_dailyPlays', {});
    setFirstSeen({});
    saveLS('vg_firstSeen', {});
    setListeningHistory([]);
    saveLS('vg_listeningHistory', []);
    setPlaybackHistory([]);
    saveLS('vg_playbackHistory', []);
    setPlayHistory([]);
    saveLS('vg_playHistory', []);
    dbClearListeningStats();
  }, []);

  const [artistThumbs, setArtistThumbs] = useState<Record<string, string>>(() => loadLS('vg_artistThumbs', {}));

  useEffect(() => {
    saveLS('vg_artistThumbs', artistThumbs);
  }, [artistThumbs]);

  return {
    playCounts,
    setPlayCounts,
    listenSecs,
    setListenSecs,
    listenSecsRef,
    firstSeen,
    setFirstSeen,
    dailyPlays,
    setDailyPlays,
    listeningHistory,
    setListeningHistory,
    playHistory,
    setPlayHistory,
    playbackHistory,
    setPlaybackHistory,
    clearPlaybackHistory,
    removePlaybackHistoryItem,
    statsTimeRange,
    setStatsTimeRange,
    artistThumbs,
    setArtistThumbs,
    recordTrackPlay,
    recordTrackPlayed: recordTrackPlay,
    recordListeningStep,
    resetAllStats,
  };
}
