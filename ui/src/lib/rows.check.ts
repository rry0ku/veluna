// Self-check for the row window (`rows.ts`). Same deal as `queue.check.ts` — no test runner in
// `ui/`, node 22 runs TypeScript directly:
//
//     node --experimental-strip-types ui/src/lib/rows.check.ts
//
// Prints "ok" and exits 0, or throws on the first broken invariant. The bugs this guards are the
// two that make a windowed list feel broken rather than fast: a scroll height that changes as you
// scroll (the scrollbar jumps under the pointer), and a window that does not actually cover the
// viewport (blank strips at the edges).
import { blockWindows, fullWindow, HEADING_PX, ROW_PX, rowWindow } from './rows.ts';

function ok(cond: boolean, what: string): void {
	if (!cond) throw new Error(`FAIL: ${what}`);
}

const VIEWPORT = 800; // a typical panel height, ~14 rows
const TOTAL = 5000; // a Liked Songs list

// --- the scrollbar must not move -------------------------------------------------------------
// Total reserved height is padTop + rendered rows + padBottom, and it has to equal the same
// total * ROW_PX at every scroll position, or dragging the scrollbar fights itself.
// Past the end too: a track removed from a playlist scrolled to its bottom leaves scrollTop
// beyond the list for a frame, and that is where an unclamped start broke this.
for (let top = 0; top <= TOTAL * ROW_PX * 2; top += 997) {
	const w = rowWindow(top, VIEWPORT, TOTAL);
	const rendered = (w.end - w.start) * ROW_PX;
	ok(
		w.padTop + rendered + w.padBottom === TOTAL * ROW_PX,
		`reserved height is constant at scrollTop=${top}`
	);
}

// --- the window must cover what is on screen --------------------------------------------------
for (let top = 0; top <= (TOTAL - 20) * ROW_PX; top += 997) {
	const w = rowWindow(top, VIEWPORT, TOTAL);
	const firstVisible = Math.floor(top / ROW_PX);
	const lastVisible = Math.floor((top + VIEWPORT) / ROW_PX);
	ok(w.start <= firstVisible, `covers the top of the viewport at scrollTop=${top}`);
	ok(w.end > lastVisible, `covers the bottom of the viewport at scrollTop=${top}`);
}

// --- it must stay small -----------------------------------------------------------------------
// The whole point. A 5000-row list may never render 5000 rows, at any scroll position.
let widest = 0;
for (let top = 0; top <= TOTAL * ROW_PX; top += 331) {
	const w = rowWindow(top, VIEWPORT, TOTAL);
	widest = Math.max(widest, w.end - w.start);
}
ok(widest < 40, `window stays small (widest was ${widest} rows)`);

// --- edges ------------------------------------------------------------------------------------
const atTop = rowWindow(0, VIEWPORT, TOTAL);
ok(atTop.start === 0 && atTop.padTop === 0, 'nothing is reserved above the first row');

const atBottom = rowWindow((TOTAL - 14) * ROW_PX, VIEWPORT, TOTAL);
ok(atBottom.end === TOTAL, 'the last row is rendered when it is on screen');
ok(atBottom.padBottom === 0, 'nothing is reserved below the last row');

// Scrolled past the end (rubber-banding, or a list that shrank under us): clamped, never negative.
const past = rowWindow(TOTAL * ROW_PX * 2, VIEWPORT, TOTAL);
ok(past.end === TOTAL, 'end clamps to the list');
ok(past.padBottom === 0, 'padding never goes negative');
ok(past.start <= TOTAL, 'start clamps to the list');

// Negative, which is what a scrolling page header produces: the caller subtracts the offset of
// row 0, so while the header is still on screen the window is asked for a position above the list.
for (const top of [-1200, -56, -1]) {
	const w = rowWindow(top, VIEWPORT, TOTAL);
	ok(w.start === 0 && w.padTop === 0, `nothing reserved above row 0 at scrollTop=${top}`);
	ok(
		w.padTop + (w.end - w.start) * ROW_PX + w.padBottom === TOTAL * ROW_PX,
		`reserved height is constant at scrollTop=${top}`
	);
	// Whatever of the viewport hangs below row 0 is still covered.
	ok(w.end > Math.floor((top + VIEWPORT) / ROW_PX), `covers what is on screen at scrollTop=${top}`);
}

// A list shorter than the viewport renders whole, with no padding at all.
const tiny = rowWindow(0, VIEWPORT, 3);
ok(tiny.start === 0 && tiny.end === 3, 'a short list renders in full');
ok(tiny.padTop === 0 && tiny.padBottom === 0, 'a short list reserves nothing');

// Empty, and the pre-measurement state (viewportPx 0) still paints something.
const empty = rowWindow(0, VIEWPORT, 0);
ok(empty.end === 0 && empty.padBottom === 0, 'an empty list is empty');
const unmeasured = rowWindow(0, 0, TOTAL);
ok(unmeasured.end > 0, 'renders a first slice before the container has been measured');

// --- blocks (the queue panel) -----------------------------------------------------------------
// Same two invariants, across a list of blocks: every block reserves exactly its own rows however
// the windows move, and whichever block the viewport is over renders the rows that are on screen.
const COUNTS = [1, 12, 3000, 40]; // now playing, a "Play next" block, a big playlist, autoplay
const TOTAL_PX = COUNTS.reduce((a, c) => a + HEADING_PX + c * ROW_PX, 0);

for (let top = 0; top <= TOTAL_PX; top += 613) {
	const ws = blockWindows(top, VIEWPORT, COUNTS);
	ok(ws.length === COUNTS.length, 'one window per block');

	let rendered = 0;
	let cursor = 0;
	for (const [b, w] of ws.entries()) {
		const own = (w.end - w.start) * ROW_PX;
		ok(
			w.padTop + own + w.padBottom === COUNTS[b] * ROW_PX,
			`block ${b} reserves its own height at scrollTop=${top}`
		);
		rendered += w.end - w.start;

		// A block the viewport actually overlaps has to render the rows inside that overlap.
		cursor += HEADING_PX;
		const overlapTop = Math.max(top, cursor);
		const overlapBottom = Math.min(top + VIEWPORT, cursor + COUNTS[b] * ROW_PX);
		if (overlapBottom > overlapTop) {
			const firstVisible = Math.floor((overlapTop - cursor) / ROW_PX);
			const lastVisible = Math.min(COUNTS[b] - 1, Math.floor((overlapBottom - cursor - 1) / ROW_PX));
			ok(w.start <= firstVisible, `block ${b} covers the top of the overlap at scrollTop=${top}`);
			ok(w.end > lastVisible, `block ${b} covers the bottom of the overlap at scrollTop=${top}`);
		}
		cursor += COUNTS[b] * ROW_PX;
	}
	// The whole point again: 3053 rows of queue, never more than a screenful or two rendered.
	ok(rendered < 60, `only ${rendered} rows rendered across all blocks at scrollTop=${top}`);
}

// An empty block (the queue with nothing playing) contributes nothing and breaks nothing.
const withEmpty = blockWindows(0, VIEWPORT, [0, 5]);
ok(withEmpty[0].end === 0 && withEmpty[0].padBottom === 0, 'an empty block stays empty');
ok(withEmpty[1].end === 5, 'the block after an empty one still renders');

// The escape hatch for short queues, where windowing would cost the flip animation for nothing.
const full = fullWindow(7);
ok(full.start === 0 && full.end === 7, 'fullWindow renders everything');
ok(full.padTop === 0 && full.padBottom === 0, 'fullWindow reserves nothing');

console.log('ok');
