// Version ordering for the updater. Pure, so `version.check.ts` can run it under plain node.

/** A release candidate or other prerelease: anything with a `-` suffix (`1.1.0-rc.2`). */
export const isPrerelease = (v: string) => v.includes('-');

/** `a` is a later release than `b`. `x.y.z` compares numerically, a release outranks its own
 *  prereleases (1.1.0 > 1.1.0-rc.2), and two prereleases of one version compare by suffix
 *  (rc.10 > rc.9). Anything that doesn't parse compares as not-newer, so a weird tag can never
 *  invent an update. */
export function isNewer(a: string, b: string): boolean {
	const [ac, ...ap] = a.split('-');
	const [bc, ...bp] = b.split('-');
	const pa = ac.split('.').map(Number);
	const pb = bc.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		const [x, y] = [pa[i] ?? 0, pb[i] ?? 0];
		if (x !== y) return x > y;
	}
	const [sa, sb] = [ap.join('-'), bp.join('-')];
	if (sa === sb) return false;
	if (!sa || !sb) return !sa;
	// ponytail: numeric collation, not semver's full identifier rules; right for rc.N / beta.N
	return sa.localeCompare(sb, 'en', { numeric: true }) > 0;
}
