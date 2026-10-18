// Windowing for long lists of equal-height rows.
//
// `content-visibility` (see TrackRow) already stops WebKit laying out and painting rows that are
// off screen, but the row still exists: a DOM subtree, a computed style, a Svelte component. That
// is the part that does not scale. Measured on the built SPA in Playwright's WebKitGTK, a playlist
// page with covers, scrolled end to end:
//
//     rows rendered      DOM nodes      web process
//        60                 1,512          340 MiB
//      1,000                23,132         488 MiB
//      5,000               115,132        1160 MiB
//
// About 165 KB per rendered row past a thousand, and none of it the images (the same 1000-row list
// with no images at all measured the same). A Liked Songs list is routinely five figures.
//
// So: render the slice around the viewport, and stand in for the rest with a padded box, which
// keeps the scrollbar honest without keeping the rows. The maths is pure and lives here; the
// caller owns the two numbers that come from the DOM.

/**
 * Height of one `TrackRow`, in px: 8px padding + a 40px thumbnail + 8px padding.
 *
 * The same 3.5rem `TrackRow` already pins as its `contain-intrinsic-size`, and for the same reason:
 * something has to know how tall a row is before one is rendered. Change one and change the other.
 */
export const ROW_PX = 56;

export interface RowWindow {
	/** First row to render (inclusive). */
	start: number;
	/** Last row to render (exclusive). */
	end: number;
	/** Height to reserve above the rendered slice, px. */
	padTop: number;
	/** Height to reserve below it, px. */
	padBottom: number;
}

/**
 * Rows to keep on either side of the viewport.
 *
 * Ten rows is 560px, which does two jobs: it keeps a fast scroll ahead of the render, and it
 * absorbs the caller's offset. `scrollTop` is measured on the scrolling container, while the rows
 * usually start a little below its top edge (the playlist's `p-4` is 16px), and rather than plumb
 * that offset through, the overscan swallows it whole.
 */
const OVERSCAN = 10;

/**
 * The slice of `total` rows worth rendering for a scroll position, plus the padding that stands in
 * for the rest.
 *
 * `viewportPx` of 0 (before the container has been measured) yields the first `OVERSCAN` rows,
 * which is enough to paint while the real height arrives.
 */
export function rowWindow(
	scrollTop: number,
	viewportPx: number,
	total: number,
	rowPx: number = ROW_PX
): RowWindow {
	if (total <= 0 || rowPx <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
	// Both ends clamp to the list. `scrollTop` can sit past it: removing a track from a playlist
	// scrolled to its end shortens the list under the viewport, and an unclamped start would then
	// reserve more space above the (empty) slice than the whole list is tall.
	const start = Math.min(total, Math.max(0, Math.floor(scrollTop / rowPx) - OVERSCAN));
	const end = Math.min(total, Math.max(start, Math.ceil((scrollTop + viewportPx) / rowPx) + OVERSCAN));
	// Both paddings use the same rowPx, so the scroll height stays exactly total * rowPx however
	// the window moves. Anything else makes the scrollbar twitch as you drag it.
	return {
		start,
		end,
		padTop: start * rowPx,
		padBottom: Math.max(0, (total - end) * rowPx)
	};
}

/** Render everything: what a list short enough not to need windowing gets. */
export function fullWindow(total: number): RowWindow {
	return { start: 0, end: total, padTop: 0, padBottom: 0 };
}

/**
 * Rough height of a heading in the queue panel.
 *
 * Rough is enough, and this is the reason the queue panel needs no pinned heading heights. Each
 * block reserves exactly its own rows (padding plus rendered slice), so where a row lands on screen
 * never depends on this number; it only shifts which slice is chosen. A few tens of px of error
 * across a handful of blocks disappears into the overscan.
 */
export const HEADING_PX = 40;

/**
 * One window per block, for a list shaped as heading, rows, heading, rows.
 *
 * `counts` is each block's row count in render order. Blocks entirely above the viewport come back
 * with everything skipped and all their height in `padTop`; blocks below, in `padBottom`. Either
 * way a block's total height is exactly `rows * rowPx`, so the scroll height and every heading's
 * position stay put as the windows move.
 */
export function blockWindows(
	scrollTop: number,
	viewportPx: number,
	counts: number[],
	rowPx: number = ROW_PX,
	headingPx: number = HEADING_PX
): RowWindow[] {
	let top = 0;
	return counts.map((count) => {
		top += headingPx;
		const w = rowWindow(scrollTop - top, viewportPx, count, rowPx);
		top += count * rowPx;
		return w;
	});
}
