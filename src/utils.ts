import { invoke } from '@tauri-apps/api/core';
import { Track } from './types';

export const globalArtistAvatarCache = new Map<string, string>();

export interface DuplicateTrackInfo {
  track: Track;
  originalIndex: number;
}

export function findDuplicateTracks(tracks?: Track[] | null): DuplicateTrackInfo[] {
  if (!tracks || tracks.length === 0) return [];
  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();
  const duplicates: DuplicateTrackInfo[] = [];

  tracks.forEach((t, index) => {
    const rawTitle = (t.title || '').trim().toLowerCase();
    const rawArtist = cleanArtist(t.artist).trim().toLowerCase();
    const normKey = rawTitle ? `${rawArtist}|||${rawTitle}` : '';
    const rawUrl = (t.url || '').trim();
    const hasUrl = Boolean(rawUrl);

    const isUrlDupe = hasUrl && seenUrls.has(rawUrl);
    const isKeyDupe = Boolean(normKey && seenKeys.has(normKey));

    if (isUrlDupe || isKeyDupe) {
      duplicates.push({ track: t, originalIndex: index });
    } else {
      if (hasUrl) seenUrls.add(rawUrl);
      if (normKey) seenKeys.add(normKey);
    }
  });

  return duplicates;
}

export function parseDurationToSeconds(d: string): number {
  if (!d || typeof d !== 'string') return 0;
  const p = d.split(':').map(Number);
  if (p.some(isNaN)) return 0;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] || 0;
}

export const lightenColor = (hex: string, percent: number): string => {
  let num = parseInt(hex.replace("#", ""), 16),
      amt = Math.round(2.55 * percent),
      r = (num >> 16) + amt,
      g = (num >> 8 & 0x00FF) + amt,
      b = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (r < 255 ? r < 0 ? 0 : r : 255) * 0x10000 + (g < 255 ? g < 0 ? 0 : g : 255) * 0x100 + (b < 255 ? b < 0 ? 0 : b : 255)).toString(16).slice(1);
};

export const hexToRgb = (hex: string): string => {
  if (!hex || typeof hex !== 'string') return "226, 221, 217";
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(c => c + c).join('');
  }
  if (cleaned.length !== 6) return "226, 221, 217";
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "226, 221, 217";
  return `${r}, ${g}, ${b}`;
};

export const cleanArtist = (a?: string | null): string => {
  if (!a) return '';
  let t = a.trim();
  const bad = ['unknown', 'na', 'n/a', 'none', '-', '--', 'unknown artist', 'various artists', 'various', '?'];
  if (bad.includes(t.toLowerCase())) return '';

  t = t.replace(/\s*-\s*Topic\s*$/i, '')
       .replace(/\s+VEVO\s*$/i, '')
       .replace(/\s+Official\s*$/i, '')
       .replace(/\s+Official Channel\s*$/i, '')
       .replace(/\s+Channel\s*$/i, '')
       .trim();

  return t;
};

export interface ArtistPart {
  name: string;
  isSeparator: boolean;
}

export function parseArtistParts(rawArtist?: string | null): ArtistPart[] {
  if (!rawArtist) return [];
  const cleaned = cleanArtist(rawArtist);
  if (!cleaned) return [];

  // Protect specific artist names containing commas or ampersands
  let text = cleaned;
  const protections: { placeholder: string; original: string }[] = [
    { placeholder: '__TYLER_THE_CREATOR__', original: 'Tyler, The Creator' },
    { placeholder: '__EARTH_WIND_FIRE__', original: 'Earth, Wind & Fire' },
    { placeholder: '__CROSBY_STILLS_NASH__', original: 'Crosby, Stills & Nash' },
    { placeholder: '__CROSBY_STILLS_NASH_YOUNG__', original: 'Crosby, Stills, Nash & Young' },
    { placeholder: '__SIMON_GARFUNKEL__', original: 'Simon & Garfunkel' },
  ];
  for (const p of protections) {
    text = text.replace(new RegExp(p.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), p.placeholder);
  }

  // Split on delimiters while capturing separators
  const tokens = text.split(/(\s*(?:,\s*|;\s*|\s+ft\.?\s+|\s+feat\.?\s+|\s+featuring\s+|\s+&\s+|\s+\/\s+)\s*)/i);

  const result: ArtistPart[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    if (!token) continue;
    for (const p of protections) {
      token = token.replace(new RegExp(p.placeholder, 'g'), p.original);
    }
    const isSeparator = i % 2 === 1;
    if (!isSeparator && !token.trim()) continue;
    result.push({
      name: isSeparator ? token : token.trim(),
      isSeparator
    });
  }

  if (result.length === 0) {
    return [{ name: cleaned, isSeparator: false }];
  }

  return result;
}

export function parseTrackMeta(rawTitle: string, rawArtist?: string | null): { title: string; artist: string } {
  let title = (rawTitle || '').trim();
  let artist = cleanArtist(rawArtist);

  const isChannelOrCurator = (art: string): boolean => {
    if (!art) return true;
    const lower = art.toLowerCase().trim();
    const bad = ['unknown', 'na', 'n/a', 'none', 'unknown artist', 'various artists', 'various'];
    if (bad.includes(lower)) return true;

    const channelSuffixes = [
      'music', 'lyrics', 'records', 'recordings', 'vevo', 'nation', 'vibes', 'tracks',
      'network', 'channel', 'audio', 'tv', 'fm', 'radio', 'hits', 'beats', 'lofi',
      'sound', 'sounds', 'mix', 'remix', 'central', 'station', 'sessions', 'studio',
      'studios', 'hub', 'zone', 'plus', 'official', 'entertainment', 'media', 'films',
      'series', 'company', 'label', 'production', 'productions'
    ];
    for (const suf of channelSuffixes) {
      if (lower.endsWith(' ' + suf) || lower === suf) return true;
    }

    const knownCurators = [
      '7clouds', 't-series', 'sonymusicindiavevo', 'zee music company', 'tips official',
      'yrf', 'speed records', 'trap nation', 'mrsuicidesheep', 'chill nation', 'sensual musique',
      'syrebralvibes', 'taj tracks', 'taz network', 'dopelyrics', 'pizza music', 'lofi girl',
      'cassiopeia', 'royal music', 'wave music', 'venus', 'worldwide records', 'geet mp3',
      'white hill music', 'saregama music', 'saregama', 'aditya music', 'lahari music',
      'tseries', 'zeemusiccompany', 'sonymusicindia', 'yrfmusic', 'warnermusic', 'universalmusic'
    ];
    return knownCurators.includes(lower);
  };

  const cleanNoise = (str: string) => {
    return str
      .replace(/\s*[\(\[\{]\s*(?:official\s+music\s+video|official\s+lyric\s+video|official\s+video|official\s+audio|official\s+visualizer|lyric\s+video|lyrics\s+video|full\s+song|full\s+video|music\s+video|lyrics|lyric|audio|visualizer|video|4k|hd|remastered|hq|explicit|clean)\s*[\)\]\}]\s*/gi, ' ')
      .replace(/\s*[-–—|]\s*(?:official\s+video|official\s+audio|lyrics|lyric|visualizer|audio)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Check if title has format: "Artist - Song Title" or "Artist - Song Title (Lyrics)"
  const sepMatch = title.match(/^([^–—\-|]+?)\s*[-–—|]\s*(.+)$/);
  if (sepMatch) {
    const candidateArtist = cleanArtist(sepMatch[1].trim());
    const candidateTitle = cleanNoise(sepMatch[2].trim());

    if (candidateArtist.length > 0 && candidateArtist.length <= 60 && candidateTitle.length > 0) {
      if (isChannelOrCurator(artist) || !artist || artist.toLowerCase() === candidateArtist.toLowerCase()) {
        return {
          title: candidateTitle,
          artist: candidateArtist
        };
      }
      return {
        title: candidateTitle,
        artist: candidateArtist
      };
    }
  }

  return {
    title: cleanNoise(title) || rawTitle,
    artist: artist
  };
}

export const getTrackGradient = (title?: string | null, artist?: string | null): string => {
  const str = `${title || ''}${artist || ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 60) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 45%, 28%) 0%, hsl(${h2}, 30%, 12%) 100%)`;
};

const dominantColorCache = new Map<string, string>();

export async function extractDominantColor(imageUrl?: string | null): Promise<string> {
  if (!imageUrl) return '#ffffff';
  if (dominantColorCache.has(imageUrl)) return dominantColorCache.get(imageUrl)!;

  return new Promise<string>((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve('#ffffff');
            return;
          }
          canvas.width = 24;
          canvas.height = 24;
          ctx.drawImage(img, 0, 0, 24, 24);
          const data = ctx.getImageData(0, 0, 24, 24).data;

          let bestR = 255, bestG = 255, bestB = 255;
          let maxScore = -1;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (a < 128) continue;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const delta = max - min;
            const saturation = max === 0 ? 0 : delta / max;
            const lightness = (max + min) / 510;

            if (lightness >= 0.3 && lightness <= 0.85 && saturation >= 0.2) {
              const score = saturation * 2.5 + (1 - Math.abs(lightness - 0.6));
              if (score > maxScore) {
                maxScore = score;
                bestR = r;
                bestG = g;
                bestB = b;
              }
            }
          }

          const hex = `#${((1 << 24) + (bestR << 16) + (bestG << 8) + bestB).toString(16).slice(1)}`;
          dominantColorCache.set(imageUrl, hex);
          resolve(hex);
        } catch {
          resolve('#ffffff');
        }
      };
      img.onerror = () => resolve('#ffffff');
      img.src = imageUrl;
    } catch {
      resolve('#ffffff');
    }
  });
}

export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  const total = Math.floor(s);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(b: number): string {
  if (!b || b <= 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function loadLS<T>(key: string, fb: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch { return fb; }
}

export function saveLS(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

export function getZoomFactor(): number {
  // CSS transform:scale() does not affect scrollTop/clientHeight, so no zoom correction needed.
  // Kept for API compatibility with VirtualTrackList.
  return 1;
}

export function clampMenu(x: number, y: number, w = 260, h = 320) {
  const vw = typeof document !== 'undefined' ? (document.documentElement.clientWidth || window.innerWidth) : 1920;
  const vh = typeof document !== 'undefined' ? (document.documentElement.clientHeight || window.innerHeight) : 1080;
  
  const cx = x + w > vw - 12 ? Math.max(12, x - w) : Math.max(12, x);
  const cy = y + h > vh - 12 ? Math.max(12, y - h) : Math.max(12, y);
  return { x: cx, y: cy };
}

export function validateSettingsChange(
  key: string,
  newVal: unknown,
  current: {
    loudnormEnabled: boolean; skipSilence: boolean;
    eq: { bass: number; mid: number; treble: number };
  }
): string | null {
  const { loudnormEnabled, skipSilence, eq } = current;
  const hasEq = eq.bass !== 0 || eq.mid !== 0 || eq.treble !== 0;

  if (key === 'loudnormEnabled' && newVal === true && skipSilence) {
    return 'Loudnorm + Skip Silence together can cause audio distortion on short tracks. Consider disabling one.';
  }
  if (key === 'skipSilence' && newVal === true && loudnormEnabled) {
    return 'Loudnorm + Skip Silence together can cause audio distortion on short tracks. Consider disabling one.';
  }
  if (key === 'loudnormEnabled' && newVal === true && hasEq) {
    const extreme = Math.max(Math.abs(eq.bass), Math.abs(eq.mid), Math.abs(eq.treble));
    if (extreme >= 10) {
      return `Loudnorm with high EQ values (${extreme}dB) may clip audio. Reduce EQ or disable Loudnorm.`;
    }
  }
  return null; 
}

export async function fetchArtistYouTubeTracks(artists: string[]): Promise<Track[]> {
  if (!artists || artists.length === 0) return [];
  const tracks: Track[] = [];
  const seenUrls = new Set<string>();

  for (const rawArtist of artists.slice(0, 8)) {
    const artist = rawArtist.trim();
    if (!artist) continue;
    try {
      // 1. Try to fetch verified artist discography first
      const rawData = await invoke<string>('get_artist_page_details', { artistName: artist });
      if (rawData && rawData.trim()) {
        try {
          const parsed = JSON.parse(rawData);
          if (Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
            for (let i = 0; i < parsed.tracks.length && i < 4; i++) {
              const line = parsed.tracks[i];
              const parts = line.split('====');
              const rawTitle = parts[0]?.trim() || '';
              const rawUploader = parts[1]?.trim() || artist;
              const duration = parts[2]?.trim() || '0:00';
              const id = parts[3]?.trim() || '';
              if (!id || id === 'NA') continue;
              const url = `https://youtube.com/watch?v=${id}`;
              if (!seenUrls.has(url)) {
                seenUrls.add(url);
                const meta = parseTrackMeta(rawTitle, rawUploader || artist);
                tracks.push({
                  id: Date.now() + Math.floor(Math.random() * 1000000) + tracks.length,
                  title: meta.title || rawTitle,
                  artist: meta.artist || artist,
                  duration: duration || '0:00',
                  url,
                  cover: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
                  mediaType: 'music'
                });
              }
            }
            if (tracks.length >= 15) break;
            continue;
          }
        } catch {}
      }

      // 2. Fallback to youtube search with parseTrackMeta
      const res = await invoke<string>('search_youtube', { query: `${artist} songs` });
      const lines = res.trim().split('\n').filter(Boolean);
      for (let i = 0; i < lines.length && i < 4; i++) {
        const parts = lines[i].split('====');
        const rawTitle = parts[0]?.trim() || '';
        const rawUploader = parts[1]?.trim() || artist;
        const duration = parts[2]?.trim() || '0:00';
        const id = parts[3]?.trim() || '';
        if (!id || id === 'NA') continue;
        const url = `https://youtube.com/watch?v=${id}`;
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          const meta = parseTrackMeta(rawTitle, rawUploader || artist);
          tracks.push({
            id: Date.now() + Math.floor(Math.random() * 1000000) + tracks.length,
            title: meta.title || rawTitle,
            artist: meta.artist || artist,
            duration: duration || '0:00',
            url,
            cover: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
            mediaType: 'music'
          });
        }
      }
    } catch {
      // ignore
    }
  }

  return tracks;
}
