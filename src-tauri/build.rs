fn main() {
    // Last.fm API credentials live in a gitignored `lastfm.keys` next to this file (the repo is
    // public — they must never be tracked). Format: `VELUNA_LASTFM_API_KEY=…` and
    // `VELUNA_LASTFM_API_SECRET=…`, one per line. Exported as compile-time env for `option_env!`
    // in lastfm.rs; missing file just means the scrobbler reports "not configured".
    println!("cargo:rerun-if-changed=lastfm.keys");
    if let Ok(keys) = std::fs::read_to_string("lastfm.keys") {
        for line in keys.lines() {
            if let Some((k, v)) = line.split_once('=') {
                let (k, v) = (k.trim(), v.trim());
                if k == "VELUNA_LASTFM_API_KEY" || k == "VELUNA_LASTFM_API_SECRET" {
                    println!("cargo:rustc-env={k}={v}");
                } else if k == "LIMUSIC_LASTFM_API_KEY" {
                    println!("cargo:rustc-env=VELUNA_LASTFM_API_KEY={v}");
                } else if k == "LIMUSIC_LASTFM_API_SECRET" {
                    println!("cargo:rustc-env=VELUNA_LASTFM_API_SECRET={v}");
                }
            }
        }
    }
    // tauri-build watches tauri.conf.json but not the icons it embeds, so editing a PNG here
    // leaves `generate_context!` emitting the old `default_window_icon` (window, tray, taskbar).
    println!("cargo:rerun-if-changed=icons");

    // Ensure sidecar placeholder exists so tauri_build doesn't error during `cargo check` or `cargo test`
    // when ffmpeg hasn't been downloaded yet. Release builds download the real binary via setup-ffmpeg.mjs.
    let target = std::env::var("TARGET").unwrap_or_default();
    let binaries_dir = std::path::Path::new("binaries");
    if !binaries_dir.exists() {
        let _ = std::fs::create_dir_all(binaries_dir);
    }
    let ext = if target.contains("windows") { ".exe" } else { "" };
    let sidecar_name = format!("veluna-ffmpeg-{target}{ext}");
    let sidecar_path = binaries_dir.join(sidecar_name);
    if !sidecar_path.exists() {
        let _ = std::fs::write(&sidecar_path, b"");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&sidecar_path, std::fs::Permissions::from_mode(0o755));
        }
    }

    if target.contains("msvc") {
        // Exclude statically linked C runtime to resolve LNK4098 conflict with dynamic msvcrt.lib
        println!("cargo:rustc-link-arg=/NODEFAULTLIB:libcmt.lib");
    }

    tauri_build::build()
}
