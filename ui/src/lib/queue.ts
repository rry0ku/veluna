// How the queue panel lays one flat queue out. Kept out of the component so it can be checked
// without a DOM (`queue.check.ts`).
import type { QueueState, SongItem } from './api';

export interface QueueRow {
	item: SongItem;
	/** video_id + occurrence, so `animate:flip` slides rows instead of recreating them. */
	key: string;
	/** Index in the backend queue: what play/remove act on, and what the row is numbered by. */
	i: number;
}

export interface QueueView {
	/** Everything up to autoplay's continuation, in play order: what was played or passed over,
	 *  the playing track, and what is queued after it. */
	rows: QueueRow[];
	/** Autoplay's continuation, from its first upcoming track on. Drawn under its own divider,
	 *  because that is the part the panel's Autoplay switch takes away. */
	autoplay: QueueRow[];
	/** Upcoming tracks added by hand ("Play next" / "Add to queue"): what Clear queue removes. */
	queued: number;
}

/**
 * The queue as one list, in the order it plays. No sections: the panel opens on the playing row
 * (highlighted) with what comes next directly under it, and what came before sits above it in its
 * real place, a scroll away. Splitting that into Earlier / History / Now playing / per-origin
 * blocks made a long playlist read like several lists, with the headings shifting on every track.
 *
 * Autoplay is the one split, and only ahead of the playing track: tracks autoplay brought in that
 * have already played are ordinary rows of what was played.
 */
export function queueView(q: QueueState): QueueView {
	const { items, currentIndex } = q;
	const seen = new Map<string, number>();
	const rows: QueueRow[] = [];
	const autoplay: QueueRow[] = [];
	let queued = 0;
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const occ = seen.get(item.video_id) ?? 0;
		seen.set(item.video_id, occ + 1);
		const upcoming = i > currentIndex;
		if (upcoming && (item.queued || item.queued_end)) queued++;
		// Once autoplay starts, the rest goes with it: a row dragged in among its tracks is still
		// drawn where it will play.
		const into = autoplay.length || (upcoming && item.autoplay) ? autoplay : rows;
		into.push({ item, key: `${item.video_id}:${occ}`, i });
	}
	return { rows, autoplay, queued };
}

/** What is left to play before autoplay takes over: tracks after the playing one, and their total
 *  length in seconds (rows with no readable duration count as zero). */
export function queueLeft(view: QueueView, currentIndex: number): { count: number; secs: number } {
	let count = 0;
	let secs = 0;
	for (const r of view.rows) {
		if (r.i <= currentIndex) continue;
		count++;
		secs += clockSecs(r.item.duration);
	}
	return { count, secs };
}

/** "3:45" or "1:02:03" in seconds; 0 for anything else. */
export function clockSecs(s: string | undefined): number {
	if (!s || !/^\d+(:\d{1,2}){1,2}$/.test(s)) return 0;
	return s.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** "1 hr 23 min" / "48 min" in the UI's language, rounded to the minute; '' under a minute.
 *  `locale` is a catalog id: `pt_BR` and `zh_Hant` need their hyphen back, or Intl throws. */
export function formatLeft(secs: number, locale: string): string {
	const mins = Math.round(secs / 60);
	if (mins < 1) return '';
	const tag = locale.replace('_', '-');
	const unit = (unit: string, n: number) =>
		new Intl.NumberFormat(tag, { style: 'unit', unit, unitDisplay: 'short' }).format(n);
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return [h && unit('hour', h), m && unit('minute', m)].filter(Boolean).join(' ');
}

/**
 * Where the list should scroll to after the play pointer moved from row `from` to row `to`, or
 * null to leave it alone. `rowTop` is where row 0 sits in the scroll content, px.
 *
 * The playing row keeps its place on screen: a track change scrolls the list by exactly the rows
 * the pointer moved, so what is up next stays where the eye already is. Only while the playing row
 * was in view, though. Someone scrolled off reading the far end of a playlist is not dragged back
 * to the top every three minutes.
 */
export function followPlaying(
	scrollTop: number,
	viewportPx: number,
	rowPx: number,
	rowTop: number,
	from: number,
	to: number
): number | null {
	if (from === to) return null;
	const y = rowTop + from * rowPx - scrollTop;
	if (y + rowPx <= 0 || y >= viewportPx) return null;
	return Math.max(0, scrollTop + (to - from) * rowPx);
}

/**
 * Drag-to-reorder: the backend index a row dragged from `from` must end up at, given it was dropped
 * *in front of* the row at `dropAt`. Dropping in front of a row below yourself lands one slot
 * earlier once you're out of the way, which is the off-by-one every hand-rolled DnD ships with.
 * `null` when the drop is a no-op (onto itself, or immediately after itself).
 */
export function moveTarget(from: number, dropAt: number): number | null {
	const to = dropAt > from ? dropAt - 1 : dropAt;
	return to === from ? null : to;
}

/**
 * Can this row be removed from the playlist it is playing out of (issue #270)? Three things have
 * to hold, and each one is load-bearing:
 *
 * - a playlist is what's playing (`sourceId`); a radio or a single song has nothing to edit;
 * - the row carries the `setVideoId` that identifies it *inside* that playlist. Only rows that
 *   came off a playlist page do, so a row added to the queue by hand, or one YouTube generated,
 *   is correctly left alone: YouTube needs that id to know which copy to drop;
 * - the saved-in index (`player.svelte.ts`, `savedIn.map`) lists the playlist for this song. It
 *   only ever indexes playlists the user owns, so this is the ownership check as well as the
 *   membership one, and it costs no round trip.
 */
export function removableFromPlaylist(
	song: SongItem,
	playlistId: string | null | undefined,
	savedIn: Record<string, string[]>
): boolean {
	if (!playlistId || !song.set_video_id) return false;
	return savedIn[song.video_id]?.includes(playlistId) ?? false;
}
