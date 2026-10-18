/**
 * The Scrobbling tab's settings, as `ScrobbleSettings.svelte` edits them and `lastfm.rs` reads them.
 *
 * This is the TypeScript half of `ScrobbleConfig` in `src-tauri/src/lastfm.rs`: same field names,
 * same defaults, persisted as one JSON blob in the `lastfm_config` setting. Unlike the Discord tab,
 * nothing here re-implements the backend's logic: what a track scrobbles as comes from Rust
 * (`lastfm_preview`), because a regex Rust's engine reads differently from JavaScript's would
 * otherwise make the preview lie. What lives here is the shape, the presets and the importers.
 */

export type Field = 'title' | 'artist' | 'album';

/** Find and replace on one field. `find` is a Rust regex, matched ignoring case. */
export interface ScrobbleRule {
	enabled: boolean;
	field: Field;
	find: string;
	replace: string;
}

/** A fix for one track (#404). See `Edit` in lastfm.rs for the matching rules. */
export interface ScrobbleEdit {
	/** The video id. Empty on Pano Scrobbler imports, which match on the `from_` fields. */
	key: string;
	from_artist: string;
	from_title: string;
	from_album: string;
	/** What Last.fm gets. Empty keeps YouTube's value. */
	artist: string;
	title: string;
	album: string;
	skip: boolean;
}

export interface ScrobbleConfig {
	enabled: boolean;
	now_playing: boolean;
	/** 1 to 100. */
	percent: number;
	/** 0 turns the cap off. */
	minutes: number;
	split_video_titles: boolean;
	rules: ScrobbleRule[];
	edits: ScrobbleEdit[];
}

/** Must match `impl Default for ScrobbleConfig`: Last.fm's own rule, nothing rewritten. */
export const SCROBBLE_DEFAULTS: ScrobbleConfig = {
	enabled: true,
	now_playing: true,
	percent: 50,
	minutes: 4,
	split_video_titles: false,
	rules: [],
	edits: []
};

export function parseScrobbleConfig(json: string | undefined): ScrobbleConfig {
	try {
		return { ...structuredClone(SCROBBLE_DEFAULTS), ...(JSON.parse(json ?? '') as Partial<ScrobbleConfig>) };
	} catch {
		return structuredClone(SCROBBLE_DEFAULTS);
	}
}

/** Seconds into the track the scrobble fires, or `null` for never. Mirrors `scrobble_at`. */
export function scrobbleAt(duration: number, cfg: ScrobbleConfig): number | null {
	if (duration > 0 && duration < 30) return null;
	const share = duration > 0 ? (duration * Math.min(100, Math.max(1, cfg.percent))) / 100 : Infinity;
	const cap = cfg.minutes > 0 ? cfg.minutes * 60 : Infinity;
	const at = Math.min(share, cap);
	return Number.isFinite(at) ? at : null;
}

export const blankEdit = (): ScrobbleEdit => ({
	key: '',
	from_artist: '',
	from_title: '',
	from_album: '',
	artist: '',
	title: '',
	album: '',
	skip: false
});

/**
 * Ready-made rules, offered under "Add rule". They are ordinary rules once added, so the user can
 * read and change them; the `id` names the i18n label (`settings.scrobbling.preset_<id>`).
 */
export const PRESETS: ({ id: string } & Omit<ScrobbleRule, 'enabled'>)[] = [
	{
		id: 'video_tags',
		field: 'title',
		find: String.raw`\s*[(\[](?:official\s+)?(?:music\s+|lyrics?\s+)?(?:video|audio|lyrics?|visuali[sz]er|hd|hq|4k)[)\]]`,
		replace: ''
	},
	// The next two are Pano Scrobbler's presets of the same name, in Rust's syntax.
	{
		id: 'remastered',
		field: 'title',
		find: String.raw`^(.+) [(\[/-][^()\[\]]*?re-?mastere?d?[^)\[\]]*?(?:[)\]/-]|$)`,
		replace: '$1'
	},
	{
		id: 'explicit',
		field: 'title',
		find: String.raw`^(.*) (?:- |\(|\[|/)(?:explicit|clean)(?: .*?version| edit(?:ed)?)?[)\]]?$`,
		replace: '$1'
	},
	{ id: 'topic', field: 'artist', find: String.raw`\s+-\s+topic$`, replace: '' },
	{ id: 'vevo', field: 'artist', find: 'vevo$', replace: '' }
];

// --- Import from other scrobblers (#327) ---------------------------------------------------------

export interface Imported {
	source: 'pano' | 'web-scrobbler';
	rules: ScrobbleRule[];
	edits: ScrobbleEdit[];
	/** Entries with no equivalent here: rules that test several fields at once, block rules, edits
	 *  keyed by something other than a YouTube video id. */
	skipped: number;
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Json | null =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
const VIDEO_ID = /^[\w-]{11}$/;
const FIELDS: Record<string, Field> = { track: 'title', artist: 'artist', album: 'album' };

/**
 * Read an export from Pano Scrobbler (Settings ▸ Export) or Web Scrobbler (the edited tracks and
 * regex edits exports). `null` when the file is neither.
 */
export function importScrobbleFile(text: string): Imported | null {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return null;
	}
	if (Array.isArray(data)) return fromWebScrobblerRegex(data);
	const o = obj(data);
	if (!o) return null;
	if ('pano_version' in o || 'simple_edits' in o || 'regex_rules' in o) return fromPano(o);
	return fromWebScrobblerEdits(o);
}

/** Pano's `ExportData`: `simple_edits`, `regex_rules` and `blocked_metadata`. */
function fromPano(o: Json): Imported {
	const out: Imported = { source: 'pano', rules: [], edits: [], skipped: 0 };
	for (const v of Array.isArray(o.simple_edits) ? o.simple_edits : []) {
		const e = obj(v);
		// `hasOrigX: false` is Pano's wildcard, which an empty `from_` field is here.
		const from = (has: unknown, value: unknown) => (has === false ? '' : str(value));
		const edit = {
			...blankEdit(),
			from_title: from(e?.hasOrigTrack, e?.origTrack),
			from_artist: from(e?.hasOrigArtist, e?.origArtist),
			from_album: from(e?.hasOrigAlbum, e?.origAlbum),
			title: str(e?.track),
			artist: str(e?.artist),
			album: str(e?.album)
		};
		if (edit.from_title || edit.from_artist || edit.from_album) out.edits.push(edit);
		else out.skipped++;
	}
	for (const v of Array.isArray(o.blocked_metadata) ? o.blocked_metadata : []) {
		const b = obj(v);
		const edit = {
			...blankEdit(),
			from_title: str(b?.track),
			from_artist: str(b?.artist),
			from_album: str(b?.album),
			skip: true
		};
		if (edit.from_title || edit.from_artist || edit.from_album) out.edits.push(edit);
		else out.skipped++;
	}
	for (const v of Array.isArray(o.regex_rules) ? o.regex_rules : []) {
		const r = obj(v);
		const search = obj(r?.search) ?? {};
		const repl = obj(r?.replacement);
		const fields = Object.keys(FIELDS).filter((f) => str(search[`search${cap(f)}`]));
		// One field tested, and no album-artist (which has no equivalent here).
		if (fields.length !== 1 || str(search.searchAlbumArtist)) {
			out.skipped++;
			continue;
		}
		const f = fields[0];
		const flags = r?.caseSensitive ? '(?-i)' : '';
		const pattern = str(search[`search${cap(f)}`]);
		const extract = /\(\?<(track|artist|album)>/.test(pattern);
		// A rule with no replacement and no named groups is a block rule: nothing to map it to.
		if (!repl && !extract) {
			out.skipped++;
			continue;
		}
		out.rules.push({
			enabled: r?.enabled !== false,
			field: FIELDS[f],
			find: flags + pattern.replaceAll('(?<track>', '(?<title>'),
			replace: repl ? str(repl[`replacement${cap(f)}`]) : ''
		});
	}
	return out;
}

/** Web Scrobbler's regex edits: `{search, replace}` per field, plus flags. Without `isGlobal` a
 *  pattern has to match the whole field, which is what wrapping it in `^(?:…)$` reproduces. */
function fromWebScrobblerRegex(list: unknown[]): Imported {
	const out: Imported = { source: 'web-scrobbler', rules: [], edits: [], skipped: 0 };
	for (const v of list) {
		const r = obj(v);
		const search = obj(r?.search) ?? {};
		const repl = obj(r?.replace) ?? {};
		const tested = Object.keys(search).filter((k) => typeof search[k] === 'string');
		const replaced = Object.keys(repl).filter((k) => typeof repl[k] === 'string');
		// One field, tested and replaced in the same place. Anything else is conditional.
		const f = tested[0];
		if (tested.length !== 1 || !(f in FIELDS) || replaced.length !== 1 || replaced[0] !== f) {
			out.skipped++;
			continue;
		}
		let find = str(search[f]);
		if (r?.isRegexDisabled) find = find.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
		if (!r?.isGlobal) find = `^(?:${find})$`;
		if (!r?.isCaseInsensitive) find = `(?-i)${find}`;
		out.rules.push({
			enabled: true,
			field: FIELDS[f],
			find,
			// JavaScript's `$<name>` and `$&` are `${name}` and `${0}` to Rust.
			replace: str(repl[f])
				.replace(/\$<(\w+)>/g, (_, name) => `\${${name}}`)
				.replaceAll('$&', () => '${0}')
		});
	}
	return out;
}

/** Web Scrobbler's edited tracks: `{songId: {artist, track, album, albumArtist}}`. On YouTube and
 *  YouTube Music the song id is the video id; anything else is a hash of another site's metadata. */
function fromWebScrobblerEdits(o: Json): Imported | null {
	const out: Imported = { source: 'web-scrobbler', rules: [], edits: [], skipped: 0 };
	let any = false;
	for (const [key, v] of Object.entries(o)) {
		const e = obj(v);
		if (!e || !('track' in e || 'artist' in e)) continue;
		any = true;
		if (!VIDEO_ID.test(key)) {
			out.skipped++;
			continue;
		}
		out.edits.push({
			...blankEdit(),
			key,
			title: str(e.track),
			artist: str(e.artist),
			album: str(e.album)
		});
	}
	return any ? out : null;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Same track: the same video id, or for a keyless edit the same metadata it matches on. */
export function sameTarget(a: ScrobbleEdit, b: ScrobbleEdit): boolean {
	if (a.key || b.key) return a.key === b.key;
	const eq = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase();
	return eq(a.from_artist, b.from_artist) && eq(a.from_title, b.from_title) && eq(a.from_album, b.from_album);
}

/** Fold an import into the config. An imported edit for a track that already has one replaces it;
 *  a rule identical to one already in the list isn't added twice. */
export function mergeImport(cfg: ScrobbleConfig, imp: Imported): { rules: number; edits: number } {
	let rules = 0;
	for (const r of imp.rules) {
		if (cfg.rules.some((x) => x.field === r.field && x.find === r.find && x.replace === r.replace)) continue;
		cfg.rules.push(r);
		rules++;
	}
	for (const e of imp.edits) {
		const at = cfg.edits.findIndex((x) => sameTarget(x, e));
		if (at >= 0) cfg.edits[at] = e;
		else cfg.edits.push(e);
	}
	return { rules, edits: imp.edits.length };
}
