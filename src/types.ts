export type Track = {
  id: number;
  title: string;
  artist: string;
  duration: string;
  url: string;
  cover: string;
  album?: string;
  mediaType?: 'music' | 'video';
};

export type LocalTrack = {
  title: string;
  path: string;
  size_bytes: number;
  extension: string;
  artist?: string;
  album?: string;
  duration?: string;
  has_cover?: boolean;
  cover?: string;
};

export type ListeningEvent = {
  url: string;
  playedAt: string;
  secs: number;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  tracks: Track[];
  customCover?: string;
};

export type RepeatMode = 'off' | 'all' | 'one';

export type LyricLine = {
  time: number;
  text: string;
};

export type LyricsData = {
  lines: LyricLine[];
  title: string;
  artist: string;
};

export type CtxMenu = {
  x: number;
  y: number;
  type: 'track' | 'playlist' | 'sidebar-playlist' | 'queue-track' | 'quickpick' | 'local';
  track?: Track;
  playlist?: Playlist;
  localTracksList?: LocalTrack[];
  localTrackIndex?: number;
};

export type HistoryItem = {
  id: string;
  track: Track;
  playedAt: string;
};

export type NavView = 'home' | 'artists' | 'artist' | 'downloads' | 'playlists' | 'library' | 'stats' | 'history' | 'settings';

export type AudioInfo = { codec: string; bitrate: number; samplerate: number; channels: string; format: string; url: string };
export type DiskInfo = { used_bytes: number; track_count: number };
export type CacheInfo = { total_bytes: number; file_count: number; formatted_size: string; cache_dir: string };
export type ActiveDownload = {
  url: string;
  title: string;
  artist: string;
  cover?: string;
  progress: number;
  status: 'downloading' | 'completed' | 'error';
  error?: string;
  startedAt: number;
};
export type SettingsTab = 'playback' | 'appearance' | 'downloads' | 'integrations' | 'network' | 'storage' | 'updates';

export interface UserPreferences {
  languages: string[];
  genres: string[];
  artists: string[];
}

export interface FollowedArtist {
  name: string;
  avatar?: string;
  banner?: string;
  followedAt: string;
}

export interface ArtistPageData {
  name: string;
  avatar?: string;
  banner?: string;
  topTracks: Track[];
  relatedArtists?: string[];
}
