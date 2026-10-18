// Self-check for the scrobbling config helpers in `scrobble.ts`, mostly the importers: their input
// is another app's file format, and a silent misread there writes wrong rules into the user's
// settings. Run with `pnpm test`, or alone:
//
//     node --experimental-strip-types ui/src/lib/scrobble.check.ts
//
// The fixtures follow the exporters' source: Pano Scrobbler's `ImExporter.kt` / `RegexEdit.kt` /
// `SimpleEdit.kt`, Web Scrobbler's `util/regex.ts` and `saved-edits.model.ts`.
import {
	SCROBBLE_DEFAULTS,
	importScrobbleFile,
	mergeImport,
	parseScrobbleConfig,
	scrobbleAt
} from './scrobble.ts';

function ok(cond: unknown, msg: string): asserts cond {
	if (!cond) throw new Error(msg);
}

// --- config ---
ok(parseScrobbleConfig(undefined).percent === 50, 'no blob is the default');
ok(parseScrobbleConfig('{oops').minutes === 4, 'a bad blob is the default');
ok(parseScrobbleConfig('{"percent":90}').now_playing, 'missing fields take the default');
parseScrobbleConfig('{}').rules.push({ enabled: true, field: 'title', find: 'x', replace: '' });
ok(SCROBBLE_DEFAULTS.rules.length === 0, 'parsing never hands out the shared default arrays');

// --- threshold, same cases as the Rust tests ---
ok(scrobbleAt(180, SCROBBLE_DEFAULTS) === 90, 'half a short track');
ok(scrobbleAt(1200, SCROBBLE_DEFAULTS) === 240, '4 minutes of a long one');
ok(scrobbleAt(20, SCROBBLE_DEFAULTS) === null, 'under 30s never');
ok(scrobbleAt(0, SCROBBLE_DEFAULTS) === 240, 'unknown length: the cap');
ok(scrobbleAt(0, { ...SCROBBLE_DEFAULTS, minutes: 0 }) === null, 'unknown length, no cap: not yet');
ok(scrobbleAt(1200, { ...SCROBBLE_DEFAULTS, percent: 90, minutes: 0 }) === 1080, 'no cap');

// --- Pano Scrobbler ---
const pano = importScrobbleFile(
	JSON.stringify({
		pano_version: 400,
		simple_edits: [
			{
				hasOrigTrack: true,
				origTrack: 'Fire Meets Fate',
				hasOrigArtist: true,
				origArtist: 'alexias788',
				hasOrigAlbum: false,
				origAlbum: 'ignored',
				track: 'Fire Meets Fate',
				artist: 'Ruelle'
			},
			{ hasOrigTrack: false, hasOrigArtist: false, hasOrigAlbum: false, track: 'x' }
		],
		blocked_metadata: [{ artist: 'White Noise Co', album: '', albumArtist: '', track: '' }],
		regex_rules: [
			{
				name: 'Remastered',
				search: { searchTrack: '^(.+) - remastered$', searchAlbum: '', searchArtist: '', searchAlbumArtist: '' },
				replacement: {
					replacementTrack: '$1',
					replacementAlbum: '',
					replacementArtist: '',
					replacementAlbumArtist: '',
					replaceAll: false
				},
				caseSensitive: true,
				enabled: false
			},
			{
				name: 'Parse',
				search: { searchTrack: '^(?<artist>.+) - (?<track>.+)$', searchAlbum: '', searchArtist: '', searchAlbumArtist: '' }
			},
			{
				name: 'Two fields',
				search: { searchTrack: 'a', searchAlbum: '', searchArtist: 'b', searchAlbumArtist: '' },
				replacement: { replacementTrack: '', replacementAlbum: '', replacementArtist: '', replacementAlbumArtist: '' }
			},
			{
				name: 'Block',
				search: { searchTrack: 'podcast', searchAlbum: '', searchArtist: '', searchAlbumArtist: '' }
			}
		]
	})
);
ok(pano?.source === 'pano', 'pano detected');
ok(pano.edits.length === 2, `2 pano edits, got ${pano.edits.length}`);
ok(pano.edits[0].from_artist === 'alexias788' && pano.edits[0].from_album === '', 'hasOrigAlbum false is a wildcard');
ok(pano.edits[0].artist === 'Ruelle' && pano.edits[0].key === '', 'pano edit carries the new artist, no key');
ok(pano.edits[1].skip && pano.edits[1].from_artist === 'White Noise Co', 'blocked metadata becomes a skip');
ok(pano.rules.length === 2, `2 pano rules, got ${pano.rules.length}`);
ok(pano.rules[0].find === '(?-i)^(.+) - remastered$' && !pano.rules[0].enabled, 'case-sensitive and disabled carry over');
ok(pano.rules[0].replace === '$1', 'replacement kept');
ok(pano.rules[1].find === '^(?<artist>.+) - (?<title>.+)$', 'extraction groups renamed to ours');
ok(pano.skipped === 3, `the wildcard edit, two-field rule and block rule are skipped, got ${pano.skipped}`);

// --- Web Scrobbler ---
const wsRegex = importScrobbleFile(
	JSON.stringify([
		{
			search: { track: '(.*) \\(Official Video\\)', artist: null, album: null, albumArtist: null },
			replace: { track: '$1', artist: null, album: null, albumArtist: null },
			isCaseInsensitive: true
		},
		{
			search: { track: null, artist: 'VEVO', album: null, albumArtist: null },
			replace: { track: null, artist: '', album: null, albumArtist: null },
			isGlobal: true,
			isRegexDisabled: true
		},
		{
			search: { track: '(?<t>.+)', artist: null, album: null, albumArtist: null },
			replace: { track: '$<t> [$&]', artist: null, album: null, albumArtist: null },
			isCaseInsensitive: true
		},
		{
			search: { track: null, artist: 'Ruelle', album: null, albumArtist: null },
			replace: { track: null, artist: null, album: 'Soundtrack', albumArtist: null }
		}
	])
);
ok(wsRegex?.source === 'web-scrobbler', 'web scrobbler regex detected');
ok(wsRegex.rules.length === 3 && wsRegex.skipped === 1, 'the conditional edit is skipped');
ok(wsRegex.rules[0].find === '^(?:(.*) \\(Official Video\\))$', 'non-global anchors the whole field');
ok(wsRegex.rules[1].find === '(?-i)VEVO' && wsRegex.rules[1].field === 'artist', 'literal + case-sensitive');
ok(wsRegex.rules[2].replace === '${t} [${0}]', `JS replacement syntax converted, got ${wsRegex.rules[2].replace}`);

const wsEdits = importScrobbleFile(
	JSON.stringify({
		'T1Vkc5w79-M': { artist: 'Ruelle', track: 'Fire Meets Fate', album: null, albumArtist: null },
		'5d41402abc4b2a76b9719d911017c592': { artist: 'A', track: 'B', album: null, albumArtist: null }
	})
);
ok(wsEdits?.edits.length === 1 && wsEdits.edits[0].key === 'T1Vkc5w79-M', 'video id keys kept');
ok(wsEdits.edits[0].album === '' && wsEdits.skipped === 1, 'hash keys skipped, null album empty');

ok(importScrobbleFile('not json') === null, 'garbage is not an import');
ok(importScrobbleFile('{"theme":"dark"}') === null, 'an unrelated JSON object is not an import');

// --- merge ---
const cfg = parseScrobbleConfig('{}');
mergeImport(cfg, wsEdits);
const again = mergeImport(cfg, {
	...wsEdits,
	edits: [{ ...wsEdits.edits[0], artist: 'RUELLE' }],
	rules: [wsRegex.rules[0], wsRegex.rules[0]]
});
ok(cfg.edits.length === 1 && cfg.edits[0].artist === 'RUELLE', 'same video: the import replaces the edit');
ok(cfg.rules.length === 1 && again.rules === 1, 'a duplicate rule is not added twice');

console.log('ok');
