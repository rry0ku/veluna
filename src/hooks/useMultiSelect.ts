import { useState, useCallback, useEffect, useRef } from 'react';
import { Track } from '../types';

export function useMultiSelect() {
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  const toggleSelect = useCallback((track: Track, index: number, e: React.MouseEvent, tracks: Track[]) => {
    e.stopPropagation();
    setSelectedUrls(prev => {
      const next = new Set(prev);

      if (e.shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        for (let i = start; i <= end; i++) {
          if (tracks[i]?.url) {
            next.add(tracks[i].url);
          }
        }
      } else {
        if (next.has(track.url)) {
          next.delete(track.url);
        } else {
          next.add(track.url);
        }
      }
      return next;
    });
    setLastSelectedIndex(index);
  }, [lastSelectedIndex]);

  const clearSelection = useCallback(() => {
    setSelectedUrls(new Set());
    setLastSelectedIndex(null);
  }, []);

  const selectedUrlsRef = useRef(selectedUrls);
  useEffect(() => {
    selectedUrlsRef.current = selectedUrls;
  }, [selectedUrls]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedUrlsRef.current.size > 0) {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  const selectAll = useCallback((tracks: Track[]) => {
    setSelectedUrls(new Set(tracks.map(t => t.url)));
  }, []);

  return {
    selectedUrls,
    isMultiSelectActive: selectedUrls.size > 0,
    toggleSelect,
    clearSelection,
    selectAll,
  };
}
