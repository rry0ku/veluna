import React from 'react';
import { Play, Music, Heart, Download, X, MoreVertical } from 'lucide-react';
import { Track } from '../types';
import { getTrackGradient, parseTrackMeta, parseArtistParts, getTrackCoverUrl, handleThumbnailError } from '../utils';

export type TrackRowProps = {
  track: Track;
  index: number;
  showRemove?: boolean;
  onRemove?: () => void;
  isActive: boolean;
  isHovered: boolean;
  isLoadingTrack: boolean;
  isPlaying: boolean;
  isLiked: boolean;
  isDownloading: number;
  isSelected?: boolean;
  isMultiSelectActive?: boolean;
  onPlay: (e?: React.MouseEvent) => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onLike: () => void;
  onDownload: () => void;
  onCtx: (e: React.MouseEvent) => void;
  onSelectToggle?: (e: React.MouseEvent) => void;
  onArtistClick?: (artistName: string) => void;
};

export const TrackRow = React.memo(({
  track, index, showRemove, onRemove,
  isActive, isHovered, isLoadingTrack, isPlaying, isLiked, isDownloading,
  isSelected, isMultiSelectActive,
  onPlay, onHoverEnter, onHoverLeave, onLike, onDownload, onCtx, onSelectToggle, onArtistClick,
}: TrackRowProps) => (
  <div
    className={`v-track${isActive ? ' v-track--active' : ''}${isSelected ? ' v-track--selected' : ''}`}
    onClick={e => {
      if (e.shiftKey || e.ctrlKey || e.metaKey || (isMultiSelectActive && onSelectToggle)) {
        e.preventDefault();
        onSelectToggle?.(e);
      } else {
        onPlay(e);
      }
    }}
    onContextMenu={onCtx}
    onMouseEnter={onHoverEnter}
    onMouseLeave={onHoverLeave}
  >
    <div
      className="v-track__num"
      onClick={e => {
        if (onSelectToggle) {
          e.stopPropagation();
          onSelectToggle(e);
        }
      }}
    >
      {isSelected ? (
        <div style={{
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          background: 'var(--v-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      ) : isMultiSelectActive ? (
        <div style={{
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          border: '1.5px solid rgba(255, 255, 255, 0.25)',
          background: 'transparent',
          margin: '0 auto'
        }} />
      ) : isActive && isLoadingTrack ? (
        <svg width="14" height="14" viewBox="0 0 24 24" style={{animation:'spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite',margin:'0 auto',display:'block'}}>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(226,221,217,0.15)" strokeWidth="2.5"/>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="#e2ddd9" strokeWidth="2.5" strokeDasharray="53.4" strokeDashoffset="36" strokeLinecap="round"/>
        </svg>
      ) : isActive && isPlaying ? (
        <div style={{display:'flex',gap:'2px',alignItems:'flex-end',height:'14px',justifyContent:'center'}}>
          {[100,65,80].map((h,i) => <div key={i} style={{width:'2.5px',background:'var(--v-accent)',borderRadius:'1px',height:`${h}%`,animation:`barBounce ${0.7+i*0.12}s ease-in-out ${i*110}ms infinite`,transformOrigin:'bottom'}} />)}
        </div>
      ) : isHovered ? (
        <Play size={13} style={{fill:'#e2ddd9',color:'#e2ddd9',margin:'0 auto'}} />
      ) : (
        index + 1
      )}
    </div>
    <div className="v-track__art" style={{
      position: 'relative',
      background: getTrackGradient(track.title, track.artist),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <Music size={16} style={{position: 'absolute', color: 'rgba(255,255,255,0.25)'}} />
      {(() => {
        const coverSrc = getTrackCoverUrl(track);
        if (!coverSrc) return null;
        return (
          <img
            src={coverSrc}
            alt={track.title}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: typeof coverSrc === 'string' && (coverSrc.includes('ytimg.com') || coverSrc.includes('googleusercontent.com')) ? 'scale(1.35)' : 'none'
            }}
            onError={handleThumbnailError}
            loading="lazy"
            decoding="async"
          />
        );
      })()}
    </div>
    <div className="v-track__info">
      {(() => {
        const meta = parseTrackMeta(track.title, track.artist);
        const displayTitle = meta.title || track.title;
        const displayArtist = meta.artist;
        return (
          <>
            <div className="v-track__title">{displayTitle}</div>
            {displayArtist && (
              <div className="v-track__artist">
                {(() => {
                  const parts = parseArtistParts(displayArtist);
                  return parts.map((part, idx) => {
                    if (part.isSeparator) {
                      return (
                        <span key={idx} style={{ color: 'var(--v-fg3)', pointerEvents: 'none' }}>
                          {part.name}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={idx}
                        onClick={onArtistClick ? (e) => { e.stopPropagation(); onArtistClick(part.name); } : undefined}
                        style={onArtistClick ? { cursor: 'pointer', transition: 'color 0.12s' } : undefined}
                        title={onArtistClick ? `View ${part.name} profile` : undefined}
                        onMouseEnter={onArtistClick ? (e) => { e.currentTarget.style.color = 'var(--v-accent)'; e.currentTarget.style.textDecoration = 'underline'; } : undefined}
                        onMouseLeave={onArtistClick ? (e) => { e.currentTarget.style.color = 'var(--v-fg3)'; e.currentTarget.style.textDecoration = 'none'; } : undefined}
                      >
                        {part.name}
                      </span>
                    );
                  });
                })()}
              </div>
            )}
          </>
        );
      })()}
    </div>
    <div className="v-track__actions">
      <button className="v-track__btn" onClick={e => { e.stopPropagation(); onLike(); }}>
        <Heart size={13} style={isLiked?{color:'#e05555',fill:'#e05555'}:{color:'#5c5755'}}/>
      </button>
      <button
        className="v-track__btn"
        title={isDownloading > 0 && isDownloading < 100 ? `Downloading ${Math.round(isDownloading)}% (Click to cancel)` : "Download"}
        onClick={e => { e.stopPropagation(); onDownload(); }}
        style={isDownloading > 0 ? {display:'flex',alignItems:'center',gap:'3px'} : undefined}
      >
        {isDownloading > 0
          ? <>
              <span style={{fontSize:'10px',fontWeight:700,color:'#e2ddd9',fontVariantNumeric:'tabular-nums'}}>{Math.round(isDownloading)}%</span>
              <svg width="13" height="13" viewBox="0 0 14 14">
                <circle cx="7" cy="7" r="5.5" fill="none" stroke="#2a2727" strokeWidth="1.5"/>
                <circle cx="7" cy="7" r="5.5" fill="none" stroke="#9e9894" strokeWidth="1.5" strokeLinecap="round"
                  strokeDasharray={`${2*Math.PI*5.5}`}
                  strokeDashoffset={`${2*Math.PI*5.5*(1-Math.min(isDownloading,100)/100)}`}
                  style={{transformOrigin:'7px 7px',transform:'rotate(-90deg)',transition:'stroke-dashoffset 0.25s ease'}}
                />
                {isDownloading>=100&&<path d="M4.5 7l2 2 3-3" stroke="#9e9894" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>}
              </svg>
            </>
          : <Download size={13} />}
      </button>
      {showRemove && onRemove
        ? <button className="v-track__btn" style={{color:'#5c5755'}} onClick={e => { e.stopPropagation(); onRemove(); }}
            onMouseEnter={e=>(e.currentTarget.style.color='#b05555')} onMouseLeave={e=>(e.currentTarget.style.color='#5c5755')}>
            <X size={13} />
          </button>
        : <button className="v-track__btn" onClick={e => { e.stopPropagation(); onCtx(e); }}>
            <MoreVertical size={13} />
          </button>}
    </div>
    <span className="v-track__dur">{track.duration && track.duration !== '0:00' ? track.duration : '-'}</span>
  </div>
), (prev, next) => {
  return (
    prev.track.url === next.track.url &&
    prev.track.title === next.track.title &&
    prev.track.artist === next.track.artist &&
    prev.track.cover === next.track.cover &&
    prev.track.duration === next.track.duration &&
    prev.index === next.index &&
    prev.isActive === next.isActive &&
    prev.isHovered === next.isHovered &&
    prev.isLoadingTrack === next.isLoadingTrack &&
    prev.isPlaying === next.isPlaying &&
    prev.isLiked === next.isLiked &&
    prev.isDownloading === next.isDownloading &&
    prev.isSelected === next.isSelected &&
    prev.isMultiSelectActive === next.isMultiSelectActive &&
    prev.showRemove === next.showRemove
  );
});

export const TrackRowSkeleton = ({ index }: { index: number }) => (
  <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'8px 12px',animation:`fadeUpSm 0.18s cubic-bezier(0.2,0,0,1) ${index*40}ms both`}}>
    <div style={{width:'26px',height:'12px',background:'var(--v-bdr2)',borderRadius:'4px',flexShrink:0}} className="animate-pulse"/>
    <div style={{width:'42px',height:'42px',borderRadius:'8px',background:'var(--v-bdr2)',flexShrink:0}} className="animate-pulse"/>
    <div style={{flex:1,display:'flex',flexDirection:'column',gap:'6px'}}>
      <div style={{height:'11px',background:'var(--v-bdr2)',borderRadius:'3px',width:`${55+(index*13)%35}%`}} className="animate-pulse"/>
      <div style={{height:'9px',background:'var(--v-bdr2)',borderRadius:'3px',width:`${30+(index*7)%25}%`}} className="animate-pulse"/>
    </div>
  </div>
);
