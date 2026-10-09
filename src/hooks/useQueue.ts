import { useState, useEffect, useRef, useCallback } from 'react';
import { Track } from '../types';
import { loadLS, saveLS } from '../utils';

export function useQueue(showToast?: (msg: string) => void) {
  const [queue, setQueueState] = useState<Track[]>(() => loadLS('vg_queue', []));
  const queueRef = useRef<Track[]>(queue);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [queuePulseKey, setQueuePulseKey] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    queueRef.current = queue;
    saveLS('vg_queue', queue);
  }, [queue]);

  const setQueue = useCallback((tracksOrUpdater: Track[] | ((prev: Track[]) => Track[])) => {
    setQueueState(prev => {
      const next = typeof tracksOrUpdater === 'function' ? tracksOrUpdater(prev) : tracksOrUpdater;
      queueRef.current = next;
      saveLS('vg_queue', next);
      return next;
    });
  }, []);

  const addToQueue = useCallback((tracks: Track | Track[], silent: boolean = false) => {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    if (!list.length) return;
    setQueue(prev => [...prev, ...list]);
    setQueuePulseKey(k => k + 1);
    if (!silent && showToast) {
      showToast(list.length === 1 ? 'Added to queue' : `Added ${list.length} tracks to queue`);
    }
  }, [setQueue, showToast]);

  const playNext = useCallback((track: Track) => {
    setQueue(prev => [track, ...prev]);
    setQueuePulseKey(k => k + 1);
    if (showToast) showToast('Playing next');
  }, [setQueue, showToast]);

  const removeFromQueue = useCallback((indexOrUrl: number | string) => {
    setQueue(prev => {
      if (typeof indexOrUrl === 'number') {
        return prev.filter((_, idx) => idx !== indexOrUrl);
      }
      const targetIdx = prev.findIndex(t => t.url === indexOrUrl);
      if (targetIdx === -1) return prev;
      return prev.filter((_, idx) => idx !== targetIdx);
    });
  }, [setQueue]);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setShowClearConfirm(false);
    if (showToast) showToast('Queue cleared');
  }, [setQueue, showToast]);

  const reorderQueue = useCallback((fromIdx: number, toIdx: number) => {
    setQueue(prev => {
      if (fromIdx < 0 || fromIdx >= prev.length || toIdx < 0 || toIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  }, [setQueue]);

  const dragQueueIdx = useRef<number | null>(null);
  const dragOverQueueIdxRef = useRef<number | null>(null);
  const [dragOverQueueIdx, setDragOverQueueIdx] = useState<number | null>(null);

  return {
    queue,
    setQueue,
    queueRef,
    isQueueOpen,
    setIsQueueOpen,
    queuePulseKey,
    setQueuePulseKey,
    showClearConfirm,
    setShowClearConfirm,
    dragQueueIdx,
    dragOverQueueIdx,
    setDragOverQueueIdx,
    dragOverQueueIdxRef,
    addToQueue,
    playNext,
    removeFromQueue,
    clearQueue,
    reorderQueue,
  };
}
