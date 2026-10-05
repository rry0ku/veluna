import { useState, useEffect, useCallback } from 'react';
import { Playlist, Track } from '../types';
import { loadLS, saveLS, areTrackUrlsEqual } from '../utils';
import { dbSavePlaylist, dbDeletePlaylists, dbGetPlaylists } from '../services/db';

export const isProtectedPlaylist = (id: string) => id === 'p1';

export function usePlaylists(showToast?: (msg: string) => void) {
  const [playlists, setPlaylistsState] = useState<Playlist[]>(() =>
    loadLS('vg_playlists', [{ id: 'p1', name: 'Liked Songs', description: '', tracks: [] }])
  );
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [isPlaylistMultiSelect, setIsPlaylistMultiSelect] = useState<boolean>(false);
  const [playlistDeleteModal, setPlaylistDeleteModal] = useState<{ ids: string[]; names: string[] } | null>(null);
  const [playlistSearchQ, setPlaylistSearchQ] = useState('');
  const [playlistViewMode, setPlaylistViewMode] = useState<'grid' | 'list'>(() => loadLS('vg_playlistViewMode', 'grid'));

  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const [renamingPlaylist, setRenamingPlaylist] = useState<Playlist | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [renameDescVal, setRenameDescVal] = useState('');

  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);

  useEffect(() => {
    let active = true;
    dbGetPlaylists().then(dbPls => {
      if (!active || !dbPls || dbPls.length === 0) return;
      setPlaylistsState(prev => {
        const hasCustom = prev.some(p => p.id !== 'p1' || p.tracks.length > 0);
        if (!hasCustom) {
          return dbPls;
        }
        const dbMap = new Map(dbPls.map(p => [p.id, p]));
        const updated = prev.map(p => {
          const dbPl = dbMap.get(p.id);
          if (dbPl && dbPl.tracks.length > p.tracks.length) {
            return dbPl;
          }
          return p;
        });
        const existingIds = new Set(updated.map(p => p.id));
        for (const dbPl of dbPls) {
          if (!existingIds.has(dbPl.id)) {
            updated.push(dbPl);
          }
        }
        return updated;
      });
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    saveLS('vg_playlists', playlists);
    playlists.forEach(p => dbSavePlaylist(p));
  }, [playlists]);

  useEffect(() => {
    saveLS('vg_playlistViewMode', playlistViewMode);
  }, [playlistViewMode]);

  const setPlaylists = useCallback((playlistsOrUpdater: Playlist[] | ((prev: Playlist[]) => Playlist[])) => {
    setPlaylistsState(prev => {
      const next = typeof playlistsOrUpdater === 'function' ? playlistsOrUpdater(prev) : playlistsOrUpdater;
      return next;
    });
  }, []);

  const confirmCreatePlaylist = useCallback(() => {
    if (!newPlaylistName.trim()) return;
    const trimmedName = newPlaylistName.trim();
    const trimmedDesc = newPlaylistDesc.trim();
    setPlaylists(p => [
      ...p,
      { id: `p${Date.now()}`, name: trimmedName, description: trimmedDesc, tracks: [] }
    ]);
    setIsPlaylistModalOpen(false);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    if (showToast) showToast(`Playlist "${trimmedName}" created`);
  }, [newPlaylistName, newPlaylistDesc, setPlaylists, showToast]);

  const requestDeletePlaylist = useCallback((id: string) => {
    if (isProtectedPlaylist(id)) return;
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    setPlaylistDeleteModal({ ids: [id], names: [pl.name] });
  }, [playlists]);

  const requestDeleteSelectedPlaylists = useCallback(() => {
    const validIds = selectedPlaylistIds.filter(id => !isProtectedPlaylist(id));
    if (validIds.length === 0) return;
    const names = validIds.map(id => playlists.find(p => String(p.id) === String(id))?.name || 'Playlist');
    setPlaylistDeleteModal({ ids: validIds, names });
  }, [selectedPlaylistIds, playlists]);

  const confirmDeletePlaylist = useCallback(async () => {
    if (!playlistDeleteModal) return;
    const idsToDelete = playlistDeleteModal.ids.filter(id => !isProtectedPlaylist(id));
    if (!idsToDelete || idsToDelete.length === 0) {
      setPlaylistDeleteModal(null);
      return;
    }
    const idSet = new Set(idsToDelete.map(id => String(id)));
    setPlaylists(prev => {
      const updated = (prev || []).filter(x => x && !idSet.has(String(x.id)));
      // Ensure p1 (Liked Songs) is strictly preserved
      const p1 = prev.find(p => p.id === 'p1');
      if (p1 && !updated.some(p => p.id === 'p1')) {
        updated.unshift(p1);
      }
      saveLS('vg_playlists', updated);
      updated.forEach(p => dbSavePlaylist(p).catch(() => {}));
      return updated;
    });
    if (openPlaylistId && idSet.has(String(openPlaylistId))) {
      setOpenPlaylistId(null);
    }
    setSelectedPlaylistIds(prev => prev.filter(id => !idSet.has(String(id))));
    setIsPlaylistMultiSelect(false);
    const count = idsToDelete.length;
    setPlaylistDeleteModal(null);
    if (showToast) showToast(count === 1 ? 'Playlist deleted' : `${count} playlists deleted`);
    await dbDeletePlaylists(idsToDelete);
  }, [playlistDeleteModal, openPlaylistId, setPlaylists, showToast]);

  const confirmRenamePlaylist = useCallback(() => {
    if (!renameVal.trim() || !renamingPlaylist || isProtectedPlaylist(renamingPlaylist.id)) return;
    setPlaylists(p => p.map(x => x.id === renamingPlaylist.id ? { ...x, name: renameVal.trim(), description: renameDescVal.trim() } : x));
    setRenamingPlaylist(null);
    if (showToast) showToast('Playlist updated');
  }, [renameVal, renameDescVal, renamingPlaylist, setPlaylists, showToast]);

  const toggleLikeTrack = useCallback((t: Track) => {
    if (t.url?.startsWith('local://')) {
      if (showToast) showToast('Offline tracks cannot be added to Liked Songs');
      return;
    }
    setPlaylists(p => {
      const updated = p.map(x => {
        if (x.id !== 'p1') return x;
        const liked = x.tracks.some(y => areTrackUrlsEqual(y.url, t.url));
        const newTracks = liked
          ? x.tracks.filter(y => !areTrackUrlsEqual(y.url, t.url))
          : [...x.tracks, t];
        return { ...x, tracks: newTracks };
      });
      saveLS('vg_playlists', updated);
      const p1 = updated.find(x => x.id === 'p1');
      if (p1) dbSavePlaylist(p1).catch(() => {});
      return updated;
    });
  }, [setPlaylists, showToast]);

  const addTrackToPlaylist = useCallback((pid: string, t: Track) => {
    if (t.url?.startsWith('local://')) {
      if (showToast) showToast('Offline tracks cannot be added to playlists');
      return;
    }
    setPlaylists(p => p.map(x => {
      if (x.id !== pid) return x;
      if (x.tracks.some(y => y.url === t.url)) {
        if (showToast) showToast('Already in playlist');
        return x;
      }
      if (showToast) showToast(`Added to ${x.name}`);
      return { ...x, tracks: [...x.tracks, t] };
    }));
    setAddToPlaylistTrack(null);
  }, [setPlaylists, showToast]);

  const removeFromPlaylist = useCallback((pid: string, url: string) => {
    setPlaylists(p => p.map(x => x.id !== pid ? x : { ...x, tracks: x.tracks.filter(t => t.url !== url) }));
    if (showToast) showToast('Removed from playlist');
  }, [setPlaylists, showToast]);

  const handleCoverUpload = useCallback((pid: string) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = e => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) {
        const r = new FileReader();
        r.onload = ev => {
          const raw = ev.target?.result as string;
          if (!raw) return;
          const img = new Image();
          img.onload = () => {
            const maxDim = 512;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              const compressed = canvas.toDataURL('image/jpeg', 0.85);
              setPlaylists(p => p.map(x => x.id === pid ? { ...x, customCover: compressed } : x));
              if (showToast) showToast('Cover updated');
            } else {
              setPlaylists(p => p.map(x => x.id === pid ? { ...x, customCover: raw } : x));
              if (showToast) showToast('Cover updated');
            }
          };
          img.onerror = () => {
            setPlaylists(p => p.map(x => x.id === pid ? { ...x, customCover: raw } : x));
            if (showToast) showToast('Cover updated');
          };
          img.src = raw;
        };
        r.readAsDataURL(f);
      }
    };
    inp.click();
  }, [setPlaylists, showToast]);

  const removePlaylistCover = useCallback((pid: string) => {
    setPlaylists(p => p.map(x => x.id === pid ? { ...x, customCover: undefined } : x));
    if (showToast) showToast('Cover removed');
  }, [setPlaylists, showToast]);

  const isTrackLiked = useCallback((url: string) => {
    if (!url) return false;
    return playlists.find(p => p.id === 'p1')?.tracks.some(t => areTrackUrlsEqual(t.url, url)) || false;
  }, [playlists]);

  const reorderPlaylistTracks = useCallback((pid: string, fromIdx: number, toIdx: number) => {
    setPlaylists(p => p.map(x => {
      if (x.id !== pid) return x;
      if (fromIdx < 0 || fromIdx >= x.tracks.length || toIdx < 0 || toIdx >= x.tracks.length) return x;
      const next = [...x.tracks];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return { ...x, tracks: next };
    }));
  }, [setPlaylists]);

  const reorderPlaylists = useCallback((fromIdx: number, toIdx: number) => {
    setPlaylists(prev => {
      const custom = prev.filter(p => p.id !== 'p1');
      if (fromIdx < 0 || fromIdx >= custom.length || toIdx < 0 || toIdx >= custom.length) return prev;
      const next = [...custom];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      const liked = prev.find(p => p.id === 'p1');
      return liked ? [liked, ...next] : next;
    });
  }, [setPlaylists]);

  const saveQueueAsPlaylist = useCallback((queueTracks: Track[]) => {
    if (queueTracks.length === 0) return;
    const name = `Queue - ${new Date().toLocaleDateString()}`;
    const newPlaylist: Playlist = {
      id: `p${Date.now()}`,
      name,
      description: 'Saved from active queue',
      tracks: [...queueTracks]
    };
    setPlaylists(prev => [...prev, newPlaylist]);
    if (showToast) showToast('Queue saved as playlist');
  }, [setPlaylists, showToast]);

  return {
    playlists,
    setPlaylists,
    openPlaylistId,
    setOpenPlaylistId,
    selectedPlaylistIds,
    setSelectedPlaylistIds,
    isPlaylistMultiSelect,
    setIsPlaylistMultiSelect,
    playlistDeleteModal,
    setPlaylistDeleteModal,
    playlistSearchQ,
    setPlaylistSearchQ,
    playlistViewMode,
    setPlaylistViewMode,
    isPlaylistModalOpen,
    setIsPlaylistModalOpen,
    newPlaylistName,
    setNewPlaylistName,
    newPlaylistDesc,
    setNewPlaylistDesc,
    renamingPlaylist,
    setRenamingPlaylist,
    renameVal,
    setRenameVal,
    renameDescVal,
    setRenameDescVal,
    addToPlaylistTrack,
    setAddToPlaylistTrack,
    confirmCreatePlaylist,
    requestDeletePlaylist,
    requestDeleteSelectedPlaylists,
    confirmDeletePlaylist,
    confirmRenamePlaylist,
    toggleLikeTrack,
    addTrackToPlaylist,
    removeFromPlaylist,
    handleCoverUpload,
    removePlaylistCover,
    isTrackLiked,
    reorderPlaylistTracks,
    reorderPlaylists,
    saveQueueAsPlaylist,
  };
}
