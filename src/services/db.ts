import { invoke } from '@tauri-apps/api/core';
import { Playlist, Track, ListeningEvent } from '../types';
import { getTrackCoverUrl } from '../utils';

export interface DbTrackStat {
  url: string;
  title: string;
  artist: string;
  play_count: number;
  total_secs: number;
  first_seen: string;
  last_played: string;
}

export interface DbSearchResult {
  title: string;
  artist: string;
  album: string;
  path: string;
}

export async function dbSavePlaylist(playlist: Playlist): Promise<void> {
  try {
    const dbTracks = playlist.tracks.map((t, idx) => ({
      id: typeof t.id === 'number' ? t.id : idx,
      title: t.title || 'Unknown',
      artist: t.artist || '',
      duration: t.duration || '0:00',
      url: t.url || '',
      cover: getTrackCoverUrl(t),
      media_type: t.mediaType || 'music',
    }));

    await invoke('db_save_playlist', {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || '',
        custom_cover: playlist.customCover || null,
        tracks: dbTracks,
      },
    });
  } catch (err) {
    console.warn('Failed to save playlist to SQLite:', err);
  }
}

interface DbPlaylistTrackRaw {
  id: number | string;
  title?: string;
  artist?: string;
  duration?: string;
  url: string;
  cover?: string;
  media_type?: 'music' | 'video';
}

interface DbPlaylistRaw {
  id: string;
  name: string;
  description?: string;
  custom_cover?: string | null;
  tracks?: DbPlaylistTrackRaw[];
}

interface DbListeningEventRaw {
  url: string;
  played_at?: string;
  secs: number;
}

export async function dbGetPlaylists(): Promise<Playlist[]> {
  try {
    const res = await invoke<DbPlaylistRaw[]>('db_get_playlists');
    return res.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      customCover: p.custom_cover || undefined,
      tracks: (p.tracks || []).map((t, idx) => ({
        id: typeof t.id === 'number' ? t.id : (Number(t.id) || idx),
        title: t.title || 'Unknown',
        artist: t.artist || '',
        duration: t.duration || '0:00',
        url: t.url,
        cover: getTrackCoverUrl(t),
        mediaType: t.media_type || 'music',
      })),
    }));
  } catch (err) {
    console.warn('Failed to load playlists from SQLite:', err);
    return [];
  }
}

export async function dbDeletePlaylist(id: string): Promise<void> {
  return dbDeletePlaylists([id]);
}

export async function dbDeletePlaylists(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  try {
    await invoke('db_delete_playlists', { ids });
  } catch (err) {
    console.warn('Failed to delete playlists in SQLite:', err);
    // Fallback to sequential deletion if batch call fails
    for (const id of ids) {
      try {
        await invoke('db_delete_playlist', { id });
      } catch {}
    }
  }
}

export async function dbRecordPlayEvent(track: Track, secs: number): Promise<void> {
  try {
    if (!track.url) return;
    await invoke('db_record_play_event', {
      url: track.url,
      title: track.title || 'Unknown',
      artist: track.artist || '',
      secs: Math.round(secs),
    });
  } catch (err) {
    console.warn('Failed to record play event in SQLite:', err);
  }
}

export async function dbUpdateListeningTime(url: string, secs: number): Promise<void> {
  if (!url || secs <= 0) return;
  try {
    await invoke('db_update_listening_time', {
      url,
      secs: Math.round(secs),
    });
  } catch (err) {
    console.warn('Failed to update listening time in SQLite:', err);
  }
}

export async function dbGetListeningStats(): Promise<DbTrackStat[]> {
  try {
    return await invoke<DbTrackStat[]>('db_get_listening_stats');
  } catch (err) {
    console.warn('Failed to get stats from SQLite:', err);
    return [];
  }
}

export function parsePlayedAt(raw?: string): string {
  if (!raw) return new Date().toISOString();
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    const ms = num < 1e11 ? num * 1000 : num;
    return new Date(ms).toISOString();
  }
  return trimmed;
}

export async function dbGetListeningHistory(limit = 100): Promise<ListeningEvent[]> {
  try {
    const events = await invoke<DbListeningEventRaw[]>('db_get_listening_history', { limit });
    return events.map(e => ({
      url: e.url,
      playedAt: parsePlayedAt(e.played_at),
      secs: e.secs,
    }));
  } catch (err) {
    console.warn('Failed to get history from SQLite:', err);
    return [];
  }
}

export async function dbClearListeningStats(): Promise<void> {
  try {
    await invoke('db_clear_listening_stats');
  } catch (err) {
    console.warn('Failed to clear stats in SQLite:', err);
  }
}

export async function dbSearchLibrary(query: string): Promise<DbSearchResult[]> {
  try {
    return await invoke<DbSearchResult[]>('db_search_library', { query });
  } catch (err) {
    console.warn('FTS search failed in SQLite:', err);
    return [];
  }
}
