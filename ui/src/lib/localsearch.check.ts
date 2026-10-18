// Self-check for local search (`localsearch.ts`). Same deal as `sort.check.ts` — no test runner in
// `ui/`, node 22 runs TypeScript directly:
//
//     node --experimental-strip-types ui/src/lib/localsearch.check.ts
//
// Prints "ok" and exits 0, or throws on the first broken invariant. What this guards is what the
// search page depends on: every term has to be found somewhere (so a query that names artist and
// title still matches), matching is case-insensitive, and the title match sorts above the rest.
import type { BrowseItem, SongItem } from './api.ts';
import { indexCards, indexSongs, match } from './localsearch.ts';

function ok(cond: boolean, what: string): void {
	if (!cond) throw new Error(`FAIL: ${what}`);
}

const song = (video_id: string, title: string, artists: string, album?: string): SongItem =>
	({ video_id, title, artists, album }) as SongItem;

const songs = [
	song('a', 'Yellow Submarine', 'The Beatles', 'Revolver'),
	song('b', 'Submarine Blues', 'Yellow Dogs'),
	song('c', 'Something', 'The Beatles', 'Abbey Road'),
	song('d', 'yellow', 'Coldplay', 'Parachutes')
];
const ix = indexSongs(songs);
const ids = (list: SongItem[]) => list.map((s) => s.video_id).join('');

// --- what matches -----------------------------------------------------------------------------
ok(match(ix, '').length === 0, 'an empty query matches nothing');
ok(match(ix, '   ').length === 0, 'whitespace is an empty query');
ok(ids(match(ix, 'SUBMARINE')) === 'ba', 'matching ignores case (b ranks first: title prefix)');
ok(ids(match(ix, 'abbey')) === 'c', 'the album is searched');
ok(ids(match(ix, 'coldplay')) === 'd', 'the artist is searched');
// The whole point of splitting on whitespace: these two words are in different fields, and in the
// opposite order to the text, so a single `includes` of the raw query would find nothing.
ok(ids(match(ix, 'beatles yellow')) === 'a', 'every term has to match, in any order and field');
ok(match(ix, 'beatles coldplay').length === 0, 'a term that matches nothing rules the item out');
ok(match(ix, 'zzz').length === 0, 'no match is no rows, not every row');

// --- ranking ----------------------------------------------------------------------------------
// "yellow" is a whole title (d), the start of another (a), and an artist on a third (b).
ok(ids(match(ix, 'yellow')) === 'dab', 'exact title, then title prefix, then the rest');
ok(ids(match(ix, 'the beatles')) === 'ac', 'equal ranks keep library order');

// --- cards ------------------------------------------------------------------------------------
const card = (id: string, title: string, subtitle?: string): BrowseItem =>
	({ kind: 'album', id, title, subtitle }) as BrowseItem;
const cards = indexCards([card('1', 'Revolver', 'The Beatles'), card('2', 'Parachutes', 'Coldplay')]);
ok(match(cards, 'beatles').map((c) => c.id).join('') === '1', 'a card matches on its subtitle');

// --- the index is a plain snapshot --------------------------------------------------------------
// The page rebuilds it when the library changes; a stale index must not blow up on a shorter list.
const empty = indexSongs([]);
ok(match(empty, 'anything').length === 0, 'an empty library searches fine');
ok(indexSongs(songs).items.length === songs.length, 'every song is indexed');

console.log('ok');
