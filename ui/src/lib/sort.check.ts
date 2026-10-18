// Self-check for playlist sorting (`sort.ts`). Same deal as `rows.check.ts` — no test runner in
// `ui/`, node 22 runs TypeScript directly:
//
//     node --experimental-strip-types ui/src/lib/sort.check.ts
//
// Prints "ok" and exits 0, or throws on the first broken invariant. What this guards is the part
// the queue depends on: the sorted list has to hold exactly the same tracks as the input (never
// dropping or duplicating one), and `default` has to hand back the original array untouched.
import type { SongItem } from './api.ts';
import { fetchSort, persistedSort, sortSongs, storedExactly } from './sort.ts';

function ok(cond: boolean, what: string): void {
	if (!cond) throw new Error(`FAIL: ${what}`);
}

const song = (video_id: string, title: string, artists: string, album?: string): SongItem =>
	({ video_id, title, artists, album }) as SongItem;

// Deliberately messy: mixed case, a numeric run, a missing album, two tracks that tie on artist.
const items = [
	song('a', 'Zebra', 'beta', 'Second'),
	song('b', 'track 10', 'Alpha', 'First'),
	song('c', 'track 9', 'Alpha'),
	song('d', 'apple', 'Gamma', 'First')
];
const ids = (list: SongItem[]) => list.map((t) => t.video_id).join('');

// --- default is a no-op, identity included ---------------------------------------------------
ok(sortSongs(items, 'default', false) === items, 'default returns the very same array');
ok(sortSongs(items.slice(0, 1), 'title', false).length === 1, 'a one-track list survives');

// --- nothing is lost or duplicated ------------------------------------------------------------
// The queue is built from this list, so a comparator that drops a track silently shortens it.
for (const key of ['default', 'newest', 'oldest', 'title', 'artist', 'album', 'plays', 'top'] as const) {
	for (const desc of [false, true]) {
		const out = sortSongs(items, key, false, desc, { b: 4, d: 1 });
		ok(out.length === items.length, `${key} desc=${desc} keeps every track`);
		ok(
			[...out].map((t) => t.video_id).sort().join('') === 'abcd',
			`${key} desc=${desc} is a permutation, no dupes`
		);
	}
}
// Sorting in place would reorder `pl.items` itself, and the page relies on that staying YouTube's
// order (it is what Default and the setVideoId backfill both read).
ok(ids(items) === 'abcd', 'the input array is still in playlist order afterwards');

// --- add order --------------------------------------------------------------------------------
// A normal playlist arrives oldest-added first, so newest-first is the reverse and oldest-first is
// the order as given. Liked Music arrives the other way round and both flip with it.
ok(ids(sortSongs(items, 'oldest', false)) === 'abcd', 'oldest-first on an oldest-first list');
ok(ids(sortSongs(items, 'newest', false)) === 'dcba', 'newest-first reverses it');
ok(ids(sortSongs(items, 'newest', true)) === 'abcd', 'newest-first on Liked Music');
ok(ids(sortSongs(items, 'oldest', true)) === 'dcba', 'oldest-first reverses Liked Music');

// --- title: case-insensitive, and "10" after "9" ----------------------------------------------
ok(ids(sortSongs(items, 'title', false)) === 'dcba', 'title sorts apple, track 9, track 10, Zebra');

// --- artist: case-insensitive, title orders the group -----------------------------------------
// b and c are both "Alpha", so the title tiebreak decides: "track 9" before "track 10".
ok(ids(sortSongs(items, 'artist', false)) === 'cbad', 'artist groups, title orders inside a group');

// Equal on both keys: nothing left to compare, so playlist order survives.
const tied = [song('x', 'Same', 'Alpha'), song('y', 'Same', 'Alpha')];
ok(ids(sortSongs(tied, 'artist', false)) === 'xy', 'a total tie keeps playlist order');

// --- album: groups, keeps playlist order inside a group, albumless last -----------------------
// b and d are both on "First"; b is first in the playlist, so it stays first (no title tiebreak
// here, or an album added in one go would come back alphabetised instead of in track order).
ok(ids(sortSongs(items, 'album', false)) === 'bdac', 'album groups First, Second, then no album');

// --- descending reverses the key, and only the key ---------------------------------------------
ok(ids(sortSongs(items, 'default', false, true)) === 'dcba', 'default descending reverses the list');
ok(ids(sortSongs(items, 'newest', false, true)) === 'abcd', 'newest descending is oldest first');
ok(ids(sortSongs(items, 'oldest', true, true)) === 'abcd', 'oldest descending on Liked Music');
ok(ids(sortSongs(items, 'title', false, true)) === 'abcd', 'title descending is Z to A');
// The Alpha pair flips with everything else, tiebreak included: "track 10" then "track 9".
ok(ids(sortSongs(items, 'artist', false, true)) === 'dabc', 'artist descending flips the tiebreak');
// The album groups reverse, but "First" keeps b before d — a descending sort is still not a
// reason to play an album backwards. And an albumless track stays last, it does not lead.
ok(ids(sortSongs(items, 'album', false, true)) === 'abdc', 'album descending, albumless still last');
ok(ids(sortSongs(tied, 'artist', false, true)) === 'xy', 'a total tie keeps playlist order either way');

// --- most played: local history, missing means zero --------------------------------------------
// b played 4 times, d once, a and c never — and the two unplayed keep playlist order between them.
const counts = { b: 4, d: 1 };
ok(ids(sortSongs(items, 'plays', false, false, counts)) === 'bdac', 'most played leads');
ok(ids(sortSongs(items, 'plays', false, true, counts)) === 'acdb', 'descending is least played');
ok(ids(sortSongs(items, 'plays', false, false, {})) === 'abcd', 'no history at all changes nothing');
// A count for a track that is not in this playlist must not disturb the ones that are.
ok(ids(sortSongs(items, 'plays', false, false, { zzz: 99, b: 4, d: 1 })) === 'bdac', 'stray ids ignored');

// --- top voted has no local form ---------------------------------------------------------------
// It only ever arrives from YouTube. Sorting rows by it here would have to invent a ranking, so it
// falls back to leaving them alone rather than ordering by whatever the last branch happened to be.
ok(sortSongs(items, 'top', false) === items, 'top voted is a no-op off the server');
ok(ids(sortSongs(items, 'top', false, true)) === 'dcba', 'top voted still reverses');

// --- what YouTube will store -------------------------------------------------------------------
// A `null` where YouTube could have kept the sort means it silently stops carrying to YouTube
// Music, which is the whole point of storing it.
ok(persistedSort('plays', false) === null, 'play counts mean nothing to YouTube');
ok(persistedSort('default', false) === 'default', 'manual order is storable');
// Date is already directional, so reversing one date sort simply is the other one.
ok(persistedSort('newest', false) === 'newest', 'newest stores as newest');
ok(persistedSort('newest', true) === 'oldest', 'reversed newest stores as oldest');
ok(persistedSort('oldest', true) === 'newest', 'reversed oldest stores as newest');
// playlistDynamicSortPreference takes 1..3 and nothing else, so a reversed one stores the
// ascending sort: YouTube Music shows the same sort the right way up rather than an unrelated one.
for (const key of ['default', 'title', 'artist', 'album'] as const) {
	ok(persistedSort(key, false) === key, `${key} ascending is storable`);
	ok(persistedSort(key, true) === key, `${key} descending stores the ascending sort`);
}

// --- and what it will reproduce exactly ---------------------------------------------------------
// Anything false here has to be remembered on this machine, or revisiting the page loses it.
ok(!storedExactly('plays', false), 'most played is never YouTube-held');
ok(storedExactly('default', false) && storedExactly('title', false), 'ascending sorts are exact');
ok(storedExactly('newest', true) && storedExactly('oldest', true), 'a reversed date sort is exact');
for (const key of ['default', 'title', 'artist', 'album'] as const) {
	ok(!storedExactly(key, true), `${key} descending has to be remembered here`);
}

// --- what to ask YouTube for -------------------------------------------------------------------
ok(fetchSort('plays') === 'default', 'most played ranks the playlist order, not the account sort');
for (const key of ['default', 'newest', 'oldest', 'title', 'artist', 'album', 'top'] as const) {
	ok(fetchSort(key) === key, `${key} is asked for as itself`);
}

console.log('ok');
