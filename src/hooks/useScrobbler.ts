import { useState, useEffect, useRef, useCallback } from 'react';
import { Track } from '../types';
import { loadLS, saveLS } from '../utils';
import {
  submitLastFmNowPlaying,
  submitLastFmScrobble,
  DEFAULT_LASTFM_API_KEY,
  DEFAULT_LASTFM_API_SECRET,
} from '../services/scrobbler';

interface UseScrobblerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  progressSeconds: number;
  trackDurationSeconds: number;
  showToast?: (msg: string) => void;
}

export function useScrobbler({
  currentTrack,
  isPlaying,
  progressSeconds,
  trackDurationSeconds,
}: UseScrobblerProps) {
  const [lastfmEnabled, setLastfmEnabledState] = useState<boolean>(() =>
    loadLS('vg_lfm_enabled', false)
  );
  const [lastfmSessionKey, setLastfmSessionKeyState] = useState<string>(() =>
    loadLS('vg_lfm_session', '')
  );
  const [lastfmApiKey, setLastfmApiKeyState] = useState<string>(() =>
    loadLS('vg_lfm_apikey', DEFAULT_LASTFM_API_KEY)
  );
  const [lastfmApiSecret, setLastfmApiSecretState] = useState<string>(() =>
    loadLS('vg_lfm_secret', DEFAULT_LASTFM_API_SECRET)
  );
  const [lastfmUsername, setLastfmUsernameState] = useState<string>(() =>
    loadLS('vg_lfm_username', '')
  );

  const setLastfmEnabled = useCallback((v: boolean) => {
    setLastfmEnabledState(v);
    saveLS('vg_lfm_enabled', v);
  }, []);

  const setLastfmSessionKey = useCallback((k: string) => {
    setLastfmSessionKeyState(k);
    saveLS('vg_lfm_session', k);
  }, []);

  const setLastfmApiKey = useCallback((k: string) => {
    setLastfmApiKeyState(k);
    saveLS('vg_lfm_apikey', k);
  }, []);

  const setLastfmApiSecret = useCallback((s: string) => {
    setLastfmApiSecretState(s);
    saveLS('vg_lfm_secret', s);
  }, []);

  const setLastfmUsername = useCallback((u: string) => {
    setLastfmUsernameState(u);
    saveLS('vg_lfm_username', u);
  }, []);

  const hasSentNowPlayingRef = useRef<boolean>(false);
  const hasScrobbledRef = useRef<boolean>(false);
  const currentTrackUrlRef = useRef<string | null>(null);
  const trackStartTimeRef = useRef<number>(Math.floor(Date.now() / 1000));
  const previousProgressRef = useRef<number>(0);

  const accumulatedListeningRef = useRef<number>(0);
  const lastProgressTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const trackUrl = currentTrack?.url || null;
    if (trackUrl !== currentTrackUrlRef.current) {
      currentTrackUrlRef.current = trackUrl;
      hasSentNowPlayingRef.current = false;
      hasScrobbledRef.current = false;
      trackStartTimeRef.current = Math.floor(Date.now() / 1000);
      previousProgressRef.current = 0;
      accumulatedListeningRef.current = 0;
      lastProgressTimeRef.current = Date.now();
    }
  }, [currentTrack?.url]);

  useEffect(() => {
    const now = Date.now();
    const elapsedWall = (now - lastProgressTimeRef.current) / 1000;
    lastProgressTimeRef.current = now;

    if (isPlaying && elapsedWall > 0 && elapsedWall < 3) {
      accumulatedListeningRef.current += elapsedWall;
    }

    if (previousProgressRef.current > 5 && progressSeconds < 2) {
      hasSentNowPlayingRef.current = false;
      hasScrobbledRef.current = false;
      trackStartTimeRef.current = Math.floor(Date.now() / 1000);
      accumulatedListeningRef.current = 0;
    }
    previousProgressRef.current = progressSeconds;
  }, [progressSeconds, isPlaying]);

  useEffect(() => {
    if (!isPlaying || !currentTrack || hasSentNowPlayingRef.current) return;
    if (!currentTrack.title) return;

    hasSentNowPlayingRef.current = true;
    const dur = trackDurationSeconds || 0;

    if (lastfmEnabled && lastfmApiKey.trim() && lastfmApiSecret.trim() && lastfmSessionKey.trim()) {
      submitLastFmNowPlaying(lastfmSessionKey, currentTrack, dur, lastfmApiKey, lastfmApiSecret).then(res => {
        if (!res.success && res.error) {
          console.warn('[Last.fm Now Playing Error]:', res.error);
        }
      });
    }
  }, [
    isPlaying,
    currentTrack,
    trackDurationSeconds,
    lastfmEnabled,
    lastfmSessionKey,
    lastfmApiKey,
    lastfmApiSecret,
  ]);

  useEffect(() => {
    if (!isPlaying || !currentTrack || hasScrobbledRef.current) return;
    if (!currentTrack.title) return;

    const dur = trackDurationSeconds || 0;
    if (dur > 0 && dur < 30) return;

    const threshold = dur > 0 ? Math.min(dur * 0.5, 240) : 30;

    // Both playhead position AND actual accumulated listening time must satisfy the threshold
    if (progressSeconds >= threshold && accumulatedListeningRef.current >= threshold * 0.8) {
      hasScrobbledRef.current = true;
      const startTime = Math.floor(Date.now() / 1000) - Math.floor(progressSeconds);

      if (lastfmEnabled && lastfmApiKey.trim() && lastfmApiSecret.trim() && lastfmSessionKey.trim()) {
        submitLastFmScrobble(lastfmSessionKey, currentTrack, dur, startTime, lastfmApiKey, lastfmApiSecret).then(res => {
          if (!res.success && res.error) {
            console.warn('[Last.fm Scrobble Error]:', res.error);
          }
        });
      }
    }
  }, [
    isPlaying,
    currentTrack,
    progressSeconds,
    trackDurationSeconds,
    lastfmEnabled,
    lastfmSessionKey,
    lastfmApiKey,
    lastfmApiSecret,
  ]);

  return {
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
  };
}
