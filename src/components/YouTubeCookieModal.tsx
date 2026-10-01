import React, { useState, useEffect } from 'react';
import { ExternalLink, CheckCircle2, AlertTriangle, Loader2, X, RefreshCw, Music, ListMusic } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';

export interface YouTubeAccount {
  id: string;
  name: string;
  handle?: string;
  avatar_url?: string;
  is_selected: boolean;
  page_id?: string;
  auth_user?: number;
}

export interface YouTubeAuthStatus {
  is_authenticated: boolean;
  active_account?: YouTubeAccount;
  accounts: YouTubeAccount[];
  cookie_count: number;
  last_synced?: number;
}

interface YouTubeCookieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLibrarySynced: (result: { liked_songs_count: number; playlists: any[] }) => void;
  showToast: (msg: string) => void;
}

export const YouTubeCookieModal: React.FC<YouTubeCookieModalProps> = ({
  isOpen,
  onClose,
  onLibrarySynced,
  showToast,
}) => {
  const [step, setStep] = useState<'paste' | 'syncing' | 'done'>('paste');
  const [cookieInput, setCookieInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [syncProgress, setSyncProgress] = useState<{
    stage: string;
    progress: number;
    message: string;
    current_item?: string;
    total_items: number;
    processed_items: number;
  }>({
    stage: '',
    progress: 0,
    message: 'Preparing library sync...',
    total_items: 0,
    processed_items: 0,
  });

  const [syncSummary, setSyncSummary] = useState<{
    likedCount: number;
    playlistCount: number;
  } | null>(null);

  // Listen to Tauri sync progress events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<any>('youtube_sync_progress', (event) => {
      if (event.payload) {
        setSyncProgress(event.payload);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('paste');
      setCookieInput('');
      setError(null);
      setIsLoading(false);
      setSyncSummary(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenYouTubeMusic = () => {
    openUrl('https://music.youtube.com').catch(() => {
      window.open('https://music.youtube.com', '_blank');
    });
  };

  const handleContinuePaste = async () => {
    const trimmed = cookieInput.trim();
    if (!trimmed) {
      setError('Please paste your Cookie request header first.');
      return;
    }

    // Client-side validation for essential auth cookies
    const hasSapisid =
      trimmed.includes('SAPISID') ||
      trimmed.includes('__Secure-3PAPISID') ||
      trimmed.includes('__Secure-1PAPISID') ||
      trimmed.includes('SID');

    if (!hasSapisid) {
      setError('Missing essential authentication cookies. Make sure to paste the full Cookie header including SAPISID or __Secure-3PAPISID.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const authStatus = await invoke<YouTubeAuthStatus>('save_youtube_cookies', {
        rawCookies: trimmed,
      });

      // Directly import from the current logged-in account without prompting
      const active = authStatus.active_account || authStatus.accounts?.[0];
      await startLibrarySync(active?.page_id || null, active?.auth_user ?? null);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to validate and save cookies.');
      setIsLoading(false);
    }
  };

  const startLibrarySync = async (pageId: string | null, authUser: number | null) => {
    setStep('syncing');
    setIsLoading(true);
    setSyncProgress({
      stage: 'initiating',
      progress: 5,
      message: 'Connecting to YouTube Music...',
      total_items: 0,
      processed_items: 0,
    });

    try {
      const result = await invoke<{
        liked_songs_count: number;
        playlists: any[];
      }>('sync_youtube_library', { pageId, authUser });

      onLibrarySynced({
        liked_songs_count: result.liked_songs_count || 0,
        playlists: result.playlists || [],
      });

      setSyncSummary({
        likedCount: result.liked_songs_count || 0,
        playlistCount: result.playlists?.length || 0,
      });

      setStep('done');
      setIsLoading(false);
      showToast(`Imported ${result.liked_songs_count} liked tracks & ${result.playlists?.length || 0} playlists!`);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to sync library.');
      setStep('paste');
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading && step !== 'syncing') {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: '560px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 80px)',
          borderRadius: '16px',
          background: '#141414',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.9), 0 0 1px 1px rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#f0ede8',
                margin: 0,
                lineHeight: 1.3,
                letterSpacing: '-0.01em',
              }}
            >
              {step === 'paste' && 'Paste your YouTube Music cookies to finish signing in'}
              {step === 'syncing' && 'Syncing Your Library'}
              {step === 'done' && 'Library Successfully Synced'}
            </h2>
          </div>
          {step !== 'syncing' && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: 'none',
                borderRadius: '8px',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#8e8884',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#8e8884';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '0 24px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {error && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#fca5a5',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                lineHeight: 1.4,
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: PASTE COOKIES */}
          {step === 'paste' && (
            <>
              {/* Open YouTube Music action button */}
              <button
                type="button"
                onClick={handleOpenYouTubeMusic}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#e2ddd9',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                }}
              >
                <ExternalLink size={16} />
                Open YouTube Music
              </button>

              {/* 4 Numbered Steps matching mockup */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#222222',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    1
                  </div>
                  <p style={{ margin: 0, fontSize: '13.5px', color: '#9e9894', lineHeight: 1.45 }}>
                    Open <strong style={{ color: '#e2ddd9' }}>music.youtube.com</strong> and make sure you are signed in. An incognito window works best.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#222222',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    2
                  </div>
                  <p style={{ margin: 0, fontSize: '13.5px', color: '#9e9894', lineHeight: 1.45 }}>
                    Press <strong style={{ color: '#e2ddd9' }}>F12</strong>, open the <strong style={{ color: '#e2ddd9' }}>Network</strong> tab and reload the page.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#222222',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    3
                  </div>
                  <p style={{ margin: 0, fontSize: '13.5px', color: '#9e9894', lineHeight: 1.45 }}>
                    Select any request named <strong style={{ color: '#e2ddd9' }}>"browse"</strong> or <strong style={{ color: '#e2ddd9' }}>"next"</strong>.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#222222',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    4
                  </div>
                  <p style={{ margin: 0, fontSize: '13.5px', color: '#9e9894', lineHeight: 1.45 }}>
                    In Headers, find <strong style={{ color: '#e2ddd9' }}>Cookie</strong> under Request Headers, right-click it and copy its value.
                  </p>
                </div>
              </div>

              {/* Tip Note */}
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '13px',
                  color: '#706a66',
                  fontStyle: 'normal',
                }}
              >
                Make sure to paste the whole value, including SAPISID and __Secure-3PAPISID.
              </p>

              {/* Textarea for cookie header */}
              <div style={{ position: 'relative' }}>
                <textarea
                  value={cookieInput}
                  onChange={(e) => setCookieInput(e.target.value)}
                  placeholder="Paste the Cookie request header here"
                  rows={4}
                  spellCheck={false}
                  autoFocus
                  style={{
                    width: '100%',
                    background: '#191919',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    fontSize: '13px',
                    color: '#f0ede8',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'monospace, sans-serif',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)';
                  }}
                />
              </div>

              {/* Footer actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: '#9e9894',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#9e9894';
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleContinuePaste}
                  disabled={isLoading || !cookieInput.trim()}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '24px',
                    border: 'none',
                    background: '#ffffff',
                    color: '#000000',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: isLoading || !cookieInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: isLoading || !cookieInput.trim() ? 0.35 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading && cookieInput.trim()) {
                      e.currentTarget.style.opacity = '0.9';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading && cookieInput.trim()) {
                      e.currentTarget.style.opacity = '1';
                    }
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Checking...
                    </>
                  ) : (
                    'Continue'
                  )}
                </button>
              </div>
            </>
          )}

          {/* STEP 2: SYNCING PROGRESS */}
          {step === 'syncing' && (
            <div
              style={{
                padding: '24px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  position: 'relative',
                }}
              >
                <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--v-accent, #ffffff)' }} />
              </div>

              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f0ede8', margin: '0 0 6px' }}>
                  {syncProgress.message}
                </h3>
                <p style={{ fontSize: '13px', color: '#7a7470', margin: 0 }}>
                  This may take a moment depending on the size of your library.
                </p>
              </div>

              {/* Progress bar */}
              <div
                style={{
                  width: '100%',
                  maxWidth: '420px',
                  height: '8px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  overflow: 'hidden',
                  marginTop: '8px',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, Math.max(5, syncProgress.progress))}%`,
                    background: 'var(--v-accent, #ffffff)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              <div style={{ fontSize: '12px', color: '#5e5855', fontWeight: 600 }}>
                {Math.round(syncProgress.progress)}% COMPLETE
              </div>
            </div>
          )}

          {/* STEP 4: COMPLETED */}
          {step === 'done' && (
            <div
              style={{
                padding: '20px 0 10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '18px',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4ade80',
                }}
              >
                <CheckCircle2 size={36} />
              </div>

              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#f0ede8', margin: '0 0 8px' }}>
                  YouTube Music Connected!
                </h3>
                <p style={{ fontSize: '13.5px', color: '#9e9894', margin: 0, maxWidth: '380px', lineHeight: 1.45 }}>
                  Your account is now authenticated and ready. All tracks and playlists have been imported into Veluna.
                </p>
              </div>

              {/* Stats badges */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                <div
                  style={{
                    padding: '12px 20px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <Music size={18} style={{ color: '#ffffff' }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#f0ede8' }}>
                      {syncSummary?.likedCount ?? 0}
                    </div>
                    <div style={{ fontSize: '11px', color: '#7a7470', fontWeight: 600 }}>LIKED MUSIC</div>
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px 20px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <ListMusic size={18} style={{ color: '#ffffff' }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#f0ede8' }}>
                      {syncSummary?.playlistCount ?? 0}
                    </div>
                    <div style={{ fontSize: '11px', color: '#7a7470', fontWeight: 600 }}>PLAYLISTS</div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                style={{
                  marginTop: '12px',
                  padding: '12px 32px',
                  borderRadius: '24px',
                  border: 'none',
                  background: '#ffffff',
                  color: '#000000',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
