// Self-check for the network-error classifier in `neterr.ts`. There is no test runner in `ui/` and
// this doesn't warrant adding one, node 22 runs TypeScript directly:
//
//     node --experimental-strip-types ui/src/lib/neterr.check.ts
//
// Prints "ok" and exits 0, or throws on the first broken invariant. Not imported by the app.
import { isUnreachable, friendlyNetError } from './neterr.ts';

function ok(cond: boolean, what: string): void {
	if (!cond) throw new Error(`FAIL: ${what}`);
}

const OFFLINE = "Can't reach YouTube Music. Check your connection.";
const swap = (raw: string) => friendlyNetError(raw, OFFLINE);

// --- what Rust actually hands the webview -------------------------------------------------------
// reqwest 0.12 Display: the kind, then " for url (…)". Same string for DNS, refused, TLS, timeout.
const REQWEST = 'http: error sending request for url (https://music.youtube.com/youtubei/v1/browse)';
ok(isUnreachable(REQWEST), 'a bare reqwest transport failure is the network');
ok(swap(REQWEST) === OFFLINE, 'and it is replaced whole, with no dangling "http:"');

ok(
	swap('http: request or response body error for url (https://music.youtube.com/)') === OFFLINE,
	'a connection dropped mid-response is the network too'
);
ok(
	swap('could not reach YouTube. Check your connection and try again (no client answered)') ===
		OFFLINE,
	"the orchestrator's own Unreachable is translated rather than passed through"
);

// --- a message that wrapped the error keeps its own half ----------------------------------------
ok(
	swap('Couldn’t sort this playlist: http: error sending request for url (https://x/)') ===
		`Couldn’t sort this playlist: ${OFFLINE}`,
	'context before the transport error survives'
);

// --- everything else is left alone --------------------------------------------------------------
for (const other of [
	'Your YouTube Music session expired, open the account menu and sign in again.',
	'This track is already in the playlist.',
	'http: HTTP status client error (404 Not Found) for url (https://music.youtube.com/)',
	'json: invalid type: null, expected a string at line 1 column 8',
	"Couldn't load this track. The stream link was refused.",
	'this file is no longer on your disk: /home/me/gone.flac'
]) {
	ok(!isUnreachable(other), `not the network: ${other}`);
	ok(swap(other) === other, `passed through untouched: ${other}`);
}

console.log('ok');
