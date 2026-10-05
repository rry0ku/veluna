import React from 'react';
import { Playlist } from '../types';
import { getPlaylistCovers, handleThumbnailError } from '../utils';

interface PlaylistCoverArtProps {
  playlist: Playlist | null | undefined;
  className?: string;
  style?: React.CSSProperties;
}

export const PlaylistCoverArt: React.FC<PlaylistCoverArtProps> = React.memo(({
  playlist,
  className,
  style,
}) => {
  if (!playlist) return null;
  const covers = getPlaylistCovers(playlist);

  if (covers.length >= 4) {
    return (
      <div
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          overflow: 'hidden',
          pointerEvents: 'none',
          ...style,
        }}
      >
        {covers.slice(0, 4).map((c, i) => (
          <div
            key={i}
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <img
              src={c}
              loading="lazy"
              decoding="async"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                transform: typeof c === 'string' && (c.includes('ytimg.com') || c.includes('googleusercontent.com')) ? 'scale(1.35)' : 'none',
              }}
              onError={handleThumbnailError}
              alt=""
            />
          </div>
        ))}
      </div>
    );
  }

  if (covers.length > 0) {
    return (
      <img
        src={covers[0]}
        loading="lazy"
        decoding="async"
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
          transform: typeof covers[0] === 'string' && (covers[0].includes('ytimg.com') || covers[0].includes('googleusercontent.com')) ? 'scale(1.35)' : 'none',
          ...style,
        }}
        onError={handleThumbnailError}
        alt=""
      />
    );
  }

  return null;
});
