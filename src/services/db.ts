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

export async function dbGetPlaylists(): Promise<Playlist[]> {
  try {
    const res = await invoke<any[]>('db_get_playlists');
    return res.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      customCover: p.custom_cover || undefined,
      tracks: (p.tracks || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
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
  try {
    await invoke('db_delete_playlist', { id });
  } catch (err) {
    console.warn('Failed to delete playlist in SQLite:', err);
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

export async function dbGetListeningStats(): Promise<DbTrackStat[]> {
  try {
    return await invoke<DbTrackStat[]>('db_get_listening_stats');
  } catch (err) {
    console.warn('Failed to get stats from SQLite:', err);
    return [];
  }
}

export async function dbGetListeningHistory(limit = 100): Promise<ListeningEvent[]> {
  try {
    const events = await invoke<any[]>('db_get_listening_history', { limit });
    return events.map(e => ({
      url: e.url,
      playedAt: e.played_at,
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
