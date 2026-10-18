// Self-check for the ambient light's blur kernel in `ambient.ts`:
//
//     node --experimental-strip-types ui/src/lib/ambient.check.ts
//
// The glow is blended into itself every frame, so a kernel whose weights don't sum to one brightens
// or darkens it on every pass. Prints "ok" and exits 0, or throws on the first broken invariant.
import { kernel } from './ambient.ts';

function ok(cond: boolean, what: string): void {
	if (!cond) throw new Error(`FAIL: ${what}`);
}

const k = kernel(3);
ok(k.offs.length === 5 && k.wts.length === 5, "sigma 3 fits the shader's five paired taps");
const sum = k.w0 + 2 * k.wts.reduce((a, b) => a + b, 0);
ok(Math.abs(sum - 1) < 1e-9, `weights sum to one (got ${sum})`);
ok(
	k.offs.every((o, i) => o > 2 * i + 1 - 1e-9 && o < 2 * i + 2 + 1e-9),
	'each paired tap lands between its two texels'
);
ok(
	k.wts.every((w, i) => i === 0 || w < k.wts[i - 1]),
	'weights fall away from the centre'
);
console.log('ok');
