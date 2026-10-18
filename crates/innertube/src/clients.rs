//! YouTube client identities (impersonation). context/02.
//!
//! Constants are copied verbatim from Metrolist's `YouTubeClient.kt` into the bundled
//! `clients.json` (config, not hardcoded — see context/10 D-table). An optional override
//! file in the app data dir can replace it without a recompile when versions rotate.

use std::collections::HashMap;

use serde::Deserialize;

/// A bag of identity strings + feature flags. context/02.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeClient {
    /// Goes in `context.client.clientName` and is the string name.
    pub client_name: String,
    pub client_version: String,
    /// The NUMERIC id → `X-YouTube-Client-Name` header (as a string).
    pub client_id: String,
    pub user_agent: String,

    #[serde(default)]
    pub os_name: Option<String>,
    #[serde(default)]
    pub os_version: Option<String>,
    #[serde(default)]
    pub device_make: Option<String>,
    #[serde(default)]
    pub device_model: Option<String>,
    #[serde(default)]
    pub android_sdk_version: Option<String>,
    #[serde(default)]
    pub build_id: Option<String>,
    #[serde(default)]
    pub cronet_version: Option<String>,
    #[serde(default)]
    pub package_name: Option<String>,
    #[serde(default)]
    pub friendly_name: Option<String>,

    #[serde(default)]
    pub login_supported: bool,
    #[serde(default)]
    pub login_required: bool,
    #[serde(default)]
    pub use_signature_timestamp: bool,
    #[serde(default)]
    pub is_embedded: bool,
    /// Web client: needs PoToken + n-transform (deferred to Phase 2).
    #[serde(default)]
    pub use_web_po_tokens: bool,
}

const BUNDLED: &str = include_str!("../clients.json");

/// The client registry, loaded once at startup. Phase 1 ships four:
/// `WEB_REMIX` (metadata endpoints only — search/next), and the three direct-URL stream
/// clients `VISIONOS`, `ANDROID_VR_1_43_32`, `IOS`.
#[derive(Debug, Clone)]
pub struct Clients(HashMap<String, YouTubeClient>);

impl Clients {
    /// Parse the bundled `clients.json`. Panics only on a corrupt bundled asset (a build bug).
    pub fn bundled() -> Self {
        Clients(serde_json::from_str(BUNDLED).expect("bundled clients.json is valid"))
    }

    /// Parse a caller-supplied override (app data dir). Falls back to bundled on error.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        Ok(Clients(serde_json::from_str(json)?))
    }

    /// Look up a client by its registry key (e.g. `"VISIONOS"`, `"ANDROID_VR_1_43_32"`).
    pub fn get(&self, key: &str) -> Option<&YouTubeClient> {
        self.0.get(key)
    }
}

/// The primary `/player` client (context/06). WEB_REMIX gives authenticated-quality streams but
/// needs STS + PoToken + cipher/n-transform (all Phase 2). The orchestrator tries it first
/// (`startIndex = -1`) and takes track metadata from its response even when a fallback client
/// wins the actual stream.
pub const MAIN_CLIENT: &str = "WEB_REMIX";

/// Registry keys for the stream fallback order tried after MAIN_CLIENT (context/06
/// §minimal-but-correct). Direct-URL clients — no cipher, no PoToken — so they always play even
/// when the cipher/PoToken webviews are unavailable (graceful degradation).
///
/// IOS is deliberately absent. Its googlevideo URLs are served ONLY for bounded-Range requests:
/// a plain GET, a HEAD, or `Range: bytes=0-` (exactly what mpv opens a stream with) all 403,
/// while `Range: bytes=0-2047` returns 206. Measured on 21 of 22 sampled videos.
///
/// **ANDROID_VR 1.65 and 1.43 were removed 2026-09-22** (issue #292, KNOWN-ISSUES KI-11). Their
/// URLs are now served only for ranges ending inside the first mebibyte: HEAD 403s, the tail of
/// the file 403s, and so does the video stream. Both therefore lost every candidate to HEAD
/// validation before reaching the user, at the cost of two `/player` round trips and two HEADs on
/// every resolve that got this far. The client definitions stay in `clients.json`: if googlevideo
/// serves them again (or we gain SABR), putting the keys back here is the whole change.
///
/// **TVHTML5_SIMPLY added 2026-09-22.** A second identity that still resolves signed out, on a
/// different numeric client id (75), so a network or region where the bot check refuses the web
/// identity has somewhere left to go: that is the whole of issue #292's failure, where every leg
/// of the chain was refused at once and only signing in fixed it. It is a cipher + PoToken client
/// like WEB_REMIX, so it sits behind VISIONOS, which needs neither and costs one round trip.
/// Verified 2026-09-22: `/player` OK, deciphered URL 200 on HEAD and 206 on the last 256 bytes.
pub const STREAM_FALLBACK_ORDER: [&str; 2] = ["VISIONOS", "TVHTML5_SIMPLY"];

/// The fallback order for one of the user's own uploads (issue #71). YouTube only streams a
/// privately-owned track to an authenticated client, so every anonymous client in
/// [`STREAM_FALLBACK_ORDER`] (and rustypipe behind it) is a guaranteed miss: each one costs a
/// round trip and the user still gets a skip toast.
///
/// The effective chain is WEB_REMIX -> TVHTML5 -> WEB_CREATOR. WEB_REMIX is not listed here
/// because the orchestrator has already fetched its response for metadata and tries it in the
/// `idx == -1` slot; when it comes back LOGIN_REQUIRED/UNPLAYABLE that slot skips itself, which
/// leaves Metrolist's own TVHTML5-first order (its `ContentAwareFallbackStrategy`, PR #3517).
/// (A LOGIN_REQUIRED main response is also what promotes WEB_CREATOR into that first slot, so
/// WEB_CREATOR at the tail here is a second attempt, not the only one.)
pub const UPLOAD_FALLBACK_ORDER: [&str; 2] = ["TVHTML5", "WEB_CREATOR"];

/// The metadata client for search/next (renderer shape only comes back as WEB_REMIX).
pub const METADATA_CLIENT: &str = "WEB_REMIX";

/// The client for *timed* lyrics browse: only mobile clients get the `timedLyricsData` model
/// (WEB_REMIX degrades to plain text). See models::lyrics.
pub const LYRICS_TIMED_CLIENT: &str = "IOS_MUSIC";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_clients_parse() {
        let clients = Clients::bundled();
        for key in STREAM_FALLBACK_ORDER {
            assert!(clients.get(key).is_some(), "missing stream client {key}");
        }
        for key in UPLOAD_FALLBACK_ORDER {
            assert!(clients.get(key).is_some(), "missing upload client {key}");
            assert!(clients.get(key).unwrap().login_supported, "upload client {key} is anonymous");
        }
        assert!(clients.get(METADATA_CLIENT).is_some());
        assert!(clients.get(LYRICS_TIMED_CLIENT).is_some());
    }

    #[test]
    fn client_numeric_ids_are_strings() {
        let c = Clients::bundled();
        assert_eq!(c.get("WEB_REMIX").unwrap().client_id, "67");
        assert_eq!(c.get("VISIONOS").unwrap().client_id, "101");
        assert_eq!(c.get("ANDROID_VR_1_43_32").unwrap().client_id, "28");
        assert_eq!(c.get("ANDROID_VR_1_65_10").unwrap().client_id, "28");
    }

    /// Every flag TVHTML5_SIMPLY needs to answer at all. Without the signature timestamp or the
    /// PoToken it returns UNPLAYABLE ("The page needs to be reloaded") for every video, which
    /// looks exactly like a region block in the log. Measured 2026-09-22.
    #[test]
    fn tvhtml5_simply_asks_for_what_it_needs() {
        let c = Clients::bundled().0.remove("TVHTML5_SIMPLY").expect("TVHTML5_SIMPLY");
        assert_eq!(c.client_id, "75");
        assert!(c.use_signature_timestamp, "no STS means UNPLAYABLE on every video");
        assert!(c.use_web_po_tokens, "no PoToken means UNPLAYABLE on every video");
        assert!(!c.login_supported, "it is the anonymous leg: sending the cookie is not its job");
    }

    /// IOS only serves bounded-Range requests, which mpv never makes — it must never be a
    /// stream client (see STREAM_FALLBACK_ORDER).
    #[test]
    fn ios_is_not_a_stream_client() {
        assert!(!STREAM_FALLBACK_ORDER.contains(&"IOS"));
    }
}
