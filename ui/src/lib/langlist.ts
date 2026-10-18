// The computed bits behind the language picker, kept pure so `langlist.check.ts` can run them
// without a DOM or a Svelte runtime: which languages a query matches, how much of a catalog
// Weblate has actually landed, and which catalog a system language gets.

/** The fields the search reads. `LocaleInfo` satisfies it; the check file makes its own. */
export interface Searchable {
	id: string;
	nativeLabel: string;
	englishLabel: string;
}

/**
 * Lowercased and stripped of accents, so `francais` finds Français and `romana` finds Română. The
 * keyboard someone is typing on is rarely the one their own language would want.
 */
export function fold(s: string): string {
	return s
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();
}

/**
 * Languages matching `query`, in the order they were given. An empty query matches everything,
 * because the picker opens showing the whole list.
 *
 * The id is searchable alongside both names, which is the way out of a script you cannot read: a
 * German speaker who landed in Korean can type `de`.
 */
export function matchLocales<T extends Searchable>(locales: T[], query: string): T[] {
	const q = fold(query.trim());
	if (!q) return locales;
	return locales.filter((l) => fold(`${l.nativeLabel} ${l.englishLabel} ${l.id}`).includes(q));
}

/**
 * Non-blank strings in `catalog` at the paths where English has one. Weblate writes an untranslated
 * string as "", and it keeps keys English has since dropped for a while, so those count for nothing.
 */
function translated(english: unknown, catalog: unknown): number {
	if (typeof english === 'string')
		return english.trim() && typeof catalog === 'string' && catalog.trim() ? 1 : 0;
	if (english && typeof english === 'object' && catalog && typeof catalog === 'object')
		return Object.entries(english).reduce<number>(
			(n, [k, v]) => n + translated(v, (catalog as Record<string, unknown>)[k]),
			0
		);
	return 0;
}

/** How much of `catalog` is translated, 0..1, against English as the complete one. */
export function coverage(catalog: unknown, english: unknown): number {
	const total = translated(english, english);
	return total > 0 ? translated(english, catalog) / total : 1;
}

/**
 * Chinese catalogs differ by script, and a system tag usually names only the region. Bare `zh` is
 * Simplified because that is what most of its speakers write.
 */
const ZH_SCRIPT: Record<string, string> = {
	zh: 'zh-Hans',
	'zh-cn': 'zh-Hans',
	'zh-sg': 'zh-Hans',
	'zh-tw': 'zh-Hant',
	'zh-hk': 'zh-Hant',
	'zh-mo': 'zh-Hant'
};

/**
 * The catalog for a system language tag (`navigator.language`), or undefined. Exact tag first
 * ('pt-br' -> pt-BR), then the Chinese region map, then a catalog the tag starts with ('tr-TR' -> tr,
 * 'zh-Hans-CN' -> zh-Hans), then any catalog for that language ('pt-PT' -> pt-BR). The last one is a
 * guess, but a Portuguese catalog beats English for a Portuguese speaker.
 */
export function pickLocale(ids: string[], tag: string): string | undefined {
	const raw = tag.toLowerCase();
	const base = raw.split('-')[0];
	const zh = ZH_SCRIPT[raw];
	return (
		ids.find((k) => k.toLowerCase() === raw) ??
		(zh && ids.includes(zh) ? zh : undefined) ??
		ids.find((k) => raw.startsWith(`${k.toLowerCase()}-`)) ??
		ids.find((k) => k.toLowerCase().split('-')[0] === base)
	);
}
