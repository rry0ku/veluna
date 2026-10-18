// Self-check for the queue panel's layout (`queue.ts`). Same deal as `dnd.check.ts`: no test runner
// in `ui/`, node 22 runs TypeScript directly:
//
//     node --experimental-strip-types ui/src/lib/queue.check.ts
//
// Prints "ok" and exits 0, or throws on the first broken invariant.
import type { QueueState, SongItem } from './api.ts';
import {
	clockSecs,
	followPlaying,
	formatLeft,
	moveTarget,
	queueLeft,
	queueView,
	removableFromPlaylist
} from './queue.ts';

function ok(cond: boolean, what: string): void {
	if (!cond) throw new Error(`FAIL: ${what}`);
}

const song = (id: string, extra: Partial<SongItem> = {}): SongItem => ({
	video_id: id,
	title: id,
	artists: '',
	...extra
});
const q = (items: SongItem[], currentIndex: number): QueueState => ({ items, currentIndex });
const ids = (rows: { item: SongItem }[]) => rows.map((r) => r.item.video_id).join();

// --- one list, in play order -------------------------------------------------------------------
// What came before, the playing track, what is queued, the rest of the playlist: one run, numbered
// by queue index, which is also what play/remove act on.
const auto = (id: string) => song(id, { autoplay: true });
let v = queueView(
	q(
		[
			song('a1'),
			song('now'),
			song('p1', { queued: true }),
			song('n1', { queued_end: true, queued_from: 'X' }),
			song('a2'),
			auto('r1'),
			auto('r2')
		],
		1
	)
);
ok(ids(v.rows) === 'a1,now,p1,n1,a2', 'everything up to autoplay, in queue order');
ok(v.rows.map((r) => r.i).join() === '0,1,2,3,4', 'indices are the backend queue indices');
ok(ids(v.autoplay) === 'r1,r2', 'autoplay is the one split');
ok(v.autoplay[0].i === 5, 'and keeps counting');
ok(v.queued === 2, 'both kinds of manual add are what Clear queue removes');

// Autoplay tracks that already played are history like any other: the divider only ever sits
// ahead of the playing track, above what the Autoplay switch would take away.
v = queueView(q([song('a1'), auto('r1'), auto('now'), auto('r3')], 2));
ok(ids(v.rows) === 'a1,r1,now', 'played autoplay rows are ordinary rows');
ok(ids(v.autoplay) === 'r3', 'only upcoming autoplay is split off');

// A manual add made while autoplay is playing lands right after the playing track, ahead of the
// rest of autoplay, and is drawn there rather than under the divider.
v = queueView(q([auto('now'), song('p1', { queued: true }), auto('r2')], 0));
ok(ids(v.rows) === 'now,p1' && ids(v.autoplay) === 'r2', 'a manual add is not autoplay');

// A row dragged in among autoplay's tracks is drawn where it will play.
v = queueView(q([song('now'), auto('r1'), song('a1'), auto('r2')], 0));
ok(ids(v.autoplay) === 'r1,a1,r2', 'once autoplay starts the rest goes with it');

// Played manual adds are not counted: Clear queue only touches what is ahead.
v = queueView(q([song('p0', { queued: true }), song('now')], 1));
ok(v.queued === 0, 'played adds are not upcoming');

// A repeated track gets its own key per copy (keyed rendering).
v = queueView(q([song('dup'), song('now'), song('dup')], 1));
ok(v.rows.map((r) => r.key).join() === 'dup:0,now:0,dup:1', 'each copy keeps its own key');

// The leak #2ce233c fixed: a key must not change when the queue advances, or Svelte rebuilds rows.
const long = [song('a'), song('b'), song('c')];
ok(
	queueView(q(long, 0)).rows.map((r) => r.key).join() ===
		queueView(q(long, 2)).rows.map((r) => r.key).join(),
	'keys do not depend on the play pointer'
);

v = queueView(q([], 0));
ok(v.rows.length === 0 && v.autoplay.length === 0 && v.queued === 0, 'empty queue');

// --- what is left ------------------------------------------------------------------------------
ok(clockSecs('3:45') === 225 && clockSecs('1:02:03') === 3723, 'clock strings');
ok(clockSecs(undefined) === 0 && clockSecs('Cast of EPIC: The Musical') === 0, 'junk is zero');
const timed = (id: string, duration: string, extra: Partial<SongItem> = {}) =>
	song(id, { duration, ...extra });
let left = queueLeft(
	queueView(q([timed('a', '9:00'), timed('now', '3:00'), timed('b', '2:30'), timed('c', '1:30'), timed('r', '4:00', { autoplay: true })], 1)),
	1
);
ok(left.count === 2 && left.secs === 240, 'only what follows the playing track, autoplay aside');
left = queueLeft(queueView(q([timed('now', '3:00')], 0)), 0);
ok(left.count === 0 && left.secs === 0, 'nothing after the last track');
ok(formatLeft(240, 'en') === '4 min', 'minutes');
ok(formatLeft(3723, 'en') === '1 hr 2 min', 'hours and minutes');
ok(formatLeft(3600, 'en') === '1 hr', 'no zero minutes');
ok(formatLeft(20, 'en') === '', 'under a minute says nothing');
ok(formatLeft(240, 'pt_BR').length > 0, 'catalog ids with an underscore do not throw');

// --- following the playing row ------------------------------------------------------------------
// 60px rows starting 8px into the content, a 600px viewport scrolled so row 10 is at the top.
const top = 8 + 10 * 60;
ok(followPlaying(top, 600, 60, 8, 10, 11) === top + 60, 'an advance scrolls one row');
ok(followPlaying(top, 600, 60, 8, 10, 9) === top - 60, 'previous scrolls back one');
ok(followPlaying(top, 600, 60, 8, 12, 13) === top + 60, 'any visible row keeps its offset');
// History trimmed off the front: same track, lower index. The list shrank above the viewport, and
// following the index is exactly the compensation that keeps the row still.
ok(followPlaying(top, 600, 60, 8, 10, 4) === top - 360, 'a shrinking prefix is compensated');
ok(followPlaying(top, 600, 60, 8, 30, 31) === null, 'scrolled away below: left alone');
ok(followPlaying(top, 600, 60, 8, 2, 3) === null, 'scrolled away above: left alone');
ok(followPlaying(top, 600, 60, 8, 10, 10) === null, 'no move, no scroll');
ok(followPlaying(0, 600, 60, 8, 0, -5) === 0, 'never above the top');

// --- drag to reorder ---------------------------------------------------------------------------
// Dropping in front of a row *below* you lands one slot earlier once you're out of the way.
ok(moveTarget(2, 6) === 5, 'dragging down: the target shifts up by the hole left behind');
ok(moveTarget(6, 2) === 2, 'dragging up: the target is where the bar is');
ok(moveTarget(2, 9) === 8, 'dropping past the last row appends');
ok(moveTarget(2, 2) === null, 'in front of yourself is a no-op');
ok(moveTarget(2, 3) === null, 'and so is just behind yourself');

// --- "Remove from this playlist" (issue #270) ---------------------------------------------------
const inPl = { keep: ['VLPL1'], other: ['VLPL2'] };
const row = song('keep', { set_video_id: 'SVID' });
ok(removableFromPlaylist(row, 'VLPL1', inPl), 'own playlist + setVideoId ⇒ removable');
ok(!removableFromPlaylist(row, null, inPl), 'a radio or single song has no playlist to edit');
ok(!removableFromPlaylist(song('keep'), 'VLPL1', inPl), 'no setVideoId ⇒ YouTube cannot be told which copy');
ok(!removableFromPlaylist(row, 'VLPL9', inPl), 'not in that playlist (or not yours) ⇒ hidden');
ok(!removableFromPlaylist(song('gone', { set_video_id: 'SVID' }), 'VLPL1', inPl), 'song not indexed at all');

console.log('ok');
