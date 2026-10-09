import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Check, ChevronRight, Music, Search, Sparkles, UserPlus, X, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { UserPreferences, Track } from '../types';
import { ONBOARDING_MUSIC_CATEGORIES, getStarterRecommendations } from '../constants';
import { cleanArtist, fetchArtistYouTubeTracks } from '../utils';

interface OnboardingModalProps {
  isOpen: boolean;
  initialPreferences?: UserPreferences;
  onComplete: (preferences: UserPreferences, recommendedTracks: Track[]) => void;
  onClose?: () => void;
}

interface LiveArtistResult {
  name: string;
  avatar: string;
  subtitle?: string;
  tracks: Track[];
}

const CategoryCard = React.memo(({
  cat,
  isSelected,
  onToggle
}: {
  cat: { id: string; label: string; subtitle: string };
  isSelected: boolean;
  onToggle: (id: string) => void;
}) => {
  return (
    <div
      onClick={() => onToggle(cat.id)}
      style={{
        padding: '12px 14px',
        borderRadius: '10px',
        background: isSelected ? 'rgba(var(--v-accent-rgb), 0.08)' : 'var(--v-bg2, #141212)',
        border: isSelected ? '1px solid var(--v-accent)' : '1px solid var(--v-bdr2)',
        cursor: 'pointer',
        transition: 'border-color 0.12s ease, background 0.12s ease',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        transform: 'translateZ(0)'
      }}
      onMouseEnter={e => {
        if (!isSelected) e.currentTarget.style.borderColor = 'var(--v-bdr3)';
      }}
      onMouseLeave={e => {
        if (!isSelected) e.currentTarget.style.borderColor = 'var(--v-bdr2)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13.5px', fontWeight: 600, color: isSelected ? 'var(--v-accent)' : 'var(--v-fg)' }}>
          {cat.label}
        </span>
        <div
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            border: isSelected ? '1px solid var(--v-accent)' : '1px solid var(--v-bdr2)',
            background: isSelected ? 'var(--v-accent)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#000',
            flexShrink: 0
          }}
        >
          {isSelected && <Check size={12} strokeWidth={3} />}
        </div>
      </div>
      <span style={{ fontSize: '11px', color: 'var(--v-fg3)', lineHeight: 1.3 }}>
        {cat.subtitle}
      </span>
    </div>
  );
});

const LANGUAGE_CATEGORY_IDS = new Set([
  'hindi',
  'punjabi',
  'kpop',
  'jpop',
  'latin',
  'afrobeats',
  'tamil',
  'telugu',
  'bengali',
  'sufi'
]);

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  initialPreferences,
  onComplete,
  onClose
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    if (initialPreferences?.languages?.length || initialPreferences?.genres?.length) {
      return Array.from(new Set([...(initialPreferences.languages || []), ...(initialPreferences.genres || [])]));
    }
    return [];
  });
  const [selectedArtists, setSelectedArtists] = useState<string[]>(() => {
    return initialPreferences?.artists || [];
  });
  const [artistSearch, setArtistSearch] = useState('');
  const [liveSearching, setLiveSearching] = useState(false);
  const [liveArtists, setLiveArtists] = useState<LiveArtistResult[]>([]);
  const artistTracksCacheRef = useRef<Map<string, Track[]>>(new Map());
  const activeQueryIdRef = useRef<number>(0);

  const prevIsOpenRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setStep(1);
      const initCats = Array.from(new Set([...(initialPreferences?.languages || []), ...(initialPreferences?.genres || [])]));
      setSelectedCategories(initCats);
      setSelectedArtists(initialPreferences?.artists || []);
      setArtistSearch('');
      setLiveArtists([]);
      setLiveSearching(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialPreferences]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleCategory = React.useCallback((id: string) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  }, []);

  const toggleArtist = (name: string, tracks?: Track[]) => {
    const raw = name.trim();
    if (!raw) return;
    const isSelected = selectedArtists.some(a => a.toLowerCase() === raw.toLowerCase());
    if (isSelected) {
      setSelectedArtists(prev => prev.filter(a => a.toLowerCase() !== raw.toLowerCase()));
    } else {
      setSelectedArtists(prev => [...prev, raw]);
      if (tracks && tracks.length > 0) {
        artistTracksCacheRef.current.set(raw.toLowerCase(), tracks);
      }
    }
  };

  const handleAddArtist = (name?: string, tracks?: Track[]) => {
    const raw = (name || artistSearch).trim();
    if (!raw) return;
    if (!selectedArtists.some(a => a.toLowerCase() === raw.toLowerCase())) {
      setSelectedArtists(prev => [...prev, raw]);
    }
    if (tracks && tracks.length > 0) {
      artistTracksCacheRef.current.set(raw.toLowerCase(), tracks);
    }
    setArtistSearch('');
    setLiveArtists([]);
  };

  useEffect(() => {
    const q = artistSearch.trim();
    if (q.length < 2) {
      setLiveArtists([]);
      setLiveSearching(false);
      return;
    }

    setLiveSearching(true);
    const queryId = ++activeQueryIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await invoke<string>('search_youtube', { query: `${q} songs` });
        if (activeQueryIdRef.current !== queryId) return;

        const lines = res.trim().split('\n').filter(Boolean);
        const artistMap = new Map<string, { displayName: string; avatar: string; tracks: Track[] }>();

        // 1. Add direct searched artist/channel
        if (lines.length > 0) {
          const firstParts = lines[0].split('====');
          const firstId = firstParts[3]?.trim();
          if (firstId && firstId !== 'NA') {
            artistMap.set(q.toLowerCase(), {
              displayName: q,
              avatar: `https://i.ytimg.com/vi/${firstId}/mqdefault.jpg`,
              tracks: []
            });
          }
        }

        // 2. Extract unique artists and their popular tracks
        lines.slice(0, 10).forEach((line, i) => {
          const parts = line.split('====');
          const title = parts[0]?.trim() || '';
          const artist = cleanArtist(parts[1]) || q;
          const duration = parts[2]?.trim() || '0:00';
          const id = parts[3]?.trim() || '';
          if (id && id !== 'NA') {
            const track: Track = {
              id: Date.now() + Math.floor(Math.random() * 1000000) + i,
              title,
              artist,
              duration,
              url: `https://youtube.com/watch?v=${id}`,
              cover: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
              mediaType: 'music'
            };

            const key = artist.toLowerCase();
            if (!artistMap.has(key)) {
              artistMap.set(key, {
                displayName: artist,
                avatar: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
                tracks: [track]
              });
            } else {
              artistMap.get(key)!.tracks.push(track);
            }

            if (artistMap.has(q.toLowerCase())) {
              artistMap.get(q.toLowerCase())!.tracks.push(track);
            }
          }
        });

        const results: LiveArtistResult[] = [];
        artistMap.forEach((val) => {
          results.push({
            name: val.displayName,
            avatar: val.avatar,
            subtitle: 'YouTube Artist / Channel',
            tracks: val.tracks
          });
        });

        if (activeQueryIdRef.current === queryId) {
          setLiveArtists(results);
        }
      } catch {
        if (activeQueryIdRef.current === queryId) {
          setLiveArtists([]);
        }
      } finally {
        if (activeQueryIdRef.current === queryId) {
          setLiveSearching(false);
        }
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [artistSearch]);

  const availableArtists = useMemo(() => {
    const list: string[] = [];
    const chosen = new Set(selectedCategories);
    ONBOARDING_MUSIC_CATEGORIES.forEach(cat => {
      if (chosen.has(cat.id)) {
        list.push(...cat.artists);
      }
    });

    if (list.length === 0) {
      ONBOARDING_MUSIC_CATEGORIES.forEach(cat => list.push(...cat.artists));
    }

    const unique = Array.from(new Set(list));
    if (!artistSearch.trim()) return unique;
    const q = artistSearch.toLowerCase();
    return unique.filter(a => a.toLowerCase().includes(q));
  }, [selectedCategories, artistSearch]);

  const [isFinishing, setIsFinishing] = useState(false);

  const handleFinish = async () => {
    setIsFinishing(true);
    const languages: string[] = [];
    const genres: string[] = [];

    selectedCategories.forEach(catId => {
      if (LANGUAGE_CATEGORY_IDS.has(catId)) {
        languages.push(catId);
      } else {
        genres.push(catId);
      }
    });

    const prefs: UserPreferences = {
      languages,
      genres,
      artists: selectedArtists
    };

    const starterTracks = getStarterRecommendations(prefs) as Track[];
    const liveTracksPool: Track[] = [];

    selectedArtists.forEach(art => {
      const cached = artistTracksCacheRef.current.get(art.toLowerCase());
      if (cached && cached.length > 0) {
        liveTracksPool.push(...cached);
      }
    });

    if (selectedArtists.length > 0 && liveTracksPool.length < 8) {
      try {
        const fetched = await fetchArtistYouTubeTracks(selectedArtists);
        liveTracksPool.push(...fetched);
      } catch {}
    }

    const seenUrls = new Set<string>();
    const mergedTracks: Track[] = [];

    liveTracksPool.forEach(t => {
      if (!seenUrls.has(t.url)) {
        seenUrls.add(t.url);
        mergedTracks.push(t);
      }
    });

    starterTracks.forEach(t => {
      if (!seenUrls.has(t.url)) {
        seenUrls.add(t.url);
        mergedTracks.push(t);
      }
    });

    setIsFinishing(false);
    onComplete(prefs, mergedTracks.slice(0, 15));
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          background: 'var(--v-bg1, #0c0b0b)',
          border: '1px solid var(--v-bdr2)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--v-bdr2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--v-bg2, #141212)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Sparkles size={20} style={{ color: 'var(--v-accent)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--v-fg)' }}>
                {step === 1 ? 'Personalize Your Music Experience' : 'Select Your Favorite Artists'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--v-fg3)', marginTop: '2px' }}>
                {step === 1 ? 'Step 1 of 2: Languages & Genres' : 'Step 2 of 2: Artists & Tailored Feed'}
              </div>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--v-fg3)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--v-fg)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--v-fg3)'; }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {step === 1 && (
          <div
            style={{
              padding: '24px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ fontSize: '13px', color: 'var(--v-fg2)', lineHeight: 1.5 }}>
              What music do you listen to? Pick the categories that match your taste so we can generate instant recommendations for your home feed.
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '10px'
              }}
            >
              {ONBOARDING_MUSIC_CATEGORIES.map(cat => (
                <CategoryCard
                  key={cat.id}
                  cat={cat}
                  isSelected={selectedCategories.includes(cat.id)}
                  onToggle={toggleCategory}
                />
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div
            style={{
              padding: '24px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ fontSize: '13px', color: 'var(--v-fg2)', lineHeight: 1.5 }}>
              Search any artist on YouTube or select from the recommendations below. You can search and add multiple artists.
            </div>

            {/* Single Unified Artist Search Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--v-bg2, #141212)',
                border: '1px solid var(--v-bdr2)',
                borderRadius: '10px',
                padding: '6px 8px 6px 14px',
              }}
            >
              {liveSearching ? (
                <Loader2 size={16} style={{ color: 'var(--v-accent)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
              ) : (
                <Search size={16} style={{ color: 'var(--v-fg3)', flexShrink: 0 }} />
              )}
              <input
                type="text"
                value={artistSearch}
                onChange={e => setArtistSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && artistSearch.trim()) {
                    const matched = liveArtists.find(a => a.name.toLowerCase() === artistSearch.trim().toLowerCase());
                    handleAddArtist(artistSearch.trim(), matched?.tracks || liveArtists[0]?.tracks);
                  }
                }}
                placeholder="Search any artist..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--v-fg)',
                  fontSize: '13px'
                }}
              />
              {artistSearch && (
                <button
                  onClick={() => { setArtistSearch(''); setLiveArtists([]); }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--v-fg3)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--v-fg)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--v-fg3)'; }}
                >
                  <X size={14} />
                </button>
              )}
              {artistSearch.trim() && (
                <button
                  onClick={() => {
                    const matched = liveArtists.find(a => a.name.toLowerCase() === artistSearch.trim().toLowerCase());
                    handleAddArtist(artistSearch.trim(), matched?.tracks || liveArtists[0]?.tracks);
                  }}
                  style={{
                    background: 'var(--v-accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <UserPlus size={13} strokeWidth={2.5} />
                  Add Artist
                </button>
              )}
            </div>

            {/* Live YouTube Artists & Channels Section */}
            {liveArtists.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--v-accent)' }}>
                  Results
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '8px',
                    maxHeight: '180px',
                    overflowY: 'auto'
                  }}
                >
                  {liveArtists.map((art) => {
                    const isSelected = selectedArtists.some(a => a.toLowerCase() === art.name.toLowerCase());
                    return (
                      <div
                        key={art.name}
                        onClick={() => toggleArtist(art.name, art.tracks)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          background: isSelected ? 'rgba(var(--v-accent-rgb), 0.08)' : 'var(--v-bg2, #141212)',
                          border: isSelected ? '1px solid var(--v-accent)' : '1px solid var(--v-bdr2)',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = 'var(--v-bdr3)';
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = 'var(--v-bdr2)';
                            e.currentTarget.style.background = 'var(--v-bg2, #141212)';
                          }
                        }}
                      >
                        <img
                          src={art.avatar}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={e => { e.currentTarget.style.display = 'none'; }}
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: isSelected ? '2px solid var(--v-accent)' : '1px solid var(--v-bdr2)',
                            flexShrink: 0
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? 'var(--v-accent)' : 'var(--v-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {art.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--v-fg3)', marginTop: '1px' }}>
                            {art.subtitle || 'Artist / Channel'}
                          </div>
                        </div>
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: isSelected ? 'var(--v-accent)' : 'var(--v-bdr2)',
                            color: isSelected ? '#000' : 'var(--v-fg3)',
                            flexShrink: 0
                          }}
                        >
                          {isSelected ? (
                            <Check size={13} strokeWidth={3} />
                          ) : (
                            <UserPlus size={13} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected Artists Counter & Badges */}
            {selectedArtists.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--v-fg3)', marginRight: '4px' }}>
                  Selected ({selectedArtists.length}):
                </span>
                {selectedArtists.map(artist => (
                  <span
                    key={artist}
                    onClick={() => toggleArtist(artist)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(var(--v-accent-rgb), 0.12)',
                      border: '1px solid rgba(var(--v-accent-rgb), 0.3)',
                      color: 'var(--v-accent)',
                      borderRadius: '9999px',
                      padding: '3px 10px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {artist}
                    <X size={12} />
                  </span>
                ))}
              </div>
            )}

            {/* Available & Suggested Artists Grid */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                maxHeight: '220px',
                overflowY: 'auto',
                paddingRight: '4px'
              }}
            >
              {artistSearch.trim() && !selectedArtists.some(a => a.toLowerCase() === artistSearch.trim().toLowerCase()) && !availableArtists.some(a => a.toLowerCase() === artistSearch.trim().toLowerCase()) && (
                <button
                  onClick={() => {
                    const matched = liveArtists.find(a => a.name.toLowerCase() === artistSearch.trim().toLowerCase());
                    handleAddArtist(artistSearch.trim(), matched?.tracks || liveArtists[0]?.tracks);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(var(--v-accent-rgb), 0.12)',
                    border: '1px dashed var(--v-accent)',
                    color: 'var(--v-accent)',
                    borderRadius: '9999px',
                    padding: '6px 14px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <UserPlus size={13} strokeWidth={2.5} />
                  Add "{artistSearch.trim()}" (Search YouTube)
                </button>
              )}

              {availableArtists.map(artist => {
                const isSelected = selectedArtists.some(a => a.toLowerCase() === artist.toLowerCase());
                return (
                  <button
                    key={artist}
                    onClick={() => toggleArtist(artist)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: isSelected ? 'rgba(var(--v-accent-rgb), 0.1)' : 'var(--v-bg2, #141212)',
                      border: isSelected ? '1px solid var(--v-accent)' : '1px solid var(--v-bdr2)',
                      color: isSelected ? 'var(--v-accent)' : 'var(--v-fg2)',
                      borderRadius: '9999px',
                      padding: '6px 14px',
                      fontSize: '12.5px',
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.12s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        e.currentTarget.style.color = 'var(--v-fg)';
                        e.currentTarget.style.borderColor = 'var(--v-bdr3)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) {
                        e.currentTarget.style.color = 'var(--v-fg2)';
                        e.currentTarget.style.borderColor = 'var(--v-bdr2)';
                      }
                    }}
                  >
                    {isSelected && <Check size={13} strokeWidth={2.5} />}
                    {artist}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--v-bdr2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--v-bg2, #141212)'
          }}
        >
          {step === 1 ? (
            <div style={{ fontSize: '12px', color: 'var(--v-fg3)' }}>
              {selectedCategories.length} categories selected
            </div>
          ) : (
            <button
              onClick={() => setStep(1)}
              style={{
                background: 'transparent',
                border: '1px solid var(--v-bdr2)',
                borderRadius: '8px',
                color: 'var(--v-fg2)',
                padding: '8px 16px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Back
            </button>
          )}

          {step === 1 ? (
            <button
              disabled={selectedCategories.length === 0}
              onClick={() => setStep(2)}
              style={{
                background: selectedCategories.length === 0 ? 'var(--v-bdr)' : 'var(--v-accent)',
                color: selectedCategories.length === 0 ? 'var(--v-fg3)' : '#000',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 20px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: selectedCategories.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              Next: Select Artists
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={isFinishing}
              style={{
                background: 'var(--v-accent)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 22px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isFinishing ? 'wait' : 'pointer',
                opacity: isFinishing ? 0.8 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
                boxShadow: '0 0 12px rgba(var(--v-accent-rgb), 0.25)'
              }}
            >
              {isFinishing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Building Your Mix...
                </>
              ) : (
                <>
                  <Music size={15} strokeWidth={2.5} />
                  Start Listening
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
