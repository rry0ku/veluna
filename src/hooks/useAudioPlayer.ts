import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Track, LocalTrack, AudioInfo, RepeatMode } from '../types';
import { loadLS, saveLS, parseDurationToSeconds, cleanArtist } from '../utils';

interface UseAudioPlayerProps {
  volume: number;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  previousVolume: number;
  setPreviousVolume: React.Dispatch<React.SetStateAction<number>>;
  eq: { bass: number; mid: number; treble: number };
  playbackSpeed: number;
  setPlaybackSpeed: React.Dispatch<React.SetStateAction<number>>;
  crossfadeSeconds: number;
  autoplayEnabled: boolean;
  queue: Track[];
  setQueue: React.Dispatch<React.SetStateAction<Track[]>>;
  queueRef?: React.MutableRefObject<Track[]>;
  playHistory: Track[];
  setPlayHistory: React.Dispatch<React.SetStateAction<Track[]>>;
  setQuickPicks: React.Dispatch<React.SetStateAction<Track[]>>;
  onTrackPlayed?: (track: Track) => void;
  onListeningStep?: (url: string, secs: number) => void;
  showToast: (msg: string) => void;
  setLyricsData?: (data: any) => void;
}

export function useAudioPlayer({
  volume,
  setVolume,
  previousVolume,
  setPreviousVolume,
  eq,
  playbackSpeed,
  crossfadeSeconds,
  autoplayEnabled,
  queue,
  setQueue,
  queueRef: externalQueueRef,
  playHistory,
  setPlayHistory,
  setQuickPicks,
  onTrackPlayed,
  onListeningStep,
  showToast,
  setLyricsData,
}: UseAudioPlayerProps) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(() => loadLS('vg_lastTrack', null));
  const currentTrackRef = useRef<Track | null>(currentTrack);
  const [currentLocalPath, setCurrentLocalPath] = useState<string | null>(null);
  const currentLocalPathRef = useRef<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);

  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const isLoadingTrackRef = useRef(false);

  const [loadingTrackUrl, setLoadingTrackUrl] = useState<string | null>(null);
  const loadingTrackUrlRef = useRef<string | null>(null);

  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null);
  const [progressSeconds, setProgressSeconds] = useState(0);
  const progressSecondsRef = useRef(0);
  const [trackDurationSeconds, setTrackDurationSeconds] = useState(0);
  const trackDurationRef = useRef(0);

  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [abLoop, setAbLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const abLoopRef = useRef<{ a: number | null; b: number | null }>({ a: null, b: null });
  const lastAbSeekRef = useRef<number>(0);

  const [shuffle, setShuffle] = useState<boolean>(() => loadLS('vg_shuffle', false));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => loadLS('vg_repeat', 'off'));
  const repeatModeRef = useRef<RepeatMode>(repeatMode);

  const playlistContextRef = useRef<{ tracks: Track[]; index: number } | null>(null);
  const localTracksListRef = useRef<LocalTrack[]>([]);
  const localTrackIndexRef = useRef<number>(0);

  const internalQueueRef = useRef<Track[]>(queue);
  const queueRef = externalQueueRef || internalQueueRef;
  useEffect(() => { queueRef.current = queue; }, [queue, queueRef]);

  const [sleepTimer, setSleepTimer] = useState<number>(0);
  const [showSleepPopover, setShowSleepPopover] = useState(false);

  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const isDraggingProgressRef = useRef(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);

  const progressRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);
  const endDetectedRef = useRef(false);
  const lastTrackEndTimeRef = useRef<number>(0);
  const isCrossfadingRef = useRef(false);
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codecPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressUpdateRef = useRef<number>(0);

  const setIsPlayingSync = useCallback((val: boolean) => {
    isPlayingRef.current = val;
    setIsPlaying(val);
  }, []);

  const setIsLoadingTrackSync = useCallback((val: boolean) => {
    isLoadingTrackRef.current = val;
    setIsLoadingTrack(val);
  }, []);

  const setLoadingTrackUrlSync = useCallback((val: string | null) => {
    loadingTrackUrlRef.current = val;
    setLoadingTrackUrl(val);
  }, []);

  useEffect(() => {
    saveLS('vg_shuffle', shuffle);
  }, [shuffle]);

  useEffect(() => {
    saveLS('vg_repeat', repeatMode);
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    if (currentTrack) saveLS('vg_lastTrack', currentTrack);
  }, [currentTrack]);

  useEffect(() => {
    invoke('set_playback_speed', { speed: playbackSpeed }).catch(() => {});
  }, [playbackSpeed]);

  const toggleShuffle = useCallback(() => {
    setShuffle(p => {
      showToast(!p ? 'Shuffle on' : 'Shuffle off');
      return !p;
    });
  }, [showToast]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode(p => {
      const n: RepeatMode = p === 'off' ? 'all' : p === 'all' ? 'one' : 'off';
      repeatModeRef.current = n;
      saveLS('vg_repeat', n);
      showToast(n === 'off' ? 'Repeat off' : n === 'all' ? 'Repeat all' : 'Repeat one');
      return n;
    });
  }, [showToast]);

  const fetchAutoplayTracks = useCallback(async (track: Track): Promise<Track[]> => {
    try {
      const artist = cleanArtist(track.artist);
      const query = artist && artist !== 'Unknown' && artist !== 'YouTube'
        ? `${artist} ${track.title} mix songs`
        : `${track.title} music songs`;
      const res = await invoke<string>('search_youtube', { query });
      const lines = res.trim().split('\n').filter(Boolean);
      return lines.map((line, i): Track | null => {
        const parts = line.split('====');
        const title = parts[0]?.trim() || '';
        const art = cleanArtist(parts[1]) || artist || 'YouTube Music';
        const duration = parts[2]?.trim() || '0:00';
        const id = parts[3]?.trim() || '';
        if (!id || id === 'NA') return null;
        return {
          id: i + 2000,
          title: title || 'Unknown Track',
          artist: art,
          duration: duration || '0:00',
          url: `https://youtube.com/watch?v=${id}`,
          cover: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
        };
      }).filter((t): t is Track => t !== null);
    } catch {
      return [];
    }
  }, []);

  const handlePlayTrack = useCallback(async (track: Track, fromQueue = false) => {
    invoke('pause_audio').catch(() => {});
    endDetectedRef.current = false;
    isCrossfadingRef.current = false;
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    setAbLoop({ a: null, b: null });
    abLoopRef.current = { a: null, b: null };
    setCurrentTrack(track);
    currentTrackRef.current = track;
    setCurrentLocalPath(null);
    currentLocalPathRef.current = null;
    setLoadingTrackUrlSync(track.url);
    setIsPlayingSync(false);
    setProgressSeconds(0);
    progressSecondsRef.current = 0;
    setTrackDurationSeconds(0);
    trackDurationRef.current = 0;
    setWaveformData([]);
    setAudioInfo(null);
    if (setLyricsData) setLyricsData(null);

    if (onTrackPlayed) onTrackPlayed(track);

    if (!fromQueue) {
      setPlayHistory(prev => [track, ...prev.filter(t => t.url !== track.url)].slice(0, 50));
      if (playlistContextRef.current) {
        const idx = playlistContextRef.current.tracks.findIndex(t => t.url === track.url);
        if (idx >= 0) playlistContextRef.current = { ...playlistContextRef.current, index: idx };
        else playlistContextRef.current = null;
      }
    }
    setQuickPicks(prev => [track, ...prev.filter(t => t.url !== track.url)].slice(0, 20));

    setLoadingTrackUrlSync(track.url);
    setIsLoadingTrackSync(true);
    setIsPlayingSync(false);

    try {
      await invoke('play_audio', { url: track.url });
      setLoadingTrackUrlSync(null);
      setIsLoadingTrackSync(false);
      setIsPlayingSync(true);
      invoke('set_volume', { volume }).catch(() => {});
      invoke('set_playback_speed', { speed: playbackSpeed }).catch(() => {});
      invoke('set_equalizer', { bass: eq.bass, mid: eq.mid, treble: eq.treble }).catch(() => {});

      if (codecPollRef.current) clearInterval(codecPollRef.current);
      let codecWaited = 0;
      codecPollRef.current = setInterval(async () => {
        codecWaited += 300;
        try {
          const info: AudioInfo = await invoke('get_audio_info');
          if (info?.codec && info.codec !== 'unknown' && info.codec !== '') {
            setAudioInfo(info);
            if (codecPollRef.current) clearInterval(codecPollRef.current);
            codecPollRef.current = null;
          }
        } catch {}
        if (codecWaited >= 5000) {
          if (codecPollRef.current) clearInterval(codecPollRef.current);
          codecPollRef.current = null;
        }
      }, 300);
    } catch (err: any) {
      if (currentTrackRef.current?.url !== track.url) return;
      setIsPlayingSync(false);
      setLoadingTrackUrlSync(null);
      setIsLoadingTrackSync(false);
      const errMsg = typeof err === 'string' ? err : err?.message || '';
      if (!errMsg.toLowerCase().includes('superseded') &&
          !errMsg.toLowerCase().includes('abort') &&
          !errMsg.toLowerCase().includes('cancel') &&
          !errMsg.toLowerCase().includes('pause')) {
        console.warn('Track playback issue:', errMsg);
      }
    }
  }, [volume, playbackSpeed, eq, onTrackPlayed, setPlayHistory, setQuickPicks, setIsPlayingSync, setLoadingTrackUrlSync, showToast, setLyricsData]);

  const handlePlayLocalTrack = useCallback(async (local: LocalTrack, localList?: LocalTrack[], localIndex?: number) => {
    invoke('pause_audio').catch(() => {});
    endDetectedRef.current = false;
    isCrossfadingRef.current = false;
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    playlistContextRef.current = null;
    setQueue([]);
    queueRef.current = [];
    setCurrentLocalPath(local.path);
    currentLocalPathRef.current = local.path;
    
    if (localList !== undefined) {
      localTracksListRef.current = localList;
      localTrackIndexRef.current = localIndex ?? 0;
    } else if (localTracksListRef.current.length === 0) {
      localTracksListRef.current = [local];
      localTrackIndexRef.current = 0;
    } else {
      const idx = localTracksListRef.current.findIndex(t => t.path === local.path);
      if (idx >= 0) localTrackIndexRef.current = idx;
    }

    setLoadingTrackUrlSync(`local://${local.path}`);
    setIsPlayingSync(false);
    setProgressSeconds(0);
    progressSecondsRef.current = 0;
    setTrackDurationSeconds(0);
    trackDurationRef.current = 0;
    setAudioInfo(null);

    let cover = local.cover || '';
    if (!cover) {
      try {
        const coverB64 = await invoke<string | null>('get_audio_cover', { path: local.path });
        if (coverB64) cover = coverB64;
      } catch {}
    }

    const synth: Track = {
      id: -1,
      title: local.title,
      artist: local.artist || local.extension.toUpperCase(),
      duration: local.duration || '0:00',
      url: `local://${local.path}`,
      cover,
    };
    setCurrentTrack(synth);
    currentTrackRef.current = synth;
    if (onTrackPlayed) onTrackPlayed(synth);
    setPlayHistory(prev => [synth, ...prev.filter(t => t.url !== synth.url)].slice(0, 50));
    setQuickPicks(prev => [synth, ...prev.filter(t => t.url !== synth.url)].slice(0, 20));

    if (local.duration && local.duration !== '0:00') {
      const d = parseDurationToSeconds(local.duration);
      if (d > 0) {
        setTrackDurationSeconds(d);
        trackDurationRef.current = d;
      }
    }

    invoke<number[]>('get_waveform_thumbnail', { path: local.path })
      .then(setWaveformData).catch(() => setWaveformData([]));

    try {
      await invoke('play_local_file', { path: local.path });
      setLoadingTrackUrlSync(null);
      setIsLoadingTrackSync(false);
      setIsPlayingSync(true);
      await invoke('set_volume', { volume });
      await invoke('set_playback_speed', { speed: playbackSpeed });
      
      setTimeout(async () => {
        try {
          const s: { position: number; duration: number } = await invoke('get_playback_state');
          if (s.duration > 0) {
            setTrackDurationSeconds(s.duration);
            trackDurationRef.current = s.duration;
          }
        } catch {}
      }, 300);
    } catch {
      setIsPlayingSync(false);
      setLoadingTrackUrlSync(null);
    }
  }, [volume, playbackSpeed, setPlayHistory, setQuickPicks, setIsPlayingSync, setLoadingTrackUrlSync, setQueue]);

  const handlePlayInContext = useCallback((track: Track, contextList: Track[]) => {
    localTracksListRef.current = [];
    setCurrentLocalPath(null);
    currentLocalPathRef.current = null;
    const idx = contextList.findIndex(t => t.url === track.url);
    playlistContextRef.current = { tracks: contextList, index: Math.max(0, idx) };
    setQueue([]);
    setPlayHistory(prev => [track, ...prev.filter(t => t.url !== track.url)].slice(0, 50));
    handlePlayTrack(track, true);
  }, [handlePlayTrack, setQueue, setPlayHistory]);

  const togglePlayPause = useCallback(async () => {
    if (!currentTrackRef.current) return;
    
    if (!isPlayingRef.current) {
      try {
        const state: { playing: boolean; paused: boolean; position: number; duration: number; eof_reached: boolean } =
          await invoke('get_playback_state');
        if ((state.position === 0 && !state.paused) || state.eof_reached) {
          await handlePlayTrack(currentTrackRef.current, true);
          return;
        }
        await invoke('resume_audio');
        setIsPlayingSync(true);
      } catch {
        await handlePlayTrack(currentTrackRef.current, true);
      }
    } else {
      try {
        await invoke('pause_audio');
        setIsPlayingSync(false);
      } catch {}
    }
  }, [setIsPlayingSync, handlePlayTrack]);

  const toggleMute = useCallback(async () => {
    const targetVol = volume === 0 ? (previousVolume > 0 ? previousVolume : 80) : 0;
    if (volume > 0) setPreviousVolume(volume);
    setVolume(targetVol);
    try { await invoke('set_volume', { volume: targetVol }); } catch {}
  }, [volume, previousVolume, setPreviousVolume, setVolume]);

  const handleTrackEnd = useCallback(() => {
    const now = performance.now();
    if (now - lastTrackEndTimeRef.current < 2500) return;
    lastTrackEndTimeRef.current = now;
    endDetectedRef.current = true;
    isCrossfadingRef.current = false;
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    const track = currentTrackRef.current;
    const repeat = repeatModeRef.current;

    if (repeat === 'off') {
      setIsPlayingSync(false);
      invoke('pause_audio').catch(() => {});
      return;
    }

    const isLocal = track?.url?.startsWith('local://') || currentLocalPathRef.current !== null;

    if (isLocal) {
      if (repeat === 'one' && track) {
        const list = localTracksListRef.current;
        const idx = localTrackIndexRef.current;
        if (list[idx]) {
          handlePlayLocalTrack(list[idx], list, idx);
        } else if (list[0]) {
          handlePlayLocalTrack(list[0], list, 0);
        }
        setTimeout(() => { endDetectedRef.current = false; }, 1500);
        return;
      }

      if (repeat === 'all') {
        const list = localTracksListRef.current;
        const idx = localTrackIndexRef.current;
        if (list.length > 1) {
          let nextIdx: number;
          if (shuffle) {
            do { nextIdx = Math.floor(Math.random() * list.length); } while (nextIdx === idx && list.length > 1);
          } else {
            nextIdx = idx + 1;
          }
          if (nextIdx < list.length) {
            localTrackIndexRef.current = nextIdx;
            setTimeout(() => handlePlayLocalTrack(list[nextIdx], list, nextIdx), 0);
            return;
          } else {
            localTrackIndexRef.current = 0;
            setTimeout(() => handlePlayLocalTrack(list[0], list, 0), 0);
            return;
          }
        } else if (list.length === 1) {
          handlePlayLocalTrack(list[0], list, 0);
          return;
        }
      }

      setIsPlayingSync(false);
      return;
    }

    if (repeat === 'one' && track) {
      handlePlayTrack(track, true);
      setTimeout(() => { endDetectedRef.current = false; }, 1500);
      return;
    }

    if (repeat === 'all') {
      const q = queueRef.current;
      if (q.length > 0) {
        const [next, ...rest] = q;
        queueRef.current = rest;
        setQueue(rest);
        setTimeout(() => handlePlayTrack(next, true), 0);
        return;
      }

      const ctx = playlistContextRef.current;
      if (ctx && ctx.tracks.length > 1) {
        let nextIdx: number;
        if (shuffle) {
          do { nextIdx = Math.floor(Math.random() * ctx.tracks.length); }
          while (nextIdx === ctx.index && ctx.tracks.length > 1);
        } else {
          nextIdx = ctx.index + 1;
        }
        if (nextIdx < ctx.tracks.length) {
          playlistContextRef.current = { ...ctx, index: nextIdx };
          setTimeout(() => handlePlayTrack(ctx.tracks[nextIdx], true), 0);
          return;
        } else {
          playlistContextRef.current = { ...ctx, index: 0 };
          setTimeout(() => handlePlayTrack(ctx.tracks[0], true), 0);
          return;
        }
      }

      if (track) {
        setTimeout(() => handlePlayTrack(track, true), 0);
        return;
      }
    }

    setIsPlayingSync(false);
  }, [handlePlayTrack, handlePlayLocalTrack, setIsPlayingSync, shuffle, setQueue]);

  const handleSkipForward = useCallback(async () => {
    const track = currentTrackRef.current;
    const isLocal = track?.url?.startsWith('local://') || currentLocalPathRef.current !== null;

    if (isLocal) {
      const list = localTracksListRef.current;
      const idx = localTrackIndexRef.current;
      let nextIdx: number;
      if (shuffle) {
        do { nextIdx = Math.floor(Math.random() * list.length); } while (nextIdx === idx && list.length > 1);
      } else {
        nextIdx = idx + 1;
      }
      if (nextIdx < list.length) {
        localTrackIndexRef.current = nextIdx;
        handlePlayLocalTrack(list[nextIdx], list, nextIdx);
      } else if (repeatModeRef.current === 'all' && list.length > 0) {
        localTrackIndexRef.current = 0;
        handlePlayLocalTrack(list[0], list, 0);
      }
      return;
    }

    const q = queueRef.current;
    if (q.length > 0) {
      const [next, ...rest] = q;
      queueRef.current = rest;
      setQueue(rest);
      await handlePlayTrack(next, true);
      return;
    }

    const ctx = playlistContextRef.current;
    if (ctx && ctx.tracks.length > 1) {
      let nextIdx: number;
      if (shuffle) {
        do { nextIdx = Math.floor(Math.random() * ctx.tracks.length); }
        while (nextIdx === ctx.index && ctx.tracks.length > 1);
      } else {
        nextIdx = ctx.index + 1;
      }
      if (nextIdx < ctx.tracks.length) {
        playlistContextRef.current = { ...ctx, index: nextIdx };
        await handlePlayTrack(ctx.tracks[nextIdx], true);
        return;
      } else if (repeatModeRef.current === 'all') {
        playlistContextRef.current = { ...ctx, index: 0 };
        await handlePlayTrack(ctx.tracks[0], true);
        return;
      }
    }

    if (autoplayEnabled && track) {
      setIsLoadingTrack(true);
      fetchAutoplayTracks(track).then(async (recs) => {
        if (currentTrackRef.current?.url !== track.url) return;
        if (recs.length > 0) {
          const filteredRecs = recs.filter(r => r.url !== track.url && !playHistory.some(h => h.url === r.url));
          const toAdd = (filteredRecs.length > 0 ? filteredRecs : recs).slice(0, 8);
          if (toAdd.length > 0) {
            const [next, ...rest] = toAdd;
            queueRef.current = rest;
            setQueue(rest);
            showToast("Song Radio: Playing recommendations");
            await handlePlayTrack(next, true);
            return;
          }
        }
        setIsLoadingTrack(false);
      }).catch(() => {
        if (currentTrackRef.current?.url === track.url) {
          setIsLoadingTrack(false);
        }
      });
    }
  }, [handlePlayTrack, handlePlayLocalTrack, shuffle, setQueue, autoplayEnabled, fetchAutoplayTracks, playHistory, showToast]);

  const handleSkipBack = useCallback(async () => {
    const track = currentTrackRef.current;
    const isLocal = track?.url?.startsWith('local://');

    if (isLocal) {
      if (progressSecondsRef.current > 3) {
        await invoke('seek_audio', { time: 0 }).catch(() => {});
        progressSecondsRef.current = 0;
        setProgressSeconds(0);
        return;
      }
      const list = localTracksListRef.current;
      const idx = localTrackIndexRef.current;
      if (idx > 0) {
        const prevIdx = idx - 1;
        localTrackIndexRef.current = prevIdx;
        handlePlayLocalTrack(list[prevIdx], list, prevIdx);
      } else {
        await invoke('seek_audio', { time: 0 }).catch(() => {});
        progressSecondsRef.current = 0;
        setProgressSeconds(0);
      }
      return;
    }

    if (progressSecondsRef.current > 3) {
      await invoke('seek_audio', { time: 0 }).catch(() => {});
      progressSecondsRef.current = 0;
      setProgressSeconds(0);
      return;
    }

    const ctx = playlistContextRef.current;
    if (ctx && ctx.index > 0) {
      const prevIdx = ctx.index - 1;
      playlistContextRef.current = { ...ctx, index: prevIdx };
      await handlePlayTrack(ctx.tracks[prevIdx], true);
      return;
    }

    if (playHistory.length > 0) {
      const [prev, ...rest] = playHistory;
      setPlayHistory(rest);
      await handlePlayTrack(prev, true);
    } else {
      await invoke('seek_audio', { time: 0 }).catch(() => {});
      progressSecondsRef.current = 0;
      setProgressSeconds(0);
    }
  }, [playHistory, setPlayHistory, handlePlayTrack, handlePlayLocalTrack]);

  const handleTrackEndRef = useRef(handleTrackEnd);
  useEffect(() => {
    handleTrackEndRef.current = handleTrackEnd;
  }, [handleTrackEnd]);

  const crossfadeSecondsRef = useRef(crossfadeSeconds);
  useEffect(() => {
    crossfadeSecondsRef.current = crossfadeSeconds;
  }, [crossfadeSeconds]);

  const currentVolumeRef = useRef(volume);
  useEffect(() => {
    currentVolumeRef.current = volume;
  }, [volume]);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    let active = true;
    let unlistenState: (() => void) | undefined;
    let unlistenEnd: (() => void) | undefined;
    let unlistenStarted: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;

    listen<{ playing: boolean; paused: boolean; position: number; duration: number; eof_reached: boolean }>(
      'mpv_playback_state',
      event => {
        const s = event.payload;
        if (isDraggingProgressRef.current) return;

        progressSecondsRef.current = s.position;
        const now = performance.now();
        if (now - lastProgressUpdateRef.current >= 200 || Math.abs(s.position - (progressSecondsRef.current || 0)) >= 1) {
          lastProgressUpdateRef.current = now;
          setProgressSeconds(s.position);
        }

        const ab = abLoopRef.current;
        if (ab.a !== null && ab.b !== null && s.position >= ab.b) {
          const nowMs = performance.now();
          if (nowMs - lastAbSeekRef.current > 350) {
            lastAbSeekRef.current = nowMs;
            invoke('seek_audio', { time: ab.a }).catch(() => {});
          }
        }

        if (s.duration > 0 && s.duration !== trackDurationRef.current) {
          trackDurationRef.current = s.duration;
          setTrackDurationSeconds(s.duration);
        }

        if (s.position > 0.01 || (s.playing && !s.paused)) {
          if (isLoadingTrackRef.current) {
            setIsLoadingTrackSync(false);
          }
          if (loadingTrackUrlRef.current) {
            setLoadingTrackUrlSync(null);
          }
          if (!isPlayingRef.current && !s.paused) {
            setIsPlayingSync(true);
          }
        }

        if (!endDetectedRef.current && !isLoadingTrackRef.current) {
          const playing = !s.paused && s.playing;
          if (playing !== isPlayingRef.current) setIsPlayingSync(playing);
        }

        const curCrossfade = crossfadeSecondsRef.current;
        const curVol = currentVolumeRef.current;
        if (!s.eof_reached && !endDetectedRef.current && !isCrossfadingRef.current && s.position > 3 && s.duration > 0
            && curCrossfade > 0 && s.position >= s.duration - curCrossfade - 0.5
            && s.position < s.duration - 0.2) {
          isCrossfadingRef.current = true;
          const fadeSteps = Math.max(1, Math.round(curCrossfade * 5));
          const volStep = curVol / fadeSteps;
          let step = 0;
          if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = setInterval(() => {
            step++;
            const newVol = Math.max(0, curVol - volStep * step);
            invoke('set_volume', { volume: newVol }).catch(() => {});
            if (step >= fadeSteps) {
              if (fadeIntervalRef.current) {
                clearInterval(fadeIntervalRef.current);
                fadeIntervalRef.current = null;
              }
              invoke('set_volume', { volume: curVol }).catch(() => {});
              if (!endDetectedRef.current) handleTrackEndRef.current();
            }
          }, (curCrossfade * 1000) / fadeSteps);
          return;
        }

        if (s.eof_reached && s.position > 3) {
          handleTrackEndRef.current();
          return;
        }
      }
    ).then(fn => {
      if (active) unlistenState = fn;
      else fn();
    });

    listen('mpv_track_started', () => {
      if (isLoadingTrackRef.current) {
        setIsLoadingTrackSync(false);
      }
      if (loadingTrackUrlRef.current) {
        setLoadingTrackUrlSync(null);
      }
      setIsPlayingSync(true);
    }).then(fn => {
      if (active) unlistenStarted = fn;
      else fn();
    });

    listen('mpv_track_error', () => {
      if (isLoadingTrackRef.current) {
        setIsLoadingTrackSync(false);
      }
      setLoadingTrackUrlSync(null);
      setIsPlayingSync(false);
    }).then(fn => {
      if (active) unlistenError = fn;
      else fn();
    });

    listen('mpv_track_end', () => {
      if (!endDetectedRef.current) {
        handleTrackEndRef.current();
      }
    }).then(fn => {
      if (active) unlistenEnd = fn;
      else fn();
    });

    invoke<{ playing: boolean; paused: boolean; position: number; duration: number; eof_reached: boolean }>('get_playback_state')
      .then(s => {
        if (s.duration > 0) {
          trackDurationRef.current = s.duration;
          setTrackDurationSeconds(s.duration);
        }
        if (s.position > 0) {
          progressSecondsRef.current = s.position;
          setProgressSeconds(s.position);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      unlistenState?.();
      unlistenEnd?.();
      unlistenStarted?.();
      unlistenError?.();
    };
  }, []);

  const onListeningStepRef = useRef(onListeningStep);
  useEffect(() => {
    onListeningStepRef.current = onListeningStep;
  }, [onListeningStep]);

  useEffect(() => {
    if (!isPlaying || !currentTrack) return;
    const interval = setInterval(() => {
      if (isPlayingRef.current && currentTrackRef.current?.url) {
        onListeningStepRef.current?.(currentTrackRef.current.url, 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, currentTrack?.url]);

  const updateProgressFromEvent = useCallback((clientX: number) => {
    if (!progressRef.current || !currentTrackRef.current) return undefined;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const total = trackDurationRef.current || parseDurationToSeconds(currentTrackRef.current.duration);
    const t = total * pct;
    progressSecondsRef.current = t;
    setProgressSeconds(t);
    return t;
  }, []);

  const updateVolumeFromEvent = useCallback((clientX: number) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const v = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setVolume(v);
    invoke('set_volume', { volume: v }).catch(() => {});
  }, [setVolume]);

  useEffect(() => {
    const el = volumeRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setVolume(prev => {
        const next = Math.max(0, Math.min(100, prev + (e.deltaY < 0 ? 5 : -5)));
        invoke('set_volume', { volume: next }).catch(() => {});
        return next;
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [setVolume]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isDraggingProgressRef.current) updateProgressFromEvent(e.clientX);
      if (isDraggingVolume) updateVolumeFromEvent(e.clientX);
    };
    const onUp = async (e: MouseEvent) => {
      if (isDraggingProgressRef.current) {
        const t = updateProgressFromEvent(e.clientX);
        if (t !== undefined) await invoke('seek_audio', { time: t }).catch(() => {});
        isDraggingProgressRef.current = false;
        setIsDraggingProgress(false);
      }
      if (isDraggingVolume) setIsDraggingVolume(false);
    };
    if (isDraggingProgress || isDraggingVolume) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingProgress, isDraggingVolume, updateProgressFromEvent, updateVolumeFromEvent]);

  const calculateProgressPercent = useCallback(() => {
    const dur = trackDurationSeconds || parseDurationToSeconds(currentTrack?.duration || '0:00');
    if (!dur) return 0;
    return Math.min(100, (progressSeconds / dur) * 100);
  }, [trackDurationSeconds, currentTrack?.duration, progressSeconds]);

  const setSleepTimerMinutes = useCallback((minutes: number) => {
    setSleepTimer(minutes * 60);
    showToast(`Sleep timer set for ${minutes}m`);
  }, [showToast]);

  const cancelSleepTimer = useCallback(() => {
    setSleepTimer(0);
    showToast('Sleep timer cancelled');
  }, [showToast]);

  useEffect(() => {
    if (sleepTimer <= 0) return;
    const interval = setInterval(() => {
      setSleepTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          invoke('pause_audio').catch(() => {});
          setIsPlayingSync(false);
          showToast('Sleep timer expired: Playback stopped');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepTimer, setIsPlayingSync, showToast]);

  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchedSetRef = useRef<Set<string>>(new Set());

  const prefetchOnHover = useCallback((url: string) => {
    if (!url || url.startsWith('local://') || prefetchedSetRef.current.has(url)) return;
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(() => {
      prefetchedSetRef.current.add(url);
      if (prefetchedSetRef.current.size > 200) {
        prefetchedSetRef.current.clear();
      }
      invoke('prefetch_track', { url }).catch(() => {});
    }, 180);
  }, []);

  return {
    currentTrack,
    currentTrackRef,
    setCurrentTrack,
    currentLocalPath,
    currentLocalPathRef,
    setCurrentLocalPath,
    isPlaying,
    isPlayingRef,
    setIsPlaying: setIsPlayingSync,
    isLoadingTrack,
    isLoadingTrackRef,
    setIsLoadingTrack: setIsLoadingTrackSync,
    loadingTrackUrl,
    setLoadingTrackUrl: setLoadingTrackUrlSync,
    audioInfo,
    setAudioInfo,
    progressSeconds,
    progressSecondsRef,
    setProgressSeconds,
    trackDurationSeconds,
    trackDurationRef,
    setTrackDurationSeconds,
    waveformData,
    setWaveformData,
    abLoop,
    setAbLoop,
    abLoopRef,
    shuffle,
    setShuffle,
    toggleShuffle,
    repeatMode,
    setRepeatMode,
    cycleRepeat,
    repeatModeRef,
    playlistContextRef,
    localTracksListRef,
    localTrackIndexRef,
    sleepTimer,
    showSleepPopover,
    setShowSleepPopover,
    setSleepTimerMinutes,
    cancelSleepTimer,
    handlePlayTrack,
    handlePlayLocalTrack,
    handlePlayInContext,
    togglePlayPause,
    toggleMute,
    handleSkipForward,
    handleSkipBack,
    updateProgressFromEvent,
    updateVolumeFromEvent,
    calculateProgressPercent,
    prefetchOnHover,
    progressRef,
    volumeRef,
    isDraggingProgress,
    setIsDraggingProgress,
    isDraggingProgressRef,
    isDraggingVolume,
    setIsDraggingVolume,
  };
}
