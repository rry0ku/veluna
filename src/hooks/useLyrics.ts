import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { Track } from '../types';
import { loadLS, saveLS } from '../utils';

export interface LyricLine {
  time: number;
  text: string;
  roma?: string;
}

export interface LyricsData {
  lines: LyricLine[];
  title: string;
  artist: string;
}

export function useLyrics(currentTrack: Track | null, trackDurationSeconds: number, progressSeconds: number) {
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsSource, setLyricsSourceState] = useState<string>(() => loadLS('vg_lyricsSource', 'lrclib'));

  const currentTrackRef = useRef(currentTrack);
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  const lyricsScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledLyricIdxRef = useRef<number>(-1);
  const lastFetchedKeyRef = useRef<string>('');
  const requestIdRef = useRef<number>(0);

  const setLyricsSource = useCallback((s: string) => {
    setLyricsSourceState(s);
    saveLS('vg_lyricsSource', s);
  }, []);

  const fetchLyrics = useCallback((force = false) => {
    if (!currentTrack) return;
    const title = currentTrack.title;
    const artist = currentTrack.artist;
    if (!title || !artist) return;

    const key = `${currentTrack.url}_${lyricsSource}`;
    if (!force && lastFetchedKeyRef.current === key) return;

    lastFetchedKeyRef.current = key;
    const currentReqId = ++requestIdRef.current;
    setLyricsLoading(true);
    setLyricsData(null);

    const activeUrl = currentTrack.url;
    invoke<string>('fetch_lyrics', {
      title,
      artist,
      album: '',
      duration: trackDurationSeconds || 0,
      source: lyricsSource,
    })
      .then(raw => {
        if (requestIdRef.current !== currentReqId) return;
        if (currentTrackRef.current?.url !== activeUrl) return;
        try {
          const lines: LyricLine[] = JSON.parse(raw);
          setLyricsData({ lines, title, artist });
        } catch {
          setLyricsData({ lines: [], title, artist });
        }
      })
      .catch(() => {
        if (requestIdRef.current !== currentReqId) return;
        if (currentTrackRef.current?.url === activeUrl) {
          setLyricsData({ lines: [], title, artist });
        }
      })
      .finally(() => {
        if (requestIdRef.current === currentReqId) {
          setLyricsLoading(false);
        }
      });
  // Depend on primitive fields, not the whole object — avoids refetch when track
  // re-renders with a new object reference but identical URL/title/artist.
  }, [currentTrack?.url, currentTrack?.title, currentTrack?.artist, trackDurationSeconds, lyricsSource]);

  useEffect(() => {
    if (showLyrics && currentTrack) {
      const key = `${currentTrack.url}_${lyricsSource}`;
      if (lastFetchedKeyRef.current !== key) {
        fetchLyrics(true);
      }
    }
  }, [showLyrics, currentTrack?.url, lyricsSource, fetchLyrics]);

  useEffect(() => {
    lastScrolledLyricIdxRef.current = -1;
    if (lyricsScrollContainerRef.current) {
      lyricsScrollContainerRef.current.removeAttribute('data-scrolled');
    }
  }, [currentTrack?.url, showLyrics]);

  const userScrolledUntilRef = useRef<number>(0);

  useEffect(() => {
    const el = lyricsScrollContainerRef.current;
    if (!el) return;
    const handleUserScroll = () => {
      userScrolledUntilRef.current = Date.now() + 4000;
    };
    el.addEventListener('wheel', handleUserScroll, { passive: true });
    el.addEventListener('touchmove', handleUserScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleUserScroll);
      el.removeEventListener('touchmove', handleUserScroll);
    };
  }, [showLyrics]);

  useEffect(() => {
    if (!showLyrics || !lyricsScrollContainerRef.current) return;
    const lines = lyricsData?.lines || [];
    if (lines.length === 0) return;
    let currentIdx = -1;
    if (lines[0].time <= progressSeconds) {
      currentIdx = lines.length - 1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].time > progressSeconds) {
          currentIdx = Math.max(0, i - 1);
          break;
        }
      }
    }
    const el = lyricsScrollContainerRef.current;
    if (currentIdx !== -1 && (currentIdx !== lastScrolledLyricIdxRef.current || !el.getAttribute('data-scrolled'))) {
      if (Date.now() < userScrolledUntilRef.current) {
        lastScrolledLyricIdxRef.current = currentIdx;
        return;
      }
      const active = el.querySelector('[data-active="true"]') as HTMLElement;
      if (active) {
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lastScrolledLyricIdxRef.current = currentIdx;
        el.setAttribute('data-scrolled', 'true');
      }
    }
  }, [showLyrics, progressSeconds, lyricsData]);

  useEffect(() => {
    if (!showLyrics) return;
    const onResize = () => {
      if (lyricsScrollContainerRef.current) {
        const active = lyricsScrollContainerRef.current.querySelector('[data-active="true"]') as HTMLElement;
        if (active) active.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [showLyrics]);

  return {
    showLyrics,
    setShowLyrics,
    lyricsData,
    setLyricsData,
    lyricsLoading,
    lyricsSource,
    setLyricsSource,
    lyricsScrollContainerRef,
    fetchLyrics,
  };
}
