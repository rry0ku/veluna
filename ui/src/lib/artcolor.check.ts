// Self-check for the artwork accent picker (`artcolor.ts`). No test runner in `ui/` (see
// color.check.ts) — node 22 runs TypeScript directly:
//
//     node --experimental-strip-types ui/src/lib/artcolor.check.ts
//
// Prints "ok" and exits 0, or throws on the first broken invariant.
import { pickAccent, toAccent } from './artcolor.ts';
import { brightness, hexToHsv, hsvToHex } from './color.ts';

/** An RGBA buffer: `n` pixels of each colour, in order. */
const buf = (...runs: [[number, number, number], number][]) =>
	new Uint8ClampedArray(runs.flatMap(([[r, g, b], n]) => Array.from({ length: n * 4 }, (_, i) => [r, g, b, 255][i % 4])));

const hue = (hex: string) => Math.round(hexToHsv(hex)!.h);

// A cover that is mostly black with a red band: area must not beat colour, or every dark cover
// themes the app grey.
const red = pickAccent(buf([[8, 8, 8], 900], [[200, 30, 30], 124]))!;
if (Math.abs(hue(red) - 0) > 20 && Math.abs(hue(red) - 360) > 20) throw new Error(`hue: ${red}`);

// Banding lands on the brightness the theme asked for, and the two themes disagree: a dark theme's
// accent has to be brighter than the surfaces under it, a light theme's darker (#137). Every hue,
// including the two that HSV value gets wrong (blue is dark at v=1, yellow is bright at v=0.5).
for (const h of [0, 45, 60, 120, 180, 240, 280, 330]) {
	const src = hsvToHex({ h, s: 0.9, v: 0.5 });
	const dark = brightness(toAccent(src, true));
	const light = brightness(toAccent(src, false));
	if (Math.abs(dark - 0.65) > 0.02) throw new Error(`dark band at ${h}: ${dark}`);
	if (Math.abs(light - 0.39) > 0.02) throw new Error(`light band at ${h}: ${light}`);
	// Still a colour, not a wash: hue survives and something of the saturation does too.
	for (const out of [toAccent(src, true), toAccent(src, false)]) {
		const hsv = hexToHsv(out)!;
		if (hsv.s < 0.3) throw new Error(`washed out at ${h}: ${out}`);
		if (Math.min(Math.abs(hsv.h - h), 360 - Math.abs(hsv.h - h)) > 3) throw new Error(`hue drift: ${out}`);
	}
}

// The picked colour comes back raw, so the cache stays valid across a light/dark flip.
if (toAccent(red, true) === toAccent(red, false)) throw new Error('band ignores the theme');

// Greyscale artwork keeps the user's theme instead of inventing a hue out of noise.
if (pickAccent(buf([[20, 20, 20], 512], [[210, 210, 212], 512])) !== null) throw new Error('grey');
if (pickAccent(new Uint8ClampedArray(0)) !== null) throw new Error('empty');

console.log('ok');
