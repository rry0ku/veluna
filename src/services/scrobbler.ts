import { Track } from '../types';
import { md5 } from '../utils/md5';
import { cleanArtist } from '../utils';

export const DEFAULT_LASTFM_API_KEY = 'c102df081c7ff910f5451965eef83151';
export const DEFAULT_LASTFM_API_SECRET = '631b1c67e91404c0bc064c5145b23d9b';

export interface ScrobbleResult {
  success: boolean;
  error?: string;
}

export function sanitizeTrackInfo(track: Track): { artist: string; title: string; album?: string } {
  let rawTitle = (track.title || '').trim();
  let rawArtist = cleanArtist(track.artist || '').trim();

  if (!rawArtist && rawTitle.includes(' - ')) {
    const parts = rawTitle.split(' - ');
    if (parts.length >= 2) {
      rawArtist = parts[0].trim();
      rawTitle = parts.slice(1).join(' - ').trim();
    }
  }

  const cleanedTitle = rawTitle
    .replace(/\s*[\(\[](?:official\s*(?:video|audio|music\s*video|lyric\s*video|visualizer|hd|4k)?|music\s*video|lyric\s*video|lyrics|audio|visualizer|remastered|explicit|hd|4k)[\)\]]/gi, '')
    .replace(/\s*ft\.?\s+.*$/i, '')
    .trim();

  return {
    artist: rawArtist || 'Unknown Artist',
    title: cleanedTitle || rawTitle || 'Unknown Track',
    album: (track.album || '').trim() || undefined,
  };
}

function signLastFmParams(params: Record<string, string>, apiSecret: string): string {
  const keys = Object.keys(params).sort();
  let sigString = '';
  for (const k of keys) {
    if (k === 'format' || k === 'callback' || k === 'api_sig') continue;
    sigString += `${k}${params[k]}`;
  }
  sigString += apiSecret;
  return md5(sigString);
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

export async function getLastFmAuthToken(
  apiKey: string,
  apiSecret: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  const key = apiKey.trim();
  const secret = apiSecret.trim();

  if (!key) return { success: false, error: 'API Key is required' };
  if (!secret) return { success: false, error: 'API Secret is required' };

  const params: Record<string, string> = {
    method: 'auth.getToken',
    api_key: key,
  };
  params.api_sig = signLastFmParams(params, secret);
  params.format = 'json';

  try {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${query}`);
    const data = await res.json();
    if (data.token) {
      return { success: true, token: data.token };
    }
    return { success: false, error: data.message || `Last.fm error ${data.error}` };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Network error connecting to Last.fm') };
  }
}

export async function createLastFmSession(
  token: string,
  apiKey: string,
  apiSecret: string
): Promise<{ success: boolean; sessionKey?: string; username?: string; error?: string }> {
  const key = apiKey.trim();
  const secret = apiSecret.trim();

  if (!key || !secret) return { success: false, error: 'API Key and Secret are required' };

  const params: Record<string, string> = {
    method: 'auth.getSession',
    api_key: key,
    token: token.trim(),
  };
  params.api_sig = signLastFmParams(params, secret);
  params.format = 'json';

  try {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${query}`);
    const data = await res.json().catch(() => ({}));
    if (data.session?.key && data.session?.name) {
      return {
        success: true,
        sessionKey: data.session.key,
        username: data.session.name,
      };
    }
    if (data.error === 14 || data.error === 4) {
      return {
        success: false,
        error: 'Please click "Yes, allow access" in your browser window first.',
      };
    }
    return {
      success: false,
      error: data.message || 'Authorization not completed yet.',
    };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Network error connecting to Last.fm') };
  }
}

export async function validateLastFmCredentials(
  apiKey: string,
  apiSecret: string,
  username?: string
): Promise<{ valid: boolean; username?: string; token?: string; error?: string }> {
  const key = apiKey.trim();
  const secret = apiSecret.trim();
  const user = (username || '').trim();

  if (!key) return { valid: false, error: 'API Key cannot be empty' };
  if (!secret) return { valid: false, error: 'API Secret cannot be empty' };

  const params: Record<string, string> = {
    method: 'auth.getToken',
    api_key: key,
  };
  params.api_sig = signLastFmParams(params, secret);
  params.format = 'json';

  try {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${query}`);
    const data = await res.json();

    if (data.error) {
      return { valid: false, error: data.message || `Last.fm error ${data.error}` };
    }

    if (user) {
      try {
        const uRes = await fetch(
          `https://ws.audioscrobbler.com/2.0/?method=user.getInfo&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json`
        );
        const uData = await uRes.json();
        if (uData.user?.name) {
          return { valid: true, username: uData.user.name, token: data.token };
        } else if (uData.error) {
          return { valid: false, error: `User error: ${uData.message || 'User not found'}` };
        }
      } catch {
        return { valid: true, username: user, token: data.token };
      }
    }

    if (data.token) {
      return { valid: true, username: user || undefined, token: data.token };
    }

    return { valid: false, error: 'Failed to validate credentials' };
  } catch (err: unknown) {
    return { valid: false, error: getErrorMessage(err, 'Network error connecting to Last.fm') };
  }
}

export async function validateLastFmSession(
  sessionKey: string,
  apiKey: string = DEFAULT_LASTFM_API_KEY,
  apiSecret: string = DEFAULT_LASTFM_API_SECRET
): Promise<{ valid: boolean; username?: string; error?: string }> {
  const sk = sessionKey.trim();
  const key = (apiKey || DEFAULT_LASTFM_API_KEY).trim();
  const secret = (apiSecret || DEFAULT_LASTFM_API_SECRET).trim();

  if (!sk) return { valid: false, error: 'Session Key cannot be empty' };
  if (!key || !secret) return { valid: false, error: 'API Key and Secret are required' };

  const params: Record<string, string> = {
    method: 'user.getInfo',
    api_key: key,
    sk,
  };
  params.api_sig = signLastFmParams(params, secret);
  params.format = 'json';

  try {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${query}`);
    const data = await res.json();

    if (data.error) {
      return { valid: false, error: data.message || `Last.fm error code ${data.error}` };
    }

    if (data.user?.name) {
      return { valid: true, username: data.user.name };
    }
    return { valid: false, error: 'Invalid Last.fm session' };
  } catch (err: unknown) {
    return { valid: false, error: getErrorMessage(err, 'Network error connecting to Last.fm') };
  }
}

export async function submitLastFmNowPlaying(
  sessionKey: string,
  track: Track,
  durationSec: number,
  apiKey: string = DEFAULT_LASTFM_API_KEY,
  apiSecret: string = DEFAULT_LASTFM_API_SECRET
): Promise<ScrobbleResult> {
  const sk = (sessionKey || '').trim();
  const key = (apiKey || DEFAULT_LASTFM_API_KEY).trim();
  const secret = (apiSecret || DEFAULT_LASTFM_API_SECRET).trim();

  if (!key || !secret) return { success: false, error: 'Missing Last.fm credentials' };

  const { artist, title } = sanitizeTrackInfo(track);
  if (!artist || !title || artist === 'Unknown Artist') {
    return { success: false, error: 'Missing valid artist or track title' };
  }

  const params: Record<string, string> = {
    method: 'track.updateNowPlaying',
    api_key: key,
    artist,
    track: title,
  };

  if (sk) {
    params.sk = sk;
  }

  if (durationSec > 0) {
    params.duration = Math.round(durationSec).toString();
  }

  params.api_sig = signLastFmParams(params, secret);
  params.format = 'json';

  try {
    const res = await fetch('https://ws.audioscrobbler.com/2.0/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (data.error) {
      return { success: false, error: data.message || `Last.fm error code ${data.error}` };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Network error') };
  }
}

export async function submitLastFmScrobble(
  sessionKey: string,
  track: Track,
  durationSec: number,
  timestampUnixSec?: number,
  apiKey: string = DEFAULT_LASTFM_API_KEY,
  apiSecret: string = DEFAULT_LASTFM_API_SECRET
): Promise<ScrobbleResult> {
  const sk = (sessionKey || '').trim();
  const key = (apiKey || DEFAULT_LASTFM_API_KEY).trim();
  const secret = (apiSecret || DEFAULT_LASTFM_API_SECRET).trim();

  if (!key || !secret) return { success: false, error: 'Missing Last.fm credentials' };

  const { artist, title } = sanitizeTrackInfo(track);
  if (!artist || !title || artist === 'Unknown Artist') {
    return { success: false, error: 'Missing valid artist or track title' };
  }

  const timestamp = timestampUnixSec || Math.floor(Date.now() / 1000);

  const params: Record<string, string> = {
    method: 'track.scrobble',
    api_key: key,
    artist,
    track: title,
    timestamp: timestamp.toString(),
  };

  if (sk) {
    params.sk = sk;
  }

  if (durationSec > 0) {
    params.duration = Math.round(durationSec).toString();
  }

  params.api_sig = signLastFmParams(params, secret);
  params.format = 'json';

  try {
    const res = await fetch('https://ws.audioscrobbler.com/2.0/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (data.error) {
      return { success: false, error: data.message || `Last.fm error code ${data.error}` };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, 'Network error') };
  }
}
