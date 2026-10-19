import * as api from './api';
import type { SongItem, DownloadProgress, DownloadRequest } from './api';
import { toast } from './player.svelte';
import { t } from './i18n.svelte';
import { open } from '@tauri-apps/plugin-dialog';

const STORAGE_QUALITY_KEY = 'veluna_download_quality';
const STORAGE_REMEMBER_KEY = 'veluna_download_remember';
const STORAGE_DIR_KEY = 'veluna_download_dir';

export interface QualityOption {
	id: string;
	title: string;
	desc: string;
	badge: string;
	ext: string;
}

export const QUALITY_OPTIONS: QualityOption[] = [
	{
		id: 'best_opus',
		title: 'Best Native (Opus ~160 kbps)',
		desc: 'Original YouTube audio stream bit-for-bit without quality loss. Excellent fidelity.',
		badge: 'Recommended',
		ext: '.opus'
	},
	{
		id: 'mp3_320',
		title: 'High Compatibility (MP3 320 kbps)',
		desc: 'Highest bitrate MP3 transcode. Plays on any car, stereo, or legacy device.',
		badge: 'MP3',
		ext: '.mp3'
	},
	{
		id: 'aac_native',
		title: 'AAC Native (M4A ~128–256 kbps)',
		desc: 'Native Apple/M4A format. Compatible with iOS, iTunes, and QuickTime.',
		badge: 'M4A',
		ext: '.m4a'
	},
	{
		id: 'mp3_192',
		title: 'Standard Quality (MP3 192 kbps)',
		desc: 'Balanced file size and sound quality for saving storage space.',
		badge: 'MP3',
		ext: '.mp3'
	},
	{
		id: 'flac',
		title: 'Lossless Container (FLAC)',
		desc: 'Lossless container transcode preserving full frequency range.',
		badge: 'FLAC',
		ext: '.flac'
	},
	{
		id: 'wav',
		title: 'Uncompressed PCM (WAV)',
		desc: 'Standard uncompressed 16-bit PCM waveform audio.',
		badge: 'WAV',
		ext: '.wav'
	}
];

class DownloadStore {
	items = $state<DownloadProgress[]>([]);
	dialogTrack = $state<SongItem | null>(null);
	dialogOpen = $state(false);
	selectedQuality = $state(
		(typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_QUALITY_KEY)) || 'best_opus'
	);
	rememberChoice = $state(
		(typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_REMEMBER_KEY) === 'true')
	);
	downloadDir = $state<string>(
		(typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_DIR_KEY)) || ''
	);

	get activeCount() {
		return this.items.filter(
			(d) => d.status === 'downloading' || d.status === 'transcoding' || d.status === 'tagging'
		).length;
	}

	constructor() {
		if (typeof window !== 'undefined') {
			this.init();
		}
	}

	private async init() {
		try {
			const active = await api.getActiveDownloads();
			if (active && active.length) {
				this.items = active;
			}
		} catch (e) {
			console.error('Failed to init active downloads', e);
		}

		if (!this.downloadDir) {
			try {
				const defaultDir = await api.getDefaultDownloadDir();
				if (defaultDir && !this.downloadDir) {
					this.downloadDir = defaultDir;
				}
			} catch (e) {
				console.error('Failed to get default download dir', e);
			}
		}

		api.onDownloadProgress((progress) => {
			const idx = this.items.findIndex((i) => i.id === progress.id);
			if (idx >= 0) {
				this.items[idx] = progress;
			} else {
				this.items.unshift(progress);
			}

			if (progress.status === 'completed') {
				toast.success(t('download.completed', { title: progress.title }));
			} else if (progress.status === 'failed') {
				toast.error(t('download.failed', { title: progress.title, error: progress.error ?? '' }));
			}
		});
	}

	async openDialog(track: SongItem) {
		this.dialogTrack = track;
		this.dialogOpen = true;
		if (!this.downloadDir) {
			try {
				const defaultDir = await api.getDefaultDownloadDir();
				if (defaultDir && !this.downloadDir) {
					this.downloadDir = defaultDir;
				}
			} catch (e) {
				console.error('Failed to get default download dir', e);
			}
		}
	}

	closeDialog() {
		this.dialogOpen = false;
		this.dialogTrack = null;
	}

	async pickFolder(): Promise<string | null> {
		try {
			const picked = await open({
				directory: true,
				multiple: false,
				title: t('download.select_folder_title'),
				defaultPath: this.downloadDir || undefined
			});
			if (typeof picked === 'string' && picked.trim()) {
				const folder = picked.trim();
				this.downloadDir = folder;
				localStorage.setItem(STORAGE_DIR_KEY, folder);
				return folder;
			}
		} catch (err) {
			console.error('Failed to pick directory', err);
		}
		return null;
	}

	async downloadTrack(track: SongItem, quality?: string) {
		const chosenQuality = quality || this.selectedQuality;
		if (this.rememberChoice) {
			localStorage.setItem(STORAGE_QUALITY_KEY, chosenQuality);
			localStorage.setItem(STORAGE_REMEMBER_KEY, 'true');
		}

		let targetDir = this.downloadDir;
		if (!targetDir) {
			try {
				targetDir = await api.getDefaultDownloadDir();
				if (targetDir) {
					this.downloadDir = targetDir;
				}
			} catch (e) {
				console.error('Failed to get default download dir', e);
			}
		}

		let durationSecs: number | undefined;
		if (track.duration) {
			const parts = track.duration.split(':').map((p) => parseInt(p, 10));
			if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
				durationSecs = parts[0] * 60 + parts[1];
			} else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
				durationSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
			}
		}

		const req: DownloadRequest = {
			video_id: track.video_id,
			title: track.title,
			artists: track.artists,
			album: track.album,
			thumbnail: track.thumbnail,
			duration_secs: durationSecs,
			quality: chosenQuality,
			output_dir: targetDir || undefined
		};

		try {
			await api.startDownload(req);
			toast.info(t('download.started', { title: track.title }));
		} catch (err) {
			toast.error(String(err));
		}
	}

	async cancel(id: string) {
		try {
			await api.cancelDownload(id);
		} catch (e) {
			console.error(e);
		}
	}

	openFolder(path?: string) {
		const p = path || this.downloadDir;
		api.openDownloadDir(p || undefined).catch(console.error);
	}
}

export const downloadManager = new DownloadStore();
