//! `FunctionNameExtractor` (context/05 §2) — find, inside a fetched `player.js`, the
//! signature-timestamp and the *names* of the signature-decipher and `n`-transform functions.
//!
//! Because the cipher webview runs YouTube's OWN `player.js`, we only need to NAME the entry
//! functions, not reimplement their bodies. Modern (2025+) player.js is Q-array obfuscated, so
//! regex name-finding is best-effort and can false-match in ~2.8 MB of code (context/05). The
//! reliable path is the config table ([`super::config`], `isHardcoded`); regex is the fallback,
//! and a webview brute-force ([`build_injection`] + the harness discovery script) is the net for
//! the `n` function. STS extraction, by contrast, is a simple and reliable literal search.

use regex::Regex;

/// The marker that closes player.js's IIFE — our export-injection point (verified present in the
/// live player.js). context/05 §CipherWebView injection.
pub const IIFE_TAIL: &str = "})(_yt_player);";

/// Extract the `signatureTimestamp` that must accompany the `/player` request (context/03, 05).
pub fn extract_sts(player_js: &str) -> Option<i32> {
    // Tolerate both `signatureTimestamp:20632` (raw) and `"sts":19999` (JSON-ish).
    let re = Regex::new(r#"(?:signatureTimestamp|sts)"?\s*[:=]\s*(\d{4,})"#).ok()?;
    re.captures(player_js)?.get(1)?.as_str().parse().ok()
}

/// Turn `player.js` into a self-exporting script: splice, inside the IIFE, exports that expose the
/// sig/n entry points on `window` so the harness can call them. context/05 §injection.
///
/// Both are built from a [`super::config::PlayerConfig`] rather than from a function *name*,
/// because the 2025+ VM-dispatch players have no statically findable sig/n function to name:
///
/// - `sig` is a call template, `Ii(25,558,INPUT)` → `window._cipherSigFunc=function(s){…Ii(25,558,s)…}`
/// - `n` is done through the player's own URL class rather than a raw function: construct
///   `new g.<nClass>(url, true)` and read back `n`. `g` is the IIFE parameter (verified: player.js
///   closes with `})(_yt_player);` and its IIFE takes `g`), which is why this must be spliced
///   inside the closure and not appended after it.
///
/// The config's strings are validated in `config.rs` before they get here — `sig` must match
/// `name(int,int,INPUT)` and `nClass` must be a bare identifier — so this only ever splices the
/// shapes shown above.
pub fn build_injection(player_js: &str, cfg: Option<&super::config::PlayerConfig>) -> String {
    let mut exports = String::from(";");
    if let Some(cfg) = cfg {
        let sig_call = cfg.sig_expr.replace("INPUT", "s");
        exports.push_str(&format!(
            "try{{window._cipherSigFunc=function(s){{\
               try{{return {sig_call};}}catch(e){{return null;}}}};}}catch(e){{}}"
        ));
        let n_class = &cfg.n_class;
        exports.push_str(&format!(
            "try{{window._nTransformFunc=function(n){{try{{\
               var u=new g.{n_class}('https://x.googlevideo.com/videoplayback?n='+n,true);\
               var t=u.get('n');return(t&&t!==n)?t:n;\
             }}catch(e){{return n;}}}};}}catch(e){{}}"
        ));
    }
    exports.push_str(IIFE_TAIL);
    // Replace only the final IIFE close so the exports live inside the player closure's scope.
    match player_js.rfind(IIFE_TAIL) {
        Some(idx) => {
            let mut out = String::with_capacity(player_js.len() + exports.len());
            out.push_str(&player_js[..idx]);
            out.push_str(&exports);
            out.push_str(&player_js[idx + IIFE_TAIL.len()..]);
            out
        }
        // No known tail (unexpected player shape) — append exports and hope globals are reachable.
        None => format!("{player_js}\n{exports}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sts_extracted() {
        assert_eq!(extract_sts("abc signatureTimestamp:20632 def"), Some(20632));
        assert_eq!(extract_sts(r#"...,"sts":19999,..."#), Some(19999));
        assert_eq!(extract_sts("no timestamp here"), None);
    }

    fn cfg() -> super::super::config::PlayerConfig {
        super::super::config::PlayerConfig {
            sts: Some(20670),
            sig_expr: "Ii(25,558,INPUT)".into(),
            n_class: "as".into(),
        }
    }

    #[test]
    fn injection_lands_inside_iife() {
        let js = "var _yt_player={};(function(g){g.foo=1;})(_yt_player);";
        let out = build_injection(js, Some(&cfg()));
        // INPUT is substituted with the argument name, so the call is made on the real signature.
        assert!(out.contains("return Ii(25,558,s);"));
        assert!(out.contains("new g.as('https://x.googlevideo.com/videoplayback?n='+n,true)"));
        assert!(!out.contains("INPUT"));
        // Exports sit before the (single) IIFE tail, and the tail still closes the script. This is
        // load-bearing: `Ii` and `g` only exist inside the closure.
        assert!(out.ends_with(IIFE_TAIL));
        assert!(out.find("window._cipherSigFunc").unwrap() < out.rfind(IIFE_TAIL).unwrap());
    }

    #[test]
    fn injection_skips_unknown_player() {
        let js = "(function(g){})(_yt_player);";
        let out = build_injection(js, None);
        assert!(!out.contains("_cipherSigFunc"));
        assert!(!out.contains("_nTransformFunc"));
        assert!(out.ends_with(IIFE_TAIL));
    }
}
