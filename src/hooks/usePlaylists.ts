import { useState, useEffect, useCallback } from 'react';
import { Playlist, Track } from '../types';
import { loadLS, saveLS } from '../utils';
import { dbSavePlaylist, dbDeletePlaylist } from '../services/db';

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
    if (id === 'p1') return;
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    setPlaylistDeleteModal({ ids: [id], names: [pl.name] });
  }, [playlists]);

  const requestDeleteSelectedPlaylists = useCallback(() => {
    const validIds = selectedPlaylistIds.filter(id => id !== 'p1');
    if (validIds.length === 0) return;
    const names = playlists.filter(p => validIds.includes(p.id)).map(p => p.name);
    setPlaylistDeleteModal({ ids: validIds, names });
  }, [selectedPlaylistIds, playlists]);

  const confirmDeletePlaylist = useCallback(() => {
    if (!playlistDeleteModal) return;
    const idsToDelete = playlistDeleteModal.ids;
    setPlaylists(p => p.filter(x => !idsToDelete.includes(x.id)));
    idsToDelete.forEach(id => dbDeletePlaylist(id));
    if (openPlaylistId && idsToDelete.includes(openPlaylistId)) {
      setOpenPlaylistId(null);
    }
    setSelectedPlaylistIds(prev => prev.filter(id => !idsToDelete.includes(id)));
    if (idsToDelete.length > 1) {
      setIsPlaylistMultiSelect(false);
    }
    const count = idsToDelete.length;
    setPlaylistDeleteModal(null);
    if (showToast) showToast(count === 1 ? 'Playlist deleted' : `${count} playlists deleted`);
  }, [playlistDeleteModal, openPlaylistId, setPlaylists, showToast]);

  const confirmRenamePlaylist = useCallback(() => {
    if (!renameVal.trim() || !renamingPlaylist) return;
    setPlaylists(p => p.map(x => x.id === renamingPlaylist.id ? { ...x, name: renameVal.trim(), description: renameDescVal.trim() } : x));
    setRenamingPlaylist(null);
    if (showToast) showToast('Playlist updated');
  }, [renameVal, renameDescVal, renamingPlaylist, setPlaylists, showToast]);

  const toggleLikeTrack = useCallback((t: Track) => {
    if (t.url?.startsWith('local://')) {
      if (showToast) showToast('Offline tracks cannot be added to Liked Songs');
      return;
    }
    setPlaylists(p => p.map(x => {
      if (x.id !== 'p1') return x;
      const liked = x.tracks.some(y => y.url === t.url);
      return { ...x, tracks: liked ? x.tracks.filter(y => y.url !== t.url) : [...x.tracks, t] };
    }));
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
    inp.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(inp);
    inp.onchange = e => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) {
        const r = new FileReader();
        r.onload = ev => {
          const d = ev.target?.result as string;
          if (d) {
            setPlaylists(p => p.map(x => x.id === pid ? { ...x, customCover: d } : x));
            if (showToast) showToast('Cover updated');
          }
        };
        r.readAsDataURL(f);
      }
      inp.remove();
    };
    inp.oncancel = () => inp.remove();
    inp.click();
  }, [setPlaylists, showToast]);

  const isTrackLiked = useCallback((url: string) => {
    return playlists.find(p => p.id === 'p1')?.tracks.some(t => t.url === url) || false;
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
    isTrackLiked,
    reorderPlaylistTracks,
    reorderPlaylists,
    saveQueueAsPlaylist,
  };
}
