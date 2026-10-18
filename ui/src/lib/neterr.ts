// Telling "the network is down" apart from "YouTube refused this" in the one place the UI turns a
// Rust error into words. Everything below is string matching because that is all that survives the
// trip: every Tauri command returns `Result<_, String>`, so the typed error (`reqwest::Error`,
// `ResolveError`) is already flattened by the time the webview sees it.
//
// Pure on purpose: no i18n import, so `neterr.check.ts` can run it under plain node. Callers pass
// the translated sentence in.

/**
 * What a dead connection looks like by the time it reaches here.
 *
 * reqwest's `Display` is the whole message: DNS failure, refused connection, dead proxy, captive
 * portal and timeout all print `error sending request for url (…)` and nothing finer, because the
 * cause lives in `source()` which `to_string()` never walks. That is fine, since all five want the
 * same sentence from us. The rest of the alternatives cover the layers that do pass a cause
 * through: rustypipe, the loopback proxy, mpv, and the orchestrator's own `Unreachable`.
 *
 * The optional `http: ` / `json: ` prefix is `innertube::transport::Error`'s, and matching it here
 * is what makes a bare transport failure replace cleanly instead of leaving `http:` dangling.
 */
const UNREACHABLE =
	/(?:\b(?:http|json): )?(?:error sending request|request or response body error|error trying to connect|dns error|failed to lookup address|connection (?:refused|reset|closed)|network is unreachable|no route to host|operation timed out|could not reach YouTube)/i;

/** Is this error the network rather than the request? */
export function isUnreachable(raw: string): boolean {
	return UNREACHABLE.test(raw);
}

/**
 * Swap the transport's raw wording for `friendly`, keeping whatever context the caller wrapped it
 * in. `"Couldn't sort this playlist: http: error sending request for url (…)"` keeps its first
 * half and loses the second; a bare transport error becomes `friendly` outright.
 *
 * Anything that isn't a network failure comes back untouched: a raw message the user can copy into
 * an issue beats a vague "something went wrong".
 */
export function friendlyNetError(raw: string, friendly: string): string {
	const m = UNREACHABLE.exec(raw);
	if (!m) return raw;
	const head = raw.slice(0, m.index).trim();
	return head ? `${head} ${friendly}` : friendly;
}
