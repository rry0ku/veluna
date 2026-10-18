// Self-check for the drag edge-scroll ramp in `dnd.ts`. Same deal as `personal.check.ts` — no test
// runner in `ui/`, node 22 runs TypeScript directly:
//
//     node --experimental-strip-types ui/src/lib/dnd.check.ts
//
// Prints "ok" and exits 0, or throws on the first broken invariant. The rAF loop around this needs
// a DOM and gets verified by dragging something; the arithmetic that decides which way and how hard
// does not, and getting a sign wrong scrolls away from the thing you're aiming at.
import { edgeVelocity } from './dnd.ts';

function ok(cond: boolean, what: string): void {
	if (!cond) throw new Error(`FAIL: ${what}`);
}

// A 1000px-tall container starting 100px down the window.
const TOP = 100;
const BOTTOM = 1100;
const v = (y: number) => edgeVelocity(y, TOP, BOTTOM);

// Dead in the middle: no pull, or the page creeps under a stationary cursor.
ok(v(600) === 0, 'no pull in the middle');
ok(v(TOP + 96) === 0, 'the ramp starts exactly at the edge zone, not inside it');
ok(v(BOTTOM - 96) === 0, 'same at the bottom');

// Near the top pulls up (negative), near the bottom pulls down (positive).
ok(v(TOP + 10) < 0, 'near the top scrolls up');
ok(v(BOTTOM - 10) > 0, 'near the bottom scrolls down');

// Full speed at each edge, and it stays there past it — the pointer can leave the container while
// the button is still down, and the scroll must not give up at that moment. px per *second*: the
// loop moves by elapsed time, so a starved timer changes smoothness, never speed.
ok(v(TOP) === -1800, 'full speed at the top edge');
ok(v(TOP - 500) === -1800, 'still full speed above the container');
ok(v(BOTTOM) === 1800, 'full speed at the bottom edge');
ok(v(BOTTOM + 500) === 1800, 'still full speed below the container');

// The ramp is proportional: halfway into the zone is half speed.
ok(v(TOP + 48) === -900, 'half into the top zone is half speed');
ok(v(BOTTOM - 48) === 900, 'half into the bottom zone is half speed');

// A container shorter than two edge zones still resolves to one direction rather than NaN or a
// fight between the two branches (the top wins — it's the one home's drop target lives at).
ok(edgeVelocity(150, 100, 200) < 0, 'a short container still picks a direction');

console.log('ok');
