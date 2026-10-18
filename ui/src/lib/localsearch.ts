// Searching the music on this machine. Pure, so `localsearch.check.ts` can run it without a DOM.
//
// The whole local library is already in memory (`local` in `player.svelte.ts`), so this is a scan
// over an array, not a request, and it can run on every keystroke with no debounce. The one cost
// worth dodging is Svelte's: `local` is `$state`, so every `song.title` read goes through a proxy
// trap and registers a signal, which plan 029 measured at ~6ms per pass over 5,000 rows in V8
// (JavaScriptCore, which is what actually runs this, is slower). So the text is flattened into
// plain strings once per library change, and each keystroke scans those instead.
import type { BrowseItem, SongItem } from './api';

/** A list prepared for scanning: `name[i]` and `hay[i]` are the lowercased text of `items[i]`. */
export interface Indexed<T> {
	items: T[];
	/** The title alone, which is all the ranking looks at. */
	name: string[];
	/** Title plus everything else worth matching: artist and album, or the card's subtitle. */
	hay: string[];
}

export function indexSongs(songs: SongItem[]): Indexed<SongItem> {
	const items = songs.slice();
	const name: string[] = [];
	const hay: string[] = [];
	for (const s of items) {
		const title = (s.title ?? '').toLowerCase();
		name.push(title);
		hay.push(`${title} ${s.artists ?? ''} ${s.album ?? ''}`.toLowerCase());
	}
	return { items, name, hay };
}

export function indexCards(cards: BrowseItem[]): Indexed<BrowseItem> {
	const items = cards.slice();
	const name: string[] = [];
	const hay: string[] = [];
	for (const c of items) {
		const title = (c.title ?? '').toLowerCase();
		name.push(title);
		hay.push(`${title} ${c.subtitle ?? ''}`.toLowerCase());
	}
	return { items, name, hay };
}

/**
 * Everything matching `query`, best first.
 *
 * Every whitespace-separated term has to appear somewhere in the item, in any order, so "beatles
 * yellow" finds Yellow Submarine. Ranking is deliberately crude: the title being the query beats
 * the title starting with it, which beats the title containing it, which beats a match that was
 * only in the artist, album or subtitle. An empty query matches nothing, because the caller shows
 * the whole library for that.
 */
export function match<T>(ix: Indexed<T>, query: string): T[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const terms = q.split(/\s+/);
	const hits: { i: number; rank: number }[] = [];
	for (let i = 0; i < ix.hay.length; i++) {
		const hay = ix.hay[i];
		if (!terms.every((t) => hay.includes(t))) continue;
		const name = ix.name[i];
		hits.push({
			i,
			rank: name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3
		});
	}
	// Stable, so items of equal rank keep library order (artist, then album, then track number).
	hits.sort((a, b) => a.rank - b.rank);
	return hits.map((h) => ix.items[h.i]);
}
