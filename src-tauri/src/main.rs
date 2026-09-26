mod tray;
mod cache;
mod metadata;
mod db;
mod downloader;
#[cfg(target_os = "windows")]
mod windows_smtc;

use std::io::{Write, BufRead, BufReader};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use serde_json::Value;
use tauri::Emitter;
use tauri::Manager;
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

trait NoWindow {
    fn no_window(&mut self) -> &mut Self;
}

impl NoWindow for Command {
    #[cfg(windows)]
    fn no_window(&mut self) -> &mut Self {
        self.creation_flags(0x08000000)
    }
    #[cfg(not(windows))]
    fn no_window(&mut self) -> &mut Self {
        self
    }
}

impl NoWindow for tokio::process::Command {
    #[cfg(windows)]
    fn no_window(&mut self) -> &mut Self {
        self.creation_flags(0x08000000)
    }
    #[cfg(not(windows))]
    fn no_window(&mut self) -> &mut Self {
        self
    }
}

#[cfg(unix)]
use std::os::unix::net::UnixStream;

#[cfg(windows)]
use std::fs::OpenOptions;

static SOCKET_PATH: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn socket_path() -> &'static str {
    SOCKET_PATH.get_or_init(|| {
        let pid = std::process::id();
        #[cfg(unix)]
        {
            if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
                format!("{}/veluna-mpv-{}.sock", runtime_dir.trim_end_matches('/'), pid)
            } else {
                let tmp = std::env::temp_dir();
                format!("{}/veluna-mpv-{}.sock", tmp.to_string_lossy().trim_end_matches('/'), pid)
            }
        }
        #[cfg(windows)]
        {
            format!(r"\\.\pipe\veluna-mpv-{}", pid)
        }
    })
}

#[derive(Clone)]
pub struct MprisMetadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub url: String,
    pub cover_url: String,
    pub duration_us: i64,
    pub playing: bool,
    pub is_stopped: bool,
    pub track_seq: u64,
    pub loop_status: String,
    pub shuffle: bool,
    pub volume: f64,
    pub rate: f64,
}

impl Default for MprisMetadata {
    fn default() -> Self {
        Self {
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            album_artist: String::new(),
            url: String::new(),
            cover_url: String::new(),
            duration_us: 0,
            playing: false,
            is_stopped: true,
            track_seq: 1,
            loop_status: "None".to_string(),
            shuffle: false,
            volume: 1.0,
            rate: 1.0,
        }
    }
}

static MPRIS_META: std::sync::OnceLock<Mutex<MprisMetadata>> = std::sync::OnceLock::new();
static MPRIS_TRACK_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn mpris_meta() -> &'static Mutex<MprisMetadata> {
    MPRIS_META.get_or_init(|| Mutex::new(MprisMetadata::default()))
}

#[cfg(target_os = "linux")]
static MPRIS_TX: std::sync::OnceLock<tokio::sync::watch::Sender<()>> = std::sync::OnceLock::new();

#[cfg(target_os = "linux")]
fn mpris_notify() {
    if let Some(tx) = MPRIS_TX.get() { let _ = tx.send(()); }
}
#[cfg(target_os = "windows")]
fn mpris_notify() {
    let meta = mpris_meta().lock().unwrap().clone();
    windows_smtc::update_windows_smtc(&meta);
}
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn mpris_notify() {}

fn resolve_bin(name: &str, search_paths: &[String]) -> String {
    for dir in search_paths {
        #[cfg(target_os = "windows")]
        let full = format!("{}\\{}.exe", dir, name);
        #[cfg(not(target_os = "windows"))]
        let full = format!("{}/{}", dir, name);

        let p = std::path::Path::new(&full);
        if p.is_file() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = p.metadata() {
                    if meta.permissions().mode() & 0o111 != 0 {
                        return full;
                    }
                }
            }
            #[cfg(windows)]
            return full;
        }
    }
    name.to_string()
}

static BIN_MPV:     std::sync::OnceLock<String> = std::sync::OnceLock::new();
static BIN_YTDLP:   std::sync::OnceLock<String> = std::sync::OnceLock::new();
static BIN_FFPROBE: std::sync::OnceLock<String> = std::sync::OnceLock::new();
static BIN_FFMPEG:  std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn init_bin_paths() {
    let mut paths: Vec<String> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        if let Ok(exe_p) = std::env::current_exe() {
            if let Some(exe_dir) = exe_p.parent() {
                let dir_s = exe_dir.to_string_lossy().to_string();
                paths.push(dir_s.clone());
                paths.push(format!("{}\\resources", dir_s));
                paths.push(format!("{}\\binaries", dir_s));
            }
        }

        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let user_profile   = std::env::var("USERPROFILE").unwrap_or_default();
        
        paths.push(format!("{}\\Programs\\veluna-deps\\mpv",    local_app_data));
        paths.push(format!("{}\\Programs\\veluna-deps\\ffmpeg",  local_app_data));
        paths.push(format!("{}\\Programs\\veluna-deps",          local_app_data));
        
        paths.push(format!("{}\\Programs\\mpv",    local_app_data));
        paths.push("C:\\Program Files\\mpv".into());
        paths.push("C:\\Program Files (x86)\\mpv".into());
        paths.push("C:\\ProgramData\\chocolatey\\bin".into());
        paths.push(format!("{}\\scoop\\shims", user_profile));
        paths.push(format!("{}\\AppData\\Local\\Microsoft\\WindowsApps", user_profile));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let appimage = std::env::var("APPIMAGE").is_ok();
        let host = if appimage { "/proc/1/root" } else { "" };

        for p in &[
            format!("{}/.local/bin", home),
            format!("{}/.cargo/bin", home),
            "/usr/local/bin".to_string(),
            "/usr/bin".to_string(),
            "/bin".to_string(),
            "/snap/bin".to_string(),
            "/var/lib/flatpak/exports/bin".to_string(),
            "/usr/games".to_string(),
        ] {
            if !host.is_empty() { paths.push(format!("{}{}", host, p)); }
            paths.push(p.clone());
        }
    }

    if let Ok(env_path) = std::env::var("PATH") {
        #[cfg(target_os = "windows")]
        let sep = ';';
        #[cfg(not(target_os = "windows"))]
        let sep = ':';
        for p in env_path.split(sep) {
            let s = p.to_string();
            if !paths.contains(&s) { paths.push(s); }
        }
    }

    #[cfg(target_os = "windows")]
    let sep = ";";
    #[cfg(not(target_os = "windows"))]
    let sep = ":";

    let clean: Vec<&str> = paths.iter()
        .filter(|p| !p.starts_with("/proc/1/root"))
        .map(|s| s.as_str())
        .collect();
    std::env::set_var("PATH", clean.join(sep));

    let mpv     = resolve_bin("mpv",     &paths);
    let ytdlp   = resolve_bin("yt-dlp",  &paths);
    let ffprobe = resolve_bin("ffprobe", &paths);
    let ffmpeg  = resolve_bin("ffmpeg",  &paths);

    eprintln!("[veluna] mpv     -> {}", mpv);
    eprintln!("[veluna] yt-dlp  -> {}", ytdlp);
    eprintln!("[veluna] ffprobe -> {}", ffprobe);
    eprintln!("[veluna] ffmpeg  -> {}", ffmpeg);

    fn set_or_update(lock: &std::sync::OnceLock<String>, val: String) {
        if lock.get().is_none() {
            let _ = lock.set(val);
        }
        
    }
    set_or_update(&BIN_MPV,     mpv);
    set_or_update(&BIN_YTDLP,   ytdlp);
    set_or_update(&BIN_FFPROBE, ffprobe);
    set_or_update(&BIN_FFMPEG,  ffmpeg);
}

fn bin_mpv()     -> &'static str { BIN_MPV.get().map(|s| s.as_str()).unwrap_or("mpv") }
fn bin_ytdlp()   -> &'static str { BIN_YTDLP.get().map(|s| s.as_str()).unwrap_or("yt-dlp") }
fn bin_ffprobe() -> &'static str { BIN_FFPROBE.get().map(|s| s.as_str()).unwrap_or("ffprobe") }
fn bin_ffmpeg()  -> &'static str { BIN_FFMPEG.get().map(|s| s.as_str()).unwrap_or("ffmpeg") }

struct CacheEntry { url: String, ts: std::time::Instant }

lazy_static::lazy_static! {
    static ref PREFETCH_CACHE: Arc<std::sync::RwLock<HashMap<String, CacheEntry>>> =
        Arc::new(std::sync::RwLock::new(HashMap::new()));

    static ref SLEEP_TIMER: Arc<Mutex<Option<(std::time::Instant, u64)>>> =
        Arc::new(Mutex::new(None));
    static ref SLEEP_TIMER_GEN: Arc<Mutex<u64>> = Arc::new(Mutex::new(0));

    static ref LOUDNORM_ENABLED: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
    static ref SKIP_SILENCE: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
    static ref CURRENT_EQ: Arc<Mutex<(f64, f64, f64)>> = Arc::new(Mutex::new((0.0, 0.0, 0.0)));
}

// Persistent mpv process handle: spawned once at startup, reused across all tracks.
// Using Option<Child> so we can detect crashes and respawn.
static MPV_PROCESS: std::sync::OnceLock<Mutex<Option<std::process::Child>>> = std::sync::OnceLock::new();
fn mpv_process() -> &'static Mutex<Option<std::process::Child>> {
    MPV_PROCESS.get_or_init(|| Mutex::new(None))
}

static PLAY_COUNTER: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

static PREFETCH_SEMAPHORE: std::sync::OnceLock<tokio::sync::Semaphore> = std::sync::OnceLock::new();
fn prefetch_semaphore() -> &'static tokio::sync::Semaphore {
    PREFETCH_SEMAPHORE.get_or_init(|| tokio::sync::Semaphore::new(4))
}

fn truncate_str(s: &str, max_chars: usize) -> &str {
    match s.char_indices().nth(max_chars) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}

fn expand_tilde(path: &str) -> String {
    if path == "~" || path.starts_with("~/") || path.starts_with("~\\") {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        return path.replacen('~', &home, 1);
    }
    path.to_string()
}

fn sanitize_stream_url(url: &str) -> Result<String, String> {
    let u = url.trim();
    if u.starts_with("https://") || u.starts_with("http://") {
        Ok(u.to_string())
    } else {
        Err(format!("Rejected URL with unsafe scheme: {}", truncate_str(u, 80)))
    }
}

fn sanitize_file_path(path: &str) -> Result<std::path::PathBuf, String> {
    #[allow(unused_mut)]
    let mut expanded = expand_tilde(
        path.trim_start_matches("local://")
            .trim_start_matches("file://")
            .trim()
    );
    #[cfg(target_os = "windows")]
    {
        if expanded.starts_with('/') || expanded.starts_with('\\') {
            let rest = &expanded[1..];
            if rest.len() >= 2
                && rest.chars().next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false)
                && rest.chars().nth(1) == Some(':')
            {
                expanded = rest.to_string();
            }
        }
    }
    let p = std::path::Path::new(&expanded);
    if !p.is_absolute() {
        return Err(format!("Path must be absolute: {}", truncate_str(&expanded, 200)));
    }
    match p.canonicalize() {
        Ok(canon) => Ok(canon),
        Err(_) => {
            if expanded.contains("..") {
                return Err("Path traversal not allowed".to_string());
            }
            Ok(p.to_path_buf())
        }
    }
}

fn safe_f64(v: f64) -> f64 {
    if v.is_finite() { v } else { 0.0 }
}

#[derive(Clone, Default)]
struct NetworkConfig {
    proxy_url: Option<String>,
    custom_instance: Option<String>,
}

static NETWORK_CONFIG: std::sync::OnceLock<Mutex<NetworkConfig>> = std::sync::OnceLock::new();

fn network_config() -> &'static Mutex<NetworkConfig> {
    NETWORK_CONFIG.get_or_init(|| Mutex::new(NetworkConfig::default()))
}

fn get_proxy_url() -> Option<String> {
    network_config().lock().unwrap().proxy_url.clone()
}

fn get_custom_instance() -> Option<String> {
    network_config().lock().unwrap().custom_instance.clone()
}

fn apply_proxy_to_cmd(cmd: &mut std::process::Command) {
    if let Some(proxy_str) = get_proxy_url() {
        cmd.args(["--proxy", &proxy_str]);
    }
}

static CURRENT_HTTP_CLIENT: std::sync::OnceLock<Mutex<Option<(Option<String>, reqwest::Client)>>> = std::sync::OnceLock::new();

fn create_http_client(timeout_ms: u64) -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .tcp_keepalive(std::time::Duration::from_secs(60));

    if let Some(proxy_str) = get_proxy_url() {
        if let Ok(proxy) = reqwest::Proxy::all(&proxy_str) {
            builder = builder.proxy(proxy);
        }
    }

    builder.build().unwrap_or_default()
}

fn get_http_client() -> reqwest::Client {
    let current_proxy = get_proxy_url();
    let cache_lock = CURRENT_HTTP_CLIENT.get_or_init(|| Mutex::new(None));
    let mut guard = cache_lock.lock().unwrap();
    if let Some((ref cached_proxy, ref client)) = *guard {
        if cached_proxy == &current_proxy {
            return client.clone();
        }
    }
    let new_client = create_http_client(2500);
    *guard = Some((current_proxy, new_client.clone()));
    new_client
}

async fn search_custom_instance(query: &str, instance_url: &str) -> Option<String> {
    let clean_inst = instance_url.trim().trim_end_matches('/');
    if clean_inst.is_empty() { return None; }
    let base_url = if clean_inst.starts_with("http://") || clean_inst.starts_with("https://") {
        clean_inst.to_string()
    } else {
        format!("https://{}", clean_inst)
    };

    let client = get_http_client();
    let encoded_q = urlencoding::encode(query);

    // 1. Try Piped Search API: /search?q={query}&filter=music_songs
    let piped_url = format!("{}/search?q={}&filter=music_songs", base_url, encoded_q);
    if let Ok(res) = client.get(&piped_url).send().await {
        if res.status().is_success() {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                if let Some(arr) = json.get("items").and_then(|i| i.as_array()).or_else(|| json.as_array()) {
                    let mut items = Vec::new();
                    for item in arr {
                        let title = item.get("title").and_then(|t| t.as_str()).unwrap_or("").trim();
                        let uploader = item.get("uploaderName").and_then(|u| u.as_str()).unwrap_or("Unknown").trim();
                        let dur_secs = item.get("duration").and_then(|d| d.as_i64()).unwrap_or(0);
                        let dur_str = if dur_secs > 0 {
                            format!("{}:{:02}", dur_secs / 60, dur_secs % 60)
                        } else {
                            "0:00".to_string()
                        };
                        let url_str = item.get("url").and_then(|u| u.as_str()).unwrap_or("");
                        let video_id = if let Some(idx) = url_str.find("v=") {
                            &url_str[idx+2..]
                        } else if let Some(idx) = url_str.find("/watch?v=") {
                            &url_str[idx+9..]
                        } else {
                            url_str.trim_start_matches('/')
                        };
                        if !title.is_empty() && !video_id.is_empty() {
                            items.push(format!("{}===={}===={}===={}", title, uploader, dur_str, video_id));
                        }
                    }
                    if !items.is_empty() {
                        return Some(items.join("\n"));
                    }
                }
            }
        }
    }

    // 2. Try Invidious Search API: /api/v1/search?q={query}&type=video
    let inv_url = format!("{}/api/v1/search?q={}&type=video", base_url, encoded_q);
    if let Ok(res) = client.get(&inv_url).send().await {
        if res.status().is_success() {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                if let Some(arr) = json.as_array() {
                    let mut items = Vec::new();
                    for item in arr {
                        let title = item.get("title").and_then(|t| t.as_str()).unwrap_or("").trim();
                        let uploader = item.get("author").and_then(|u| u.as_str()).unwrap_or("Unknown").trim();
                        let dur_secs = item.get("lengthSeconds").and_then(|d| d.as_i64()).unwrap_or(0);
                        let dur_str = if dur_secs > 0 {
                            format!("{}:{:02}", dur_secs / 60, dur_secs % 60)
                        } else {
                            "0:00".to_string()
                        };
                        let video_id = item.get("videoId").and_then(|v| v.as_str()).unwrap_or("");
                        if !title.is_empty() && !video_id.is_empty() {
                            items.push(format!("{}===={}===={}===={}", title, uploader, dur_str, video_id));
                        }
                    }
                    if !items.is_empty() {
                        return Some(items.join("\n"));
                    }
                }
            }
        }
    }

    None
}

async fn extract_stream_custom_instance(video_id: &str, instance_url: &str) -> Option<String> {
    let clean_inst = instance_url.trim().trim_end_matches('/');
    if clean_inst.is_empty() { return None; }
    let base_url = if clean_inst.starts_with("http://") || clean_inst.starts_with("https://") {
        clean_inst.to_string()
    } else {
        format!("https://{}", clean_inst)
    };

    let client = get_http_client();

    // 1. Try Piped stream endpoint: /streams/{video_id}
    let piped_url = format!("{}/streams/{}", base_url, video_id);
    if let Ok(res) = client.get(&piped_url).send().await {
        if res.status().is_success() {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                if let Some(audio_streams) = json.get("audioStreams").and_then(|a| a.as_array()) {
                    let mut best_url: Option<(i64, String)> = None;
                    for stream in audio_streams {
                        if let Some(url) = stream.get("url").and_then(|u| u.as_str()) {
                            let bitrate = stream.get("bitrate").and_then(|b| b.as_i64()).unwrap_or(0);
                            if best_url.as_ref().map(|(b, _)| bitrate > *b).unwrap_or(true) {
                                best_url = Some((bitrate, url.to_string()));
                            }
                        }
                    }
                    if let Some((_, url)) = best_url {
                        return Some(url);
                    }
                }
            }
        }
    }

    // 2. Try Invidious video endpoint: /api/v1/videos/{video_id}
    let inv_url = format!("{}/api/v1/videos/{}", base_url, video_id);
    if let Ok(res) = client.get(&inv_url).send().await {
        if res.status().is_success() {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                if let Some(formats) = json.get("adaptiveFormats").and_then(|a| a.as_array()) {
                    let mut best_url: Option<(i64, String)> = None;
                    for fmt in formats {
                        let type_str = fmt.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if type_str.starts_with("audio/") {
                            if let Some(url) = fmt.get("url").and_then(|u| u.as_str()) {
                                let bitrate = fmt.get("bitrate").and_then(|b| b.as_i64()).or_else(|| fmt.get("bitrate").and_then(|b| b.as_str()?.parse().ok())).unwrap_or(0);
                                if best_url.as_ref().map(|(b, _)| bitrate > *b).unwrap_or(true) {
                                    best_url = Some((bitrate, url.to_string()));
                                }
                            }
                        }
                    }
                    if let Some((_, url)) = best_url {
                        return Some(url);
                    }
                }
            }
        }
    }

    None
}

async fn search_youtube_direct(query: &str) -> Option<String> {
    let q = query.trim();
    if q.is_empty() { return None; }
    let client = get_http_client();

    let body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240801.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "query": q,
        "params": "EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D"
    });

    let res = client.post("https://music.youtube.com/youtubei/v1/search?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
        .header("Origin", "https://music.youtube.com")
        .json(&body)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() { return None; }
    let json: serde_json::Value = res.json().await.ok()?;

    let mut items = Vec::new();
    fn extract_music_items(val: &serde_json::Value, items: &mut Vec<String>) {
        if let Some(obj) = val.as_object() {
            if let Some(item) = obj.get("musicResponsiveListItemRenderer") {
                let mut title = String::from("Unknown");
                let mut uploader = String::from("Unknown");
                let mut duration = String::from("0:00");
                let mut video_id = None;

                if let Some(flex_cols) = item.get("flexColumns").and_then(|f| f.as_array()) {
                    if let Some(col0) = flex_cols.get(0) {
                        if let Some(runs) = col0.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs").and_then(|r| r.as_array()) {
                            if let Some(run0) = runs.get(0) {
                                if let Some(t) = run0.get("text").and_then(|t| t.as_str()) {
                                    title = t.to_string();
                                }
                                if let Some(v_id) = run0.pointer("/navigationEndpoint/watchEndpoint/videoId").and_then(|id| id.as_str()) {
                                    video_id = Some(v_id.to_string());
                                }
                            }
                        }
                    }
                    if video_id.is_none() {
                        if let Some(v_id) = item.pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId").and_then(|id| id.as_str()) {
                            video_id = Some(v_id.to_string());
                        }
                    }
                    if let Some(col1) = flex_cols.get(1) {
                        if let Some(runs) = col1.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs").and_then(|r| r.as_array()) {
                            let mut artist_parts = Vec::new();
                            let mut found_separator = false;
                            for r in runs {
                                if let Some(t) = r.get("text").and_then(|t| t.as_str()) {
                                    let trimmed = t.trim();
                                    if trimmed == "•" || trimmed == "·" {
                                        found_separator = true;
                                    } else if !found_separator && !t.is_empty() {
                                        artist_parts.push(t);
                                    }
                                    if trimmed.contains(':') && (trimmed.len() == 4 || trimmed.len() == 5 || trimmed.len() == 7 || trimmed.len() == 8) {
                                        duration = trimmed.to_string();
                                    }
                                }
                            }
                            if !artist_parts.is_empty() {
                                uploader = artist_parts.concat().trim().to_string();
                            }
                        }
                    }
                }
                if let Some(fixed_cols) = item.get("fixedColumns").and_then(|f| f.as_array()) {
                    if let Some(col0) = fixed_cols.get(0) {
                        if let Some(runs) = col0.pointer("/musicResponsiveListItemFixedColumnRenderer/text/runs").and_then(|r| r.as_array()) {
                            if let Some(run0) = runs.get(0) {
                                if let Some(d) = run0.get("text").and_then(|t| t.as_str()) {
                                    duration = d.to_string();
                                }
                            }
                        }
                    }
                }

                if let Some(vid) = video_id {
                    if !title.is_empty() {
                        items.push(format!("{}===={}===={}===={}", title, uploader, duration, vid));
                    }
                }
            }
            for v in obj.values() {
                extract_music_items(v, items);
            }
        } else if let Some(arr) = val.as_array() {
            for v in arr {
                extract_music_items(v, items);
            }
        }
    }

    extract_music_items(&json, &mut items);

    if items.is_empty() {
        None
    } else {
        Some(items.join("\n"))
    }
}

fn find_thumbnail_url(val: &serde_json::Value) -> Option<String> {
    if let Some(arr) = val.get("thumbnails").and_then(|t| t.as_array()) {
        if let Some(last) = arr.last() {
            if let Some(u) = last.get("url").and_then(|u| u.as_str()) {
                let mut url = u.to_string();
                if url.starts_with("//") {
                    url = format!("https:{}", url);
                }
                return Some(url);
            }
        }
    }
    if let Some(obj) = val.as_object() {
        for (k, v) in obj {
            if k == "thumbnail" || k == "thumbnails" || k == "thumbnailRenderer" || k == "musicThumbnailRenderer" || k == "leftThumbnail" {
                if let Some(found) = find_thumbnail_url(v) {
                    return Some(found);
                }
            }
        }
    }
    None
}

async fn search_youtube_artists_direct(query: &str) -> Option<String> {
    let q = query.trim();
    if q.is_empty() { return None; }
    let client = get_http_client();

    let body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240801.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "query": q,
        "params": "EgWKAQIgAUICCAE%3D"
    });

    let res = client.post("https://music.youtube.com/youtubei/v1/search?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
        .header("Origin", "https://music.youtube.com")
        .json(&body)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() { return None; }
    let json: serde_json::Value = res.json().await.ok()?;

    let mut items = Vec::new();
    let mut seen_names = std::collections::HashSet::new();

    fn extract_artists(val: &serde_json::Value, items: &mut Vec<String>, seen: &mut std::collections::HashSet<String>) {
        if let Some(obj) = val.as_object() {
            if let Some(item) = obj.get("musicResponsiveListItemRenderer") {
                let mut name = String::new();
                let mut avatar = String::new();
                let mut subtitle = String::from("Artist");
                let mut browse_id = String::new();

                if let Some(flex_cols) = item.get("flexColumns").and_then(|f| f.as_array()) {
                    if let Some(col0) = flex_cols.get(0) {
                        if let Some(runs) = col0.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs").and_then(|r| r.as_array()) {
                            if let Some(run0) = runs.get(0) {
                                if let Some(t) = run0.get("text").and_then(|t| t.as_str()) {
                                    name = t.to_string();
                                }
                                if let Some(bid) = run0.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|id| id.as_str()) {
                                    browse_id = bid.to_string();
                                }
                            }
                        }
                    }
                    if let Some(col1) = flex_cols.get(1) {
                        if let Some(runs) = col1.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs").and_then(|r| r.as_array()) {
                            let sub: Vec<&str> = runs.iter().filter_map(|r| r.get("text").and_then(|t| t.as_str())).collect();
                            if !sub.is_empty() {
                                subtitle = sub.concat();
                            }
                        }
                    }
                }

                if browse_id.is_empty() {
                    if let Some(bid) = item.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|id| id.as_str()) {
                        browse_id = bid.to_string();
                    }
                }
                if browse_id.is_empty() {
                    if let Some(bid) = item.pointer("/thumbnail/musicThumbnailRenderer/navigationEndpoint/browseEndpoint/browseId").and_then(|id| id.as_str()) {
                        browse_id = bid.to_string();
                    }
                }

                if let Some(found_avatar) = find_thumbnail_url(item) {
                    avatar = found_avatar;
                }

                let norm_name = name.trim().to_lowercase();
                if !norm_name.is_empty() && !seen.contains(&norm_name) {
                    seen.insert(norm_name);
                    items.push(format!("{}===={}===={}===={}", name.trim(), avatar.trim(), subtitle.trim(), browse_id.trim()));
                }
            }

            if let Some(item) = obj.get("musicCardShelfRenderer") {
                let mut name = String::new();
                let mut avatar = String::new();
                let mut subtitle = String::from("Artist");
                let mut browse_id = String::new();

                if let Some(runs) = item.pointer("/title/runs").and_then(|r| r.as_array()) {
                    if let Some(run0) = runs.get(0) {
                        if let Some(t) = run0.get("text").and_then(|t| t.as_str()) {
                            name = t.to_string();
                        }
                        if let Some(bid) = run0.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|id| id.as_str()) {
                            browse_id = bid.to_string();
                        }
                    }
                }
                if browse_id.is_empty() {
                    if let Some(bid) = item.pointer("/title/runs/0/navigationEndpoint/browseEndpoint/browseId").and_then(|id| id.as_str()) {
                        browse_id = bid.to_string();
                    }
                }
                if let Some(found_avatar) = find_thumbnail_url(item) {
                    avatar = found_avatar;
                }
                if let Some(sub) = item.pointer("/subtitle/runs/0/text").and_then(|s| s.as_str()) {
                    subtitle = sub.to_string();
                }

                let norm_name = name.trim().to_lowercase();
                if !norm_name.is_empty() && !seen.contains(&norm_name) {
                    seen.insert(norm_name);
                    items.push(format!("{}===={}===={}===={}", name.trim(), avatar.trim(), subtitle.trim(), browse_id.trim()));
                }
            }

            if let Some(item) = obj.get("musicTwoRowItemRenderer") {
                let mut name = String::new();
                let mut avatar = String::new();
                let mut subtitle = String::from("Artist");
                let mut browse_id = String::new();

                if let Some(runs) = item.pointer("/title/runs").and_then(|r| r.as_array()) {
                    if let Some(run0) = runs.get(0) {
                        if let Some(t) = run0.get("text").and_then(|t| t.as_str()) {
                            name = t.to_string();
                        }
                        if let Some(bid) = run0.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|id| id.as_str()) {
                            browse_id = bid.to_string();
                        }
                    }
                }
                if browse_id.is_empty() {
                    if let Some(bid) = item.pointer("/navigationEndpoint/browseEndpoint/browseId").and_then(|id| id.as_str()) {
                        browse_id = bid.to_string();
                    }
                }

                if let Some(runs) = item.pointer("/subtitle/runs").and_then(|r| r.as_array()) {
                    let sub: Vec<&str> = runs.iter().filter_map(|r| r.get("text").and_then(|t| t.as_str())).collect();
                    if !sub.is_empty() {
                        subtitle = sub.concat();
                    }
                }

                if let Some(found_avatar) = find_thumbnail_url(item) {
                    avatar = found_avatar;
                }

                let norm_name = name.trim().to_lowercase();
                if !norm_name.is_empty() && !seen.contains(&norm_name) {
                    seen.insert(norm_name);
                    items.push(format!("{}===={}===={}===={}", name.trim(), avatar.trim(), subtitle.trim(), browse_id.trim()));
                }
            }

            for v in obj.values() {
                extract_artists(v, items, seen);
            }
        } else if let Some(arr) = val.as_array() {
            for v in arr {
                extract_artists(v, items, seen);
            }
        }
    }

    extract_artists(&json, &mut items, &mut seen_names);

    if items.is_empty() {
        None
    } else {
        Some(items.join("\n"))
    }
}

#[tauri::command]
async fn search_youtube_artists(query: String) -> Result<String, String> {
    let q_trim = query.trim().to_string();
    if q_trim.is_empty() {
        return Ok(String::new());
    }

    if let Some(direct) = search_youtube_artists_direct(&q_trim).await {
        if !direct.trim().is_empty() {
            return Ok(direct);
        }
    }

    // Direct YouTube channel search fallback via HTTP
    let client = get_http_client();
    let encoded = urlencoding::encode(&q_trim);
    let yt_url = format!("https://www.youtube.com/results?search_query={}&sp=EgIQAg%3D%3D", encoded);
    if let Ok(resp) = client.get(&yt_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
        .send()
        .await
    {
        if let Ok(html) = resp.text().await {
            if let Some(start_idx) = html.find("var ytInitialData = ") {
                let json_slice = &html[start_idx + 20..];
                if let Some(end_idx) = json_slice.find(";</script>") {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&json_slice[..end_idx]) {
                        let mut items = Vec::new();
                        let mut seen = std::collections::HashSet::new();

                        fn extract_channel_items(val: &serde_json::Value, items: &mut Vec<String>, seen: &mut std::collections::HashSet<String>) {
                            if let Some(obj) = val.as_object() {
                                if let Some(ch) = obj.get("channelRenderer") {
                                    let mut title = String::new();
                                    let mut avatar = String::new();
                                    let mut subs = String::from("Artist");
                                    let mut channel_id = String::new();

                                    if let Some(t) = ch.pointer("/title/simpleText").and_then(|t| t.as_str()) {
                                        title = t.to_string();
                                    }
                                    if let Some(cid) = ch.get("channelId").and_then(|c| c.as_str()) {
                                        channel_id = cid.to_string();
                                    }
                                    if let Some(s) = ch.pointer("/subscriberCountText/simpleText").and_then(|s| s.as_str()) {
                                        subs = s.to_string();
                                    }
                                    if let Some(thumbs) = ch.pointer("/thumbnail/thumbnails").and_then(|t| t.as_array()) {
                                        if let Some(last) = thumbs.last() {
                                            if let Some(u) = last.get("url").and_then(|u| u.as_str()) {
                                                let mut url = u.to_string();
                                                if url.starts_with("//") {
                                                    url = format!("https:{}", url);
                                                }
                                                avatar = url;
                                            }
                                        }
                                    }

                                    let norm = title.trim().to_lowercase();
                                    if !norm.is_empty() && !seen.contains(&norm) {
                                        seen.insert(norm);
                                        items.push(format!("{}===={}===={}===={}", title.trim(), avatar.trim(), subs.trim(), channel_id.trim()));
                                    }
                                }

                                for v in obj.values() {
                                    extract_channel_items(v, items, seen);
                                }
                            } else if let Some(arr) = val.as_array() {
                                for v in arr {
                                    extract_channel_items(v, items, seen);
                                }
                            }
                        }

                        extract_channel_items(&json, &mut items, &mut seen);
                        if !items.is_empty() {
                            return Ok(items.join("\n"));
                        }
                    }
                }
            }
        }
    }

    Ok(String::new())
}

async fn fetch_artist_browse_details(browse_id: &str) -> Option<(String, String, Vec<String>)> {
    let client = get_http_client();
    let body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240801.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "browseId": browse_id
    });

    let res = client.post("https://music.youtube.com/youtubei/v1/browse?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
        .header("Origin", "https://music.youtube.com")
        .json(&body)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() { return None; }
    let json: serde_json::Value = res.json().await.ok()?;

    let mut avatar = String::new();
    let mut banner = String::new();
    let mut tracks = Vec::new();

    // Extract headers (avatar / banner)
    if let Some(header) = json.get("header") {
        if let Some(found_avatar) = find_thumbnail_url(header) {
            avatar = found_avatar;
        }
    }

    // Extract tracks
    fn extract_tracks_from_shelf(val: &serde_json::Value, tracks: &mut Vec<String>) {
        if let Some(obj) = val.as_object() {
            if let Some(item) = obj.get("musicResponsiveListItemRenderer") {
                let mut title = String::new();
                let mut uploader = String::new();
                let mut duration = String::from("0:00");
                let mut video_id = None;

                if let Some(flex_cols) = item.get("flexColumns").and_then(|f| f.as_array()) {
                    if let Some(col0) = flex_cols.get(0) {
                        if let Some(runs) = col0.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs").and_then(|r| r.as_array()) {
                            if let Some(run0) = runs.get(0) {
                                if let Some(t) = run0.get("text").and_then(|t| t.as_str()) {
                                    title = t.to_string();
                                }
                                if let Some(v_id) = run0.pointer("/navigationEndpoint/watchEndpoint/videoId").and_then(|id| id.as_str()) {
                                    video_id = Some(v_id.to_string());
                                }
                            }
                        }
                    }
                    if video_id.is_none() {
                        if let Some(v_id) = item.pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId").and_then(|id| id.as_str()) {
                            video_id = Some(v_id.to_string());
                        }
                    }
                    if video_id.is_none() {
                        if let Some(v_id) = item.pointer("/playlistItemData/videoId").and_then(|id| id.as_str()) {
                            video_id = Some(v_id.to_string());
                        }
                    }
                    if video_id.is_none() {
                        if let Some(v_id) = item.pointer("/menu/menuRenderer/topLevelButtons/0/likeButtonRenderer/target/videoId").and_then(|id| id.as_str()) {
                            video_id = Some(v_id.to_string());
                        }
                    }
                    if let Some(col1) = flex_cols.get(1) {
                        if let Some(runs) = col1.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs").and_then(|r| r.as_array()) {
                            let mut artist_parts = Vec::new();
                            let mut found_separator = false;
                            for r in runs {
                                if let Some(t) = r.get("text").and_then(|t| t.as_str()) {
                                    let trimmed = t.trim();
                                    if trimmed == "•" || trimmed == "·" {
                                        found_separator = true;
                                    } else if !found_separator && !t.is_empty() {
                                        artist_parts.push(t);
                                    }
                                    if trimmed.contains(':') && (trimmed.len() == 4 || trimmed.len() == 5 || trimmed.len() == 7 || trimmed.len() == 8) {
                                        duration = trimmed.to_string();
                                    }
                                }
                            }
                            if !artist_parts.is_empty() {
                                uploader = artist_parts.concat().trim().to_string();
                            }
                        }
                    }
                }
                if let Some(vid) = video_id {
                    if !title.is_empty() && !vid.is_empty() && vid != "NA" {
                        tracks.push(format!("{}===={}===={}===={}", title, uploader, duration, vid));
                    }
                }
            }
            for v in obj.values() {
                extract_tracks_from_shelf(v, tracks);
            }
        } else if let Some(arr) = val.as_array() {
            for v in arr {
                extract_tracks_from_shelf(v, tracks);
            }
        }
    }

    extract_tracks_from_shelf(&json, &mut tracks);
    if banner.is_empty() { banner = avatar.clone(); }

    Some((avatar, banner, tracks))
}

fn track_matches_artist(title: &str, artist: &str, target_artist: &str) -> bool {
    let target = target_artist.trim().to_lowercase();
    if target.is_empty() { return false; }

    let art = artist.trim().to_lowercase();
    if art == target || art.contains(&target) || (target.contains(&art) && art.len() >= 3) {
        return true;
    }

    for part in art.split([',', ';', '&', '/']).map(|s| s.trim()) {
        let p_clean = part.replace("feat.", "").replace("ft.", "").replace(" - topic", "").trim().to_string();
        if p_clean == target || p_clean.contains(&target) || (target.contains(&p_clean) && p_clean.len() >= 3) {
            return true;
        }
    }

    let title_clean = title.trim();
    if let Some((first, _)) = title_clean.split_once('-').or_else(|| title_clean.split_once('–')).or_else(|| title_clean.split_once('|')) {
        let candidate_art = first.trim().to_lowercase();
        if candidate_art == target || candidate_art.contains(&target) || (target.contains(&candidate_art) && candidate_art.len() >= 3) {
            return true;
        }
    }

    false
}

#[tauri::command]
async fn get_artist_page_details(artist_name: String) -> Result<String, String> {
    let name_trim = artist_name.trim().to_string();
    if name_trim.is_empty() {
        return Ok(String::new());
    }

    let mut canonical_name = name_trim.clone();
    let mut avatar = String::new();
    let mut banner = String::new();
    let mut tracks = Vec::new();
    let mut browse_id = String::new();

    // 1. Search for artist in YouTube Music
    if let Some(artists_raw) = search_youtube_artists_direct(&name_trim).await {
        let lines: Vec<&str> = artists_raw.trim().split('\n').filter(|l| !l.is_empty()).collect();
        let target_lower = name_trim.to_lowercase();
        let matched_line = lines.iter().find(|l| {
            let n = l.split("====").next().unwrap_or("").trim().to_lowercase();
            n == target_lower || n.contains(&target_lower) || target_lower.contains(&n)
        }).or_else(|| lines.first());

        if let Some(line) = matched_line {
            let parts: Vec<&str> = line.split("====").collect();
            if let Some(n) = parts.get(0) { if !n.trim().is_empty() { canonical_name = n.trim().to_string(); } }
            if let Some(a) = parts.get(1) { if !a.trim().is_empty() { avatar = a.trim().to_string(); } }
            if let Some(bid) = parts.get(3) { if !bid.trim().is_empty() { browse_id = bid.trim().to_string(); } }
        }
    }

    // 2. If browse_id is available, fetch exact artist browse discography
    if !browse_id.is_empty() {
        if let Some((b_header_img, b_banner, b_tracks)) = fetch_artist_browse_details(&browse_id).await {
            if !b_banner.is_empty() {
                banner = b_banner;
            } else if !b_header_img.is_empty() {
                banner = b_header_img;
            }
            // Only use browse header image as avatar if we didn't already get the artist's real circular pfp in step 1
            if avatar.is_empty() && !banner.is_empty() {
                avatar = banner.clone();
            }
            if !b_tracks.is_empty() {
                for t in b_tracks {
                    let parts: Vec<&str> = t.split("====").collect();
                    if parts.len() >= 4 {
                        let title = parts[0].trim();
                        let mut uploader = parts[1].trim().to_string();
                        let duration = parts[2].trim();
                        let vid = parts[3].trim();
                        if !vid.is_empty() && vid != "NA" {
                            if uploader.is_empty() {
                                uploader = canonical_name.clone();
                            }
                            tracks.push(format!("{}===={}===={}===={}", title, uploader, duration, vid));
                        }
                    }
                }
            }
        }
    }

    // 3. Supplement or populate with direct YouTube Music song search for the artist
    if tracks.len() < 25 {
        if let Some(songs_raw) = search_youtube_direct(&canonical_name).await {
            let mut seen_ids: std::collections::HashSet<String> = tracks.iter()
                .filter_map(|t| t.split("====").nth(3).map(|s| s.trim().to_string()))
                .collect();

            for line in songs_raw.trim().split('\n') {
                let parts: Vec<&str> = line.split("====").collect();
                if parts.len() >= 4 {
                    let title = parts[0].trim();
                    let uploader = parts[1].trim();
                    let vid = parts[3].trim();
                    if !seen_ids.contains(vid) && !vid.is_empty() && vid != "NA" {
                        if track_matches_artist(title, uploader, &canonical_name) || tracks.is_empty() {
                            seen_ids.insert(vid.to_string());
                            tracks.push(line.to_string());
                        }
                    }
                }
            }
        }
    }

    // 4. Secondary supplement if still empty
    if tracks.is_empty() {
        if let Some(songs_raw) = search_youtube_direct(&format!("{} songs", canonical_name)).await {
            let mut seen_ids = std::collections::HashSet::new();
            for line in songs_raw.trim().split('\n') {
                let parts: Vec<&str> = line.split("====").collect();
                if parts.len() >= 4 {
                    let title = parts[0].trim();
                    let uploader = parts[1].trim();
                    let vid = parts[3].trim();
                    if !seen_ids.contains(vid) && !vid.is_empty() && vid != "NA" {
                        if track_matches_artist(title, uploader, &canonical_name) || tracks.is_empty() {
                            seen_ids.insert(vid.to_string());
                            tracks.push(line.to_string());
                        }
                    }
                }
            }
        }
    }

    // 5. Final fallback to ytsearch if direct was blocked or empty
    if tracks.is_empty() {
        if let Ok(fallback_raw) = search_youtube(format!("{} official songs", canonical_name)).await {
            for line in fallback_raw.trim().split('\n') {
                let parts: Vec<&str> = line.split("====").collect();
                if parts.len() >= 4 {
                    let vid = parts[3].trim();
                    if !vid.is_empty() && vid != "NA" {
                        tracks.push(line.to_string());
                    }
                }
            }
        }
    }

    if avatar.is_empty() {
        if let Ok(yt_artists) = search_youtube_artists(canonical_name.clone()).await {
            for line in yt_artists.trim().split('\n') {
                let parts: Vec<&str> = line.split("====").collect();
                if let Some(a) = parts.get(1) {
                    if a.trim().starts_with("http") {
                        avatar = a.trim().to_string();
                        break;
                    }
                }
            }
        }
    }

    if banner.is_empty() { banner = avatar.clone(); }

    let mut result_lines = Vec::new();
    result_lines.push(format!("ARTIST_INFO===={}===={}===={}", canonical_name, avatar, banner));
    result_lines.extend(tracks);

    Ok(result_lines.join("\n"))
}

#[tauri::command]
async fn search_youtube(query: String) -> Result<String, String> {
    let q_trim = query.trim().to_string();
    let is_url = q_trim.starts_with("http://") 
        || q_trim.starts_with("https://") 
        || q_trim.contains("youtube.com") 
        || q_trim.contains("youtu.be");

    if !is_url {
        // 1. Custom Mirror search if configured
        if let Some(custom_inst) = get_custom_instance() {
            if let Some(custom_results) = search_custom_instance(&q_trim, &custom_inst).await {
                return Ok(custom_results);
            }
        }

        // 2. Fast-path: Direct YouTube Music in-memory JSON search (~150-250ms)
        if let Some(direct_results) = search_youtube_direct(&q_trim).await {
            return Ok(direct_results);
        }
    }

    let search_arg = if is_url {
        q_trim
    } else {
        format!("ytsearch25:{}", q_trim)
    };
    let mut cmd = tokio::process::Command::new(bin_ytdlp());
    cmd.args([
        &search_arg,
        "--flat-playlist",
        "--print", "%(title)s====%(uploader)s====%(duration_string)s====%(id)s",
        "--no-warnings",
        "--no-check-certificates",
        "--geo-bypass",
        "--socket-timeout", "15",
    ]);
    if let Some(proxy_str) = get_proxy_url() {
        cmd.args(["--proxy", &proxy_str]);
    }
    cmd.no_window();

    let out = match tokio::time::timeout(std::time::Duration::from_secs(35), cmd.output()).await {
        Ok(res) => res.map_err(|e| format!("yt-dlp failed: {}", e))?,
        Err(_) => return Err("Search timed out - check your connection".to_string()),
    };

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    if stdout.trim().is_empty() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(if stderr.trim().is_empty() { "No results found".to_string() } else { stderr });
    }
    Ok(stdout)
}

#[tauri::command]
async fn open_url_in_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let sanitized = url.trim().to_string();
    if !sanitized.starts_with("https://") && !sanitized.starts_with("http://") {
        return Err("Only http/https URLs are allowed".to_string());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(&sanitized, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn import_youtube_playlist(url: String) -> Result<String, String> {
    let u_trim = url.trim();
    let mut cmd = tokio::process::Command::new(bin_ytdlp());
    cmd.args([
        "--flat-playlist",
        "--yes-playlist",
        "--no-warnings",
        "--ignore-errors",
        "--geo-bypass",
        "--socket-timeout", "15",
        "--no-config",
        "--print", "%(id)s====%(title)s====%(duration_string|0:00)s====%(artist,uploader,channel,creator,uploader_id|Unknown)s====%(playlist,playlist_title|YouTube Playlist)s",
        "--",
        u_trim,
    ]);
    if let Some(proxy_str) = get_proxy_url() {
        cmd.args(["--proxy", &proxy_str]);
    }
    cmd.no_window();

    let out = match tokio::time::timeout(std::time::Duration::from_secs(45), cmd.output()).await {
        Ok(res) => res.map_err(|e| format!("yt-dlp failed: {}", e))?,
        Err(_) => return Err("Playlist import timed out - check the URL and your connection".to_string()),
    };

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    if stdout.trim().is_empty() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(if stderr.trim().is_empty() { "No tracks found. Is this a public playlist?".to_string() } else { stderr });
    }
    Ok(stdout)
}

#[tauri::command]
async fn import_csv_playlist(csv_content: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let content = csv_content.trim_start_matches('\u{feff}').trim();
        if content.is_empty() {
            return Err("CSV file is empty.".to_string());
        }

        let mut rows: Vec<Vec<String>> = Vec::new();
        let mut current_row: Vec<String> = Vec::new();
        let mut current_field = String::new();
        let mut in_quotes = false;
        let mut chars = content.chars().peekable();

        while let Some(ch) = chars.next() {
            match ch {
                '"' => {
                    if in_quotes && chars.peek() == Some(&'"') {
                        chars.next();
                        current_field.push('"');
                    } else {
                        in_quotes = !in_quotes;
                    }
                }
                ',' if !in_quotes => {
                    current_row.push(current_field.trim().to_string());
                    current_field.clear();
                }
                '\r' if !in_quotes => {
                    if chars.peek() == Some(&'\n') {
                        chars.next();
                    }
                    current_row.push(current_field.trim().to_string());
                    current_field.clear();
                    if !current_row.iter().all(|f| f.is_empty()) {
                        rows.push(std::mem::take(&mut current_row));
                    } else {
                        current_row.clear();
                    }
                }
                '\n' if !in_quotes => {
                    current_row.push(current_field.trim().to_string());
                    current_field.clear();
                    if !current_row.iter().all(|f| f.is_empty()) {
                        rows.push(std::mem::take(&mut current_row));
                    } else {
                        current_row.clear();
                    }
                }
                _ => {
                    current_field.push(ch);
                }
            }
        }

        if !current_field.is_empty() || !current_row.is_empty() {
            current_row.push(current_field.trim().to_string());
            if !current_row.iter().all(|f| f.is_empty()) {
                rows.push(current_row);
            }
        }

        if rows.is_empty() {
            return Err("No data rows found in CSV.".to_string());
        }

        let first_row = &rows[0];
        let normalized_headers: Vec<String> = first_row
            .iter()
            .map(|h| h.to_lowercase().replace(['"', '\''], "").trim().to_string())
            .collect();

        let mut title_idx: Option<usize> = None;
        let mut artist_idx: Option<usize> = None;
        let mut playlist_name: Option<String> = None;

        // 1. Exact priority checks for Track Name / Title
        for (i, h) in normalized_headers.iter().enumerate() {
            match h.as_str() {
                "track name" | "track title" | "song title" | "song name" | "master_metadata_track_name" => {
                    title_idx = Some(i);
                    break;
                }
                _ => {}
            }
        }
        if title_idx.is_none() {
            for (i, h) in normalized_headers.iter().enumerate() {
                if h == "title" || h == "track" || h == "song" {
                    title_idx = Some(i);
                    break;
                }
            }
        }
        if title_idx.is_none() {
            for (i, h) in normalized_headers.iter().enumerate() {
                if (h.contains("track") || (h.contains("title") && !h.contains("album"))) && !h.contains("artist") {
                    title_idx = Some(i);
                    break;
                }
            }
        }

        // 2. Exact priority checks for Artist Name
        for (i, h) in normalized_headers.iter().enumerate() {
            match h.as_str() {
                "artist name(s)" | "artist name" | "artist(s)" | "artists" | "artist" | "track artist" | "master_metadata_album_artist_name" => {
                    artist_idx = Some(i);
                    break;
                }
                _ => {}
            }
        }
        if artist_idx.is_none() {
            for (i, h) in normalized_headers.iter().enumerate() {
                if h.contains("artist") || h.contains("performer") || h.contains("creator") || h.contains("author") {
                    artist_idx = Some(i);
                    break;
                }
            }
        }

        // 3. Check for Playlist Name header
        for (i, h) in normalized_headers.iter().enumerate() {
            if h == "playlist name" || h == "playlist" {
                if let Some(second_row) = rows.get(1) {
                    if let Some(val) = second_row.get(i) {
                        if !val.trim().is_empty() {
                            playlist_name = Some(val.trim().to_string());
                        }
                    }
                }
                break;
            }
        }

        let is_header_detected = title_idx.is_some() || artist_idx.is_some();
        let data_start = if is_header_detected { 1 } else { 0 };

        let final_title_idx = title_idx.unwrap_or(0);
        let final_artist_idx = artist_idx.unwrap_or(if first_row.len() >= 2 { 1 } else { 0 });

        let mut output = String::new();
        if let Some(name) = playlist_name {
            output.push_str(&format!("PLAYLIST:{}\n", name));
        } else {
            output.push_str("PLAYLIST:Spotify Import\n");
        }

        let mut count = 0usize;
        for row in rows.iter().skip(data_start) {
            let title = row.get(final_title_idx).map(|s| s.trim().trim_matches('"').trim()).unwrap_or("");
            let artist = row.get(final_artist_idx).map(|s| s.trim().trim_matches('"').trim()).unwrap_or("");

            if title.is_empty() && artist.is_empty() {
                continue;
            }

            let clean_title = title.replace("==== ", " - ").replace("====", " - ");
            let clean_artist = artist.replace("==== ", " - ").replace("====", " - ");

            output.push_str(&format!("{}===={}\n", clean_title, clean_artist));
            count += 1;
        }

        if count == 0 {
            return Err("No tracks found in CSV. Make sure this is a valid playlist CSV file.".to_string());
        }

        Ok(output)
    })
    .await
    .map_err(|e| e.to_string())?
}

static CACHE_ENABLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);

#[tauri::command]
async fn set_cache_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    CACHE_ENABLED.store(enabled, std::sync::atomic::Ordering::SeqCst);
    if !enabled {
        PREFETCH_CACHE.write().unwrap().clear();
        let _ = cache::clear_app_cache(app).await;
    }
    Ok(())
}

#[tauri::command]
fn get_cache_enabled() -> bool {
    CACHE_ENABLED.load(std::sync::atomic::Ordering::SeqCst)
}

#[tauri::command]
async fn prefetch_track(url: String) -> Result<(), String> {
    if !CACHE_ENABLED.load(std::sync::atomic::Ordering::SeqCst) { return Ok(()); }
    if url.starts_with("local://") { return Ok(()); }
    if PREFETCH_CACHE.read().unwrap().contains_key(&url) { return Ok(()); }
    let cache = Arc::clone(&PREFETCH_CACHE);
    tokio::spawn(async move {
        let permit = prefetch_semaphore().acquire().await.ok();
        if !CACHE_ENABLED.load(std::sync::atomic::Ordering::SeqCst) { return; }
        if cache.read().unwrap().contains_key(&url) { return; }
        if let Some(stream_url) = extract_stream_url_async(url.clone(), None).await {
            if !CACHE_ENABLED.load(std::sync::atomic::Ordering::SeqCst) { return; }
            let mut c = cache.write().unwrap();
            let now = std::time::Instant::now();
            c.retain(|_, v| now.duration_since(v.ts) < std::time::Duration::from_secs(4 * 3600));
            if c.len() >= 200 { c.retain(|_, v| std::time::Instant::now().duration_since(v.ts) < std::time::Duration::from_secs(3600)); }
            c.insert(url, CacheEntry { url: stream_url, ts: now });
        }
        drop(permit);
    });
    Ok(())
}

fn build_af_string(loudnorm_on: bool, skip_sil: bool, (b, m, t): (f64, f64, f64)) -> Option<String> {
    let eq_active = !(b == 0.0 && m == 0.0 && t == 0.0);
    let mut parts: Vec<String> = Vec::new();

    if loudnorm_on {
        parts.push("loudnorm=I=-16:TP=-1.5:LRA=11".to_string());
    }
    if skip_sil {
        parts.push("silenceremove=1:0:-50dB".to_string());
    }
    if eq_active {
        parts.push(format!(
            "lavfi=[equalizer=f=60:width_type=o:width=2:g={b},equalizer=f=1000:width_type=o:width=2:g={m},equalizer=f=10000:width_type=o:width=2:g={t}]",
            b = b, m = m, t = t
        ));
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(","))
    }
}

fn sync_active_af_filters() {
    let loudnorm_on = *LOUDNORM_ENABLED.lock().unwrap();
    let skip_sil = *SKIP_SILENCE.lock().unwrap();
    let eq = *CURRENT_EQ.lock().unwrap();

    let af_opt = build_af_string(loudnorm_on, skip_sil, eq);
    let cmd = if let Some(af_str) = af_opt {
        serde_json::json!({"command": ["set_property", "af", af_str]}).to_string()
    } else {
        r#"{"command": ["set_property", "af", ""]}"#.to_string()
    };
    let _ = send_ipc_fire_and_forget(&cmd);
}

#[tauri::command]
fn set_loudnorm_enabled(enabled: bool) -> Result<(), String> {
    *LOUDNORM_ENABLED.lock().unwrap() = enabled;
    sync_active_af_filters();
    Ok(())
}

#[tauri::command]
fn get_loudnorm_enabled() -> bool {
    *LOUDNORM_ENABLED.lock().unwrap()
}

#[tauri::command]
fn set_skip_silence(enabled: bool) -> Result<(), String> {
    *SKIP_SILENCE.lock().unwrap() = enabled;
    sync_active_af_filters();
    Ok(())
}

fn mpv_af_flag() -> Option<String> {
    let loudnorm = *LOUDNORM_ENABLED.lock().unwrap();
    let skip_silence = *SKIP_SILENCE.lock().unwrap();
    let eq = *CURRENT_EQ.lock().unwrap();
    build_af_string(loudnorm, skip_silence, eq).map(|s| format!("--af={}", s))
}

fn ensure_mpv_running() -> bool {
    let mut guard = mpv_process().lock().unwrap_or_else(|p| p.into_inner());

    let alive = guard.as_mut().map(|c| c.try_wait().ok() == Some(None)).unwrap_or(false);
    if alive && wait_for_socket(200) { return true; }

    if let Some(mut old_child) = guard.take() {
        let _ = old_child.kill();
        let _ = old_child.wait();
    }
    #[cfg(unix)]
    { let _ = std::fs::remove_file(socket_path()); }

    let mut args: Vec<String> = vec![
        "--no-video".into(),
        "--idle=yes".into(),
        "--keep-open=yes".into(),
        "--cache=yes".into(),
        "--cache-secs=30".into(),
        "--demuxer-max-bytes=20MiB".into(),
        "--demuxer-max-back-bytes=2MiB".into(),
        "--demuxer-readahead-secs=2".into(),
        "--demuxer-lavf-analyzeduration=0.1".into(),
        "--demuxer-lavf-probesize=32768".into(),
        "--audio-buffer=0.05".into(),
        "--initial-audio-sync=no".into(),
        "--cache-pause=no".into(),
        "--cache-pause-initial=no".into(),
        "--network-timeout=10".into(),
        "--demuxer-seekable-cache=yes".into(),
        "--cache-on-disk=no".into(),
        "--audio-pitch-correction=yes".into(),
        "--force-window=no".into(),
        "--user-agent=Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36".into(),
        "--ytdl=yes".into(),
        "--ytdl-format=ba/b/bestaudio/best/18/22".into(),
        "--ytdl-raw-options=extractor-args=youtube:player_client=android,format=ba/b/bestaudio/best/18/22,no-check-certificates=,no-warnings=".into(),
        "--demuxer-lavf-o=reconnect=1,reconnect_streamed=1,reconnect_delay_max=5,reconnect_at_eof=1".into(),
        "--stream-lavf-o=reconnect=1,reconnect_streamed=1,reconnect_delay_max=5".into(),
        "--hr-seek=yes".into(),
        "--hr-seek-framedrop=yes".into(),
        "--audio-stream-silence=yes".into(),
        format!("--input-ipc-server={}", socket_path()),
    ];
    if let Some(proxy_str) = get_proxy_url() {
        args.push(format!("--http-proxy={}", proxy_str));
    }
    if let Some(af) = mpv_af_flag() { args.push(af); }

    match Command::new(bin_mpv()).args(&args).no_window().spawn() {
        Ok(child) => { *guard = Some(child); }
        Err(_) => return false,
    }
    drop(guard); 
    wait_for_socket(4000)
}

fn switch_track_ipc(url: &str) -> Result<(), String> {
    {
        let mut state = current_playback_state().lock().unwrap();
        state.position = 0.0;
        state.duration = 0.0;
        state.playing = false;
        state.eof_reached = false;
    }
    let cmd = serde_json::json!({"command": ["loadfile", url, "replace"]}).to_string();
    send_ipc_command_with_retry(&cmd, 3)
        .map_err(|e| format!("loadfile failed: {}", e))?;
    Ok(())
}

static LOG_PATH: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

fn init_log_path(app: &tauri::AppHandle) {
    if let Ok(dir) = app.path().app_log_dir().or_else(|_| app.path().app_data_dir()) {
        let _ = std::fs::create_dir_all(&dir);
        let _ = LOG_PATH.set(dir.join("veluna_debug.log"));
    }
}

fn log_debug(msg: &str) {
    if let Some(log_path) = LOG_PATH.get() {
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
        {
            use std::io::Write;
            let _ = writeln!(file, "[{}] {}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(), msg);
        }
    }
}



fn extract_video_id(url: &str) -> Option<String> {
    if url.len() == 11 && !url.contains('/') && !url.contains('?') && !url.contains('&') {
        return Some(url.to_string());
    }
    if let Some(pos) = url.find("v=") {
        let rest = &url[pos + 2..];
        let end = rest.find('&').unwrap_or(rest.len());
        let id = &rest[..end];
        if id.len() == 11 { return Some(id.to_string()); }
    }
    if let Some(pos) = url.find("youtu.be/") {
        let rest = &url[pos + 9..];
        let end = rest.find('?').or_else(|| rest.find('&')).unwrap_or(rest.len());
        let id = &rest[..end];
        if id.len() == 11 { return Some(id.to_string()); }
    }
    None
}

async fn extract_stream_url_direct_innertube(url: &str) -> Option<String> {
    let video_id = extract_video_id(url)?;
    log_debug(&format!("Attempting direct Innertube fast-path for videoId: {}", video_id));

    let client = get_http_client();
    let body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "21.26.364",
                "androidSdkVersion": 30,
                "userAgent": "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip",
                "osName": "Android",
                "osVersion": "11",
                "hl": "en",
                "timeZone": "UTC",
                "utcOffsetMinutes": 0
            }
        },
        "videoId": video_id,
        "playbackContext": {
            "contentPlaybackContext": {
                "html5Preference": "HTML5_PREF_WANTS"
            }
        },
        "contentCheckOk": true,
        "racyCheckOk": true
    });

    let res = client.post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
        .header("Content-Type", "application/json")
        .header("User-Agent", "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip")
        .header("X-YouTube-Client-Name", "3")
        .header("X-YouTube-Client-Version", "21.26.364")
        .header("Origin", "https://www.youtube.com")
        .json(&body)
        .send()
        .await
        .ok()?;

    if !res.status().is_success() {
        log_debug(&format!("Direct Innertube responded with non-200 status: {}", res.status()));
        return None;
    }

    let json: serde_json::Value = res.json().await.ok()?;
    let streaming_data = json.get("streamingData")?;

    // Check progressive formats first (format 18 has AAC audio + AVC video stream, plays immediately with 0 demux delay)
    if let Some(formats) = streaming_data.get("formats").and_then(|f| f.as_array()) {
        for f in formats {
            if let Some(url_str) = f.get("url").and_then(|u| u.as_str()) {
                if !url_str.is_empty() && url_str.starts_with("http") {
                    log_debug(&format!("Direct Innertube resolved progressive format itag {}", f.get("itag").unwrap_or(&serde_json::Value::Null)));
                    return Some(url_str.to_string());
                }
            }
        }
    }

    // Check adaptive formats
    if let Some(adaptive) = streaming_data.get("adaptiveFormats").and_then(|a| a.as_array()) {
        for f in adaptive {
            let mime = f.get("mimeType").and_then(|m| m.as_str()).unwrap_or("");
            if mime.starts_with("audio/") {
                if let Some(url_str) = f.get("url").and_then(|u| u.as_str()) {
                    if !url_str.is_empty() && url_str.starts_with("http") {
                        log_debug(&format!("Direct Innertube resolved adaptive audio format itag {}", f.get("itag").unwrap_or(&serde_json::Value::Null)));
                        return Some(url_str.to_string());
                    }
                }
            }
        }
        for f in adaptive {
            if let Some(url_str) = f.get("url").and_then(|u| u.as_str()) {
                if !url_str.is_empty() && url_str.starts_with("http") {
                    log_debug(&format!("Direct Innertube resolved adaptive format itag {}", f.get("itag").unwrap_or(&serde_json::Value::Null)));
                    return Some(url_str.to_string());
                }
            }
        }
    }

    log_debug("Direct Innertube formats required signature (falling back to yt-dlp)");
    None
}

async fn extract_stream_url_async(youtube_url: String, my_id: Option<u64>) -> Option<String> {
    log_debug(&format!("extract_stream_url_async started for URL: {}, my_id: {:?}", youtube_url, my_id));

    if let Some(id) = my_id {
        if PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst) != id {
            log_debug("extract_stream_url_async superseded before starting");
            return None;
        }
    }

    // Custom Mirror instance fast-path if configured
    if let Some(custom_inst) = get_custom_instance() {
        if let Some(v_id) = extract_video_id(&youtube_url) {
            if let Some(mirror_stream_url) = extract_stream_custom_instance(&v_id, &custom_inst).await {
                if let Some(id) = my_id {
                    if PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst) != id {
                        return None;
                    }
                }
                log_debug("extract_stream_url_async resolved via Custom Mirror instance");
                return Some(mirror_stream_url);
            }
        }
    }

    // Fast-path: Direct Innertube JSON extraction (~150ms)
    if let Some(direct_url) = extract_stream_url_direct_innertube(&youtube_url).await {
        if let Some(id) = my_id {
            if PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst) != id {
                return None;
            }
        }
        return Some(direct_url);
    }

    tokio::task::spawn_blocking(move || {
        use std::process::{Command, Stdio};
        use std::io::Read;

        let mut children: Vec<(std::process::Child, &'static str)> = Vec::new();

        // Primary Tier 1: single-request extraction with android client & player_skip
        let mut cmd = Command::new(bin_ytdlp());
        cmd.env("PYTHONHASHSEED", "0");
        cmd.env("PYTHONDONTWRITEBYTECODE", "1");
        cmd.env("PYTHONNOUSERSITE", "1");
        cmd.no_window();
        cmd.args([
            "--no-config",
            "--no-warnings", "--no-playlist", "--no-check-certificates",
            "--socket-timeout", "4", "--retries", "0",
            "--no-call-home",
            "--no-check-formats",
            "--geo-bypass",
            "-g",
            "--extractor-args", "youtube:player_client=android;player_skip=webpage,configs,translated_subs,dash,hls,js,initial_data",
            "-f", "ba/b/bestaudio/best/18/22",
            "--", &youtube_url
        ]);
        apply_proxy_to_cmd(&mut cmd);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.stdin(Stdio::null());

        log_debug("Spawning primary client (android)...");
        if let Ok(child) = cmd.spawn() {
            children.push((child, "primary"));
        }

        let start_time = std::time::Instant::now();
        let timeout = std::time::Duration::from_millis(4000);
        let mut resolved_url = None;
        let mut spawned_tier2 = false;

        while start_time.elapsed() < timeout && resolved_url.is_none() && (!children.is_empty() || !spawned_tier2) {
            // Tier 2 Fallback: if Tier 1 hasn't resolved within 750ms, spawn Android / iOS fallback
            if !spawned_tier2 && (start_time.elapsed() >= std::time::Duration::from_millis(750) || children.is_empty()) {
                log_debug("Spawning tier2 client fallback (android,ios,mweb)...");
                let mut cmd2 = Command::new(bin_ytdlp());
                cmd2.env("PYTHONHASHSEED", "0");
                cmd2.env("PYTHONDONTWRITEBYTECODE", "1");
                cmd2.env("PYTHONNOUSERSITE", "1");
                cmd2.no_window();
                cmd2.args([
                    "--no-config",
                    "--no-warnings", "--no-playlist", "--no-check-certificates",
                    "--socket-timeout", "4", "--retries", "0",
                    "--no-call-home",
                    "--no-check-formats",
                    "--geo-bypass",
                    "-g",
                    "--extractor-args", "youtube:player_client=android,ios,mweb;player_skip=webpage,configs,translated_subs,dash,hls,js,initial_data",
                    "-f", "ba/b/bestaudio/best/18/22",
                    "--", &youtube_url
                ]);
                apply_proxy_to_cmd(&mut cmd2);
                cmd2.stdout(Stdio::piped());
                cmd2.stderr(Stdio::piped());
                cmd2.stdin(Stdio::null());
                if let Ok(child2) = cmd2.spawn() {
                    children.push((child2, "tier2"));
                }
                spawned_tier2 = true;
            }

            let mut finished_indices = Vec::new();

            for (idx, (child, label)) in children.iter_mut().enumerate() {
                if let Some(id) = my_id {
                    if PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst) != id {
                        log_debug("extract_stream_url superseded during monitoring loop");
                        break;
                    }
                }

                match child.try_wait() {
                    Ok(Some(status)) => {
                        finished_indices.push(idx);
                        log_debug(&format!("Worker {} finished with status: {}", label, status));

                        if status.success() {
                            if let Some(mut stdout) = child.stdout.take() {
                                let mut stdout_str = String::new();
                                if stdout.read_to_string(&mut stdout_str).is_ok() {
                                    if let Some(url) = stdout_str.lines()
                                        .find(|l| l.starts_with("http") && !l.contains(".m3u8") && !l.contains("manifest.googlevideo.com"))
                                        .map(|s| s.trim().to_string())
                                    {
                                        log_debug(&format!("Worker {} found stream URL: {}", label, truncate_str(&url, 60)));
                                        resolved_url = Some(url);
                                        break;
                                    }
                                }
                            }
                        } else if let Some(mut stderr) = child.stderr.take() {
                            let mut stderr_str = String::new();
                            let _ = stderr.read_to_string(&mut stderr_str);
                            log_debug(&format!("Worker {} failed: {}", label, stderr_str.trim()));
                        }
                    }
                    Ok(None) => {}
                    Err(e) => {
                        finished_indices.push(idx);
                        log_debug(&format!("Error checking worker {}: {}", label, e));
                    }
                }
            }

            if resolved_url.is_some() {
                break;
            }

            if let Some(id) = my_id {
                if PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst) != id {
                    break;
                }
            }

            if !finished_indices.is_empty() {
                finished_indices.sort_by(|a, b| b.cmp(a));
                for idx in finished_indices {
                    if idx < children.len() {
                        children.remove(idx);
                    }
                }
            }

            if resolved_url.is_none() && !children.is_empty() {
                std::thread::sleep(std::time::Duration::from_millis(40));
            }
        }

        for (mut child, label) in children {
            log_debug(&format!("Terminating worker process {}", label));
            let _ = child.kill();
            let _ = child.wait();
        }

        resolved_url
    })
    .await
    .unwrap_or(None)
}

#[tauri::command]
async fn play_audio(url: String) -> Result<(), String> {
    log_debug(&format!("play_audio called with URL: {}", url));
    if url.starts_with("local://") {
        return play_local_file(url.trim_start_matches("local://").to_string()).await;
    }
    if url.starts_with("file://") {
        return play_local_file(url.trim_start_matches("file://").to_string()).await;
    }
    let u_clean = expand_tilde(&url);
    if std::path::Path::new(&u_clean).is_file() {
        return play_local_file(u_clean).await;
    }
    let safe_url = sanitize_stream_url(&url)?;

    let my_id = PLAY_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    log_debug(&format!("Assigned my_id: {} for {}", my_id, safe_url));

    let is_cache_on = CACHE_ENABLED.load(std::sync::atomic::Ordering::SeqCst);
    let cached = if is_cache_on {
        let cache = PREFETCH_CACHE.read().unwrap();
        cache.get(&safe_url).and_then(|entry| {
            let age = std::time::Instant::now().duration_since(entry.ts);
            
            if age < std::time::Duration::from_secs(15 * 60)
                && entry.url.starts_with("http")
                && !entry.url.contains(".m3u8")
                && !entry.url.contains("manifest.googlevideo.com")
            { Some(entry.url.clone()) } else { None }
        })
    } else {
        None
    };

    if cached.is_some() {
        log_debug("Found URL in prefetch cache!");
    }

    if PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst) != my_id {
        log_debug(&format!("Superseded during cache check. current PLAY_COUNTER: {}", PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst)));
        return Err("Superseded by newer play request".to_string());
    }

    let stream_url = if let Some(c) = cached {
        c
    } else if let Some(extracted) = extract_stream_url_async(safe_url.clone(), Some(my_id)).await {
        if PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst) != my_id {
            log_debug(&format!("Superseded after extraction. current PLAY_COUNTER: {}", PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst)));
            return Err("Superseded by newer play request".to_string());
        }

        if is_cache_on {
            let mut cache = PREFETCH_CACHE.write().unwrap();
            let now = std::time::Instant::now();
            cache.insert(safe_url.clone(), CacheEntry { url: extracted.clone(), ts: now });
        }

        extracted
    } else {
        log_debug(&format!("Track extraction failed - video is unavailable or deleted on YouTube: {}", safe_url));
        return Err("Track is unavailable or cannot be streamed on YouTube".to_string());
    };

    log_debug(&format!("Streaming URL to MPV: {}", truncate_str(&stream_url, 80)));

    tokio::task::spawn_blocking(move || {
        if PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst) != my_id {
            log_debug("Superseded in spawn_blocking task startup");
            return Err("Superseded by newer play request".to_string());
        }
        log_debug("Ensuring mpv is running...");
        if !ensure_mpv_running() {
            log_debug("mpv failed to start!");
            return Err("mpv failed to start or is not installed".to_string());
        }

        log_debug("Sending switch track command to mpv...");
        
        if let Err(e) = switch_track_ipc(&stream_url) {
            log_debug(&format!("switch_track_ipc failed: {}", e));
            return Err(format!("IPC switch failed: {}", e));
        }
        
        log_debug("Resuming playback...");
        
        let _ = send_ipc_command_with_retry(r#"{"command": ["set_property", "pause", false]}"#, 3);
        log_debug("Play request successfully handled!");
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn play_local_file(path: String) -> Result<(), String> {
    let safe_path = sanitize_file_path(&path)?.to_string_lossy().to_string();
    let my_id = PLAY_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;

    tokio::task::spawn_blocking(move || {
        if PLAY_COUNTER.load(std::sync::atomic::Ordering::SeqCst) != my_id {
            return Err("Superseded".to_string());
        }
        if !ensure_mpv_running() {
            return Err("mpv failed to start".to_string());
        }
        switch_track_ipc(&safe_path).map_err(|e| format!("IPC switch failed: {}", e))?;
        
        std::thread::sleep(std::time::Duration::from_millis(80));
        let _ = send_ipc_command_with_retry(r#"{"command": ["set_property", "pause", false]}"#, 3);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn pause_audio() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        send_ipc_fire_and_forget(r#"{"command": ["set_property", "pause", true]}"#)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn resume_audio() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        send_ipc_fire_and_forget(r#"{"command": ["set_property", "pause", false]}"#)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn seek_audio(time: f64) -> Result<(), String> {
    if !time.is_finite() { return Err("Invalid seek time".to_string()); }
    let t = safe_f64(time);
    tokio::task::spawn_blocking(move || {
        let cmd = format!(r#"{{"command": ["seek", {}, "absolute"]}}"#, t);
        send_ipc_fire_and_forget(&cmd)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn seek_relative(seconds: f64) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let cmd = format!(r#"{{"command": ["seek", {}, "relative"]}}"#, seconds);
        send_ipc_fire_and_forget(&cmd)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_volume(volume: f64) -> Result<(), String> {
    let vol = safe_f64(volume).clamp(0.0, 150.0);
    {
        let mut m = mpris_meta().lock().unwrap();
        m.volume = vol / 100.0;
    }
    mpris_notify();
    tokio::task::spawn_blocking(move || {
        let cmd = format!(r#"{{"command": ["set_property", "volume", {}]}}"#, vol);
        send_ipc_fire_and_forget(&cmd)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_progress() -> Result<f64, String> {
    tokio::task::spawn_blocking(|| {
        let r = send_ipc_command_with_retry(r#"{"command": ["get_property", "time-pos"]}"#, 2)?;
        parse_f64_from_response(&r)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_duration() -> Result<f64, String> {
    tokio::task::spawn_blocking(|| {
        let r = send_ipc_command_with_retry(r#"{"command": ["get_property", "duration"]}"#, 2)?;
        parse_f64_from_response(&r)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn is_paused() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| {
        let r = send_ipc_command_with_retry(r#"{"command": ["get_property", "pause"]}"#, 2)?;
        let j: Value = serde_json::from_str(&r).map_err(|e| e.to_string())?;
        Ok(j["data"].as_bool().unwrap_or(false))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Default)]
pub(crate) struct PlaybackState {
    pub(crate) playing: bool,
    pub(crate) paused: bool,
    pub(crate) position: f64,
    pub(crate) duration: f64,
    pub(crate) eof_reached: bool,
}

static CURRENT_PLAYBACK_STATE: std::sync::OnceLock<Arc<Mutex<PlaybackState>>> = std::sync::OnceLock::new();

pub(crate) fn current_playback_state() -> &'static Arc<Mutex<PlaybackState>> {
    CURRENT_PLAYBACK_STATE.get_or_init(|| Arc::new(Mutex::new(PlaybackState {
        playing: false,
        paused: true,
        position: 0.0,
        duration: 0.0,
        eof_reached: false,
    })))
}

#[tauri::command]
async fn get_playback_state() -> Result<PlaybackState, String> {
    Ok(current_playback_state().lock().unwrap().clone())
}

#[tauri::command]
async fn seek_to_start() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        send_ipc_command_with_retry(r#"{"command": ["seek", 0, "absolute"]}"#, 3).map(|_| ())?;
        std::thread::sleep(std::time::Duration::from_millis(80));
        send_ipc_command_with_retry(r#"{"command": ["set_property", "pause", false]}"#, 3).map(|_| ())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_playback_speed(speed: f64) -> Result<(), String> {
    let s = speed.clamp(0.5, 2.0);
    {
        let mut m = mpris_meta().lock().unwrap();
        m.rate = s;
    }
    mpris_notify();
    tokio::task::spawn_blocking(move || {
        let cmd = format!(r#"{{"command": ["set_property", "speed", {}]}}"#, s);
        send_ipc_fire_and_forget(&cmd)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_playback_speed() -> Result<f64, String> {
    tokio::task::spawn_blocking(|| {
        let r = send_ipc_command_with_retry(r#"{"command": ["get_property", "speed"]}"#, 2)?;
        parse_f64_from_response(&r)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AudioInfo {
    codec: String,
    bitrate: f64,
    samplerate: f64,
    channels: String,
    format: String,
    url: String,
}

#[tauri::command]
async fn get_audio_info() -> Result<AudioInfo, String> {
    
    tokio::task::spawn_blocking(|| {
        let queries: &[&str] = &[
            r#"{"command": ["get_property", "audio-codec-name"]}"#,
            r#"{"command": ["get_property", "audio-bitrate"]}"#,
            r#"{"command": ["get_property", "audio-samplerate"]}"#,
            r#"{"command": ["get_property", "audio-channels"]}"#,
            r#"{"command": ["get_property", "file-format"]}"#,
            r#"{"command": ["get_property", "path"]}"#,
        ];
        
        let responses = send_ipc_batch(queries);

        let raw = |i: usize| -> String {
            responses.get(i).and_then(|r| r.as_ref().ok()).cloned().unwrap_or_default()
        };
        let get_str = |i: usize| -> Option<String> {
            serde_json::from_str::<Value>(&raw(i)).ok()
                .and_then(|j| j["data"].as_str().map(|s| s.to_string()))
        };
        let get_f64_r = |i: usize| -> f64 {
            serde_json::from_str::<Value>(&raw(i)).ok()
                .and_then(|j| j["data"].as_f64())
                .unwrap_or(0.0)
        };

        let codec      = get_str(0).unwrap_or_else(|| "unknown".into());
        let bitrate    = get_f64_r(1);
        let samplerate = get_f64_r(2);
        let channels   = serde_json::from_str::<Value>(&raw(3)).ok()
            .and_then(|j| {
                if let Some(s) = j["data"].as_str() { return Some(s.to_string()); }
                j["data"].as_i64().map(|n| n.to_string())
            })
            .unwrap_or_else(|| "stereo".into());
        let format = get_str(4)
            .map(|s| s.split(',').next().unwrap_or(&s).trim().to_uppercase())
            .unwrap_or_default();
        let url = get_str(5).unwrap_or_default();

        Ok(AudioInfo { codec, bitrate, samplerate, channels, format, url })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_equalizer(bass: f64, mid: f64, treble: f64) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let b = bass.clamp(-12.0, 12.0);
        let m = mid.clamp(-12.0, 12.0);
        let t = treble.clamp(-12.0, 12.0);
        *CURRENT_EQ.lock().unwrap() = (b, m, t);
        sync_active_af_filters();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

struct ActiveDownload {
    child_id: u32,
    target_file: Arc<Mutex<Option<std::path::PathBuf>>>,
    cancelled: Arc<std::sync::atomic::AtomicBool>,
}

static ACTIVE_DOWNLOADS: std::sync::OnceLock<Arc<Mutex<HashMap<String, ActiveDownload>>>> = std::sync::OnceLock::new();
fn active_downloads() -> &'static Arc<Mutex<HashMap<String, ActiveDownload>>> {
    ACTIVE_DOWNLOADS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct DownloadProgressPayload {
    url: String,
    percent: f64,
    status: String,
    error: Option<String>,
}

#[tauri::command]
async fn download_song(
    app_handle: tauri::AppHandle,
    url: String,
    quality: String,
    format: Option<String>,
    embed_thumbnail: Option<bool>,
    path: String,
) -> Result<String, String> {
    use std::process::{Command, Stdio};
    use std::io::{BufRead, BufReader};

    let resolved_path = expand_tilde(&path);
    let fmt = format.as_deref().unwrap_or("mp3");
    let do_embed = embed_thumbnail.unwrap_or(true);
    let audio_format = match fmt {
        "opus" => "opus",
        "m4a"  => "m4a",
        "flac" => "flac",
        _      => "mp3",
    };
    let audio_quality = match quality.as_str() {
        "Low"    => "9",
        "Medium" => "4",
        _        => "0",
    };
    let sep = std::path::MAIN_SEPARATOR;
    let output_template = if resolved_path.ends_with('/') || resolved_path.ends_with('\\') {
        format!("{}%(title)s.%(ext)s", resolved_path)
    } else {
        format!("{}{}%(title)s.%(ext)s", resolved_path, sep)
    };

    let mut args = vec![
        "--newline".to_string(),
        "--extract-audio".to_string(),
        "--audio-format".to_string(), audio_format.to_string(),
        "--audio-quality".to_string(), audio_quality.to_string(),
        "--add-metadata".to_string(),
        "--no-check-certificates".to_string(),
        "--no-warnings".to_string(),
        "-o".to_string(), output_template.clone(),
    ];
    if do_embed {
        args.push("--embed-thumbnail".to_string());
    }
    if let Some(proxy_str) = get_proxy_url() {
        args.push("--proxy".to_string());
        args.push(proxy_str);
    }
    args.push(url.clone());

    let url_key = url.clone();
    let url_for_events = url.clone();

    tokio::task::spawn_blocking(move || {
        let mut child = Command::new(bin_ytdlp())
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .no_window()
            .spawn()
            .map_err(|e| format!("yt-dlp not found: {}", e))?;

        let child_id = child.id();
        let target_file_arc = Arc::new(Mutex::new(None));
        let target_file_clone = Arc::clone(&target_file_arc);
        let cancelled_arc = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let cancelled_clone = Arc::clone(&cancelled_arc);
        {
            let mut map = active_downloads().lock().unwrap_or_else(|p| p.into_inner());
            map.insert(url_key.clone(), ActiveDownload {
                child_id,
                target_file: target_file_arc,
                cancelled: cancelled_arc,
            });
        }

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let stderr_buf = Arc::new(Mutex::new(String::new()));
        let stderr_buf_clone = Arc::clone(&stderr_buf);
        if let Some(err_stream) = stderr {
            std::thread::spawn(move || {
                let reader = BufReader::new(err_stream);
                for line in reader.lines().flatten() {
                    let mut b = stderr_buf_clone.lock().unwrap_or_else(|p| p.into_inner());
                    if b.len() < 2048 {
                        if !b.is_empty() { b.push('\n'); }
                        b.push_str(&line);
                    }
                }
            });
        }

        let mut last_percent = 0.0;

        if let Some(out) = stdout {
            let reader = BufReader::new(out);
            for line in reader.lines().flatten() {
                if line.contains("[download] Destination:") {
                    if let Some(dest) = line.split("[download] Destination:").nth(1) {
                        let path = std::path::PathBuf::from(dest.trim());
                        if let Ok(mut tf) = target_file_clone.lock() {
                            *tf = Some(path);
                        }
                    }
                }
                if line.contains("[download]") && line.contains('%') {
                    if let Some(pct_idx) = line.find('%') {
                        let prefix = &line[..pct_idx];
                        if let Some(space_idx) = prefix.rfind(|c: char| c.is_whitespace()) {
                            let pct_str = prefix[space_idx..].trim();
                            if let Ok(pct) = pct_str.parse::<f64>() {
                                if (pct - last_percent).abs() >= 1.0 || pct >= 100.0 {
                                    last_percent = pct;
                                    let _ = app_handle.emit("download_progress", &DownloadProgressPayload {
                                        url: url_for_events.clone(),
                                        percent: pct.clamp(0.0, 100.0),
                                        status: "downloading".to_string(),
                                        error: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        let status = child.wait().map_err(|e| e.to_string())?;

        {
            let mut map = active_downloads().lock().unwrap_or_else(|p| p.into_inner());
            map.remove(&url_key);
        }

        if cancelled_clone.load(std::sync::atomic::Ordering::SeqCst) {
            return Ok("Download cancelled".to_string());
        }

        if status.success() {
            let _ = app_handle.emit("download_progress", &DownloadProgressPayload {
                url: url_for_events.clone(),
                percent: 100.0,
                status: "finished".to_string(),
                error: None,
            });
            Ok("Downloaded successfully".to_string())
        } else {
            let err_detail = {
                let b = stderr_buf.lock().unwrap_or_else(|p| p.into_inner());
                if b.trim().is_empty() { "Download failed".to_string() } else { b.trim().to_string() }
            };
            let _ = app_handle.emit("download_progress", &DownloadProgressPayload {
                url: url_for_events.clone(),
                percent: 0.0,
                status: "error".to_string(),
                error: Some(err_detail.clone()),
            });
            Err(err_detail)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cancel_download(app_handle: tauri::AppHandle, url: String) -> Result<(), String> {
    let dl_opt = {
        let mut map = active_downloads().lock().unwrap_or_else(|p| p.into_inner());
        map.remove(&url)
    };

    if let Some(dl) = dl_opt {
        dl.cancelled.store(true, std::sync::atomic::Ordering::SeqCst);
        #[cfg(unix)]
        {
            let _ = std::process::Command::new("kill")
                .args(["-9", &dl.child_id.to_string()])
                .output();
        }
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/PID", &dl.child_id.to_string()])
                .output();
        }

        // Clean up partial files for THIS specific download only
        let target_path_opt = dl.target_file.lock().ok().and_then(|guard| guard.clone());
        if let Some(target_path) = target_path_opt {
            let _ = std::fs::remove_file(&target_path);
            let part_path = std::path::PathBuf::from(format!("{}.part", target_path.display()));
            let _ = std::fs::remove_file(part_path);
            let ytdl_path = std::path::PathBuf::from(format!("{}.ytdl", target_path.display()));
            let _ = std::fs::remove_file(ytdl_path);
        }

        let _ = app_handle.emit("download_progress", &DownloadProgressPayload {
            url: url.clone(),
            percent: 0.0,
            status: "cancelled".to_string(),
            error: None,
        });

        Ok(())
    } else {
        Ok(())
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct BatchProgress {
    index: usize,
    total: usize,
    title: String,
    success: bool,
    error: Option<String>,
}

#[tauri::command]
async fn batch_download(
    app_handle: tauri::AppHandle,
    urls: Vec<String>,
    quality: String,
    path: String,
) -> Result<(), String> {
    let total = urls.len();
    let resolved_path = Arc::new(expand_tilde(&path));
    let quality_arc = Arc::new(quality);
    let semaphore = Arc::new(tokio::sync::Semaphore::new(3));
    let mut set = tokio::task::JoinSet::new();

    for (i, url) in urls.into_iter().enumerate() {
        let sem = Arc::clone(&semaphore);
        let path_clone = Arc::clone(&resolved_path);
        let quality_clone = Arc::clone(&quality_arc);
        let app = app_handle.clone();

        set.spawn(async move {
            let _permit = sem.acquire().await.ok();
            let url_clone = url.clone();
            let p = path_clone.clone();
            let q = quality_clone.clone();

            let result: Result<String, String> = tokio::task::spawn_blocking(move || {
                let format = match q.as_str() {
                    "Low"    => "worstaudio/worst",
                    "Medium" => "bestaudio[abr<=160]/bestaudio/best",
                    _        => "bestaudio/best",
                };
                let audio_quality = match q.as_str() {
                    "Low"    => "9",
                    "Medium" => "4",
                    _        => "0",
                };
                let sep = std::path::MAIN_SEPARATOR;
                let tpl = if p.ends_with('/') || p.ends_with('\\') {
                    format!("{}%(title)s.%(ext)s", p)
                } else {
                    format!("{}{}%(title)s.%(ext)s", p, sep)
                };
                let _ = std::fs::create_dir_all(std::path::Path::new(p.as_ref()));
                let mut cmd = Command::new(bin_ytdlp());
                cmd.args(["-f", format, "--extract-audio", "--audio-format", "mp3",
                           "--audio-quality", audio_quality, "--embed-thumbnail", "--add-metadata",
                           "--no-check-certificates", "--no-warnings", "-o", &tpl, &url_clone]);
                apply_proxy_to_cmd(&mut cmd);
                let out = cmd
                    .no_window()
                    .output()
                    .map_err(|e| format!("yt-dlp not found: {}", e))?;
                if out.status.success() {
                    Ok(String::from_utf8_lossy(&out.stdout).to_string())
                } else {
                    Err(String::from_utf8_lossy(&out.stderr).to_string())
                }
            })
            .await
            .unwrap_or_else(|e| Err(e.to_string()));

            let (success, error) = match &result {
                Ok(_)  => (true, None),
                Err(e) => (false, Some(e.clone())),
            };
            let _ = app.emit("batch_download_progress", &BatchProgress {
                index: i, total, title: url, success, error,
            });
        });
    }

    while let Some(_) = set.join_next().await {}
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct LocalTrack {
    pub title: String,
    pub path: String,
    pub size_bytes: u64,
    pub extension: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<String>,
    pub duration_secs: Option<f64>,
    pub bitrate: Option<u32>,
    pub has_cover: Option<bool>,
}

fn collect_local_tracks(dir: &std::path::Path, tracks: &mut Vec<LocalTrack>, extensions: &[&str]) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    if extensions.contains(&ext.to_lowercase().as_str()) {
                        if let Some(meta) = metadata::probe_track_metadata(&p) {
                            let _ = db::index_local_track_fts(&meta.title, &meta.artist, &meta.album, &meta.path);
                            tracks.push(LocalTrack {
                                title: meta.title,
                                path: meta.path,
                                size_bytes: meta.size_bytes,
                                extension: meta.extension,
                                artist: if meta.artist.is_empty() { None } else { Some(meta.artist) },
                                album: if meta.album.is_empty() { None } else { Some(meta.album) },
                                duration: Some(meta.duration_str),
                                duration_secs: Some(meta.duration_secs),
                                bitrate: meta.bitrate,
                                has_cover: Some(meta.has_cover),
                            });
                        } else {
                            tracks.push(LocalTrack {
                                title: p.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string(),
                                path: p.to_string_lossy().to_string(),
                                size_bytes: entry.metadata().map(|m| m.len()).unwrap_or(0),
                                extension: ext.to_lowercase(),
                                artist: None,
                                album: None,
                                duration: None,
                                duration_secs: None,
                                bitrate: None,
                                has_cover: None,
                            });
                        }
                    }
                }
            } else if p.is_dir() {
                collect_local_tracks(&p, tracks, extensions);
            }
        }
    }
}

#[tauri::command]
async fn scan_downloads(path: String) -> Result<Vec<LocalTrack>, String> {
    tokio::task::spawn_blocking(move || {
        let resolved   = expand_tilde(&path);
        let extensions = ["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "wma"];
        let mut tracks: Vec<LocalTrack> = Vec::new();
        let target_path = std::path::Path::new(&resolved);
        if !target_path.exists() {
            return Err("Directory does not exist".to_string());
        }
        collect_local_tracks(target_path, &mut tracks, &extensions);
        tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
        Ok(tracks)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_local_file(path: String) -> Result<(), String> {
    let safe_path = sanitize_file_path(&path)?;
    tokio::task::spawn_blocking(move || {
        if !safe_path.is_file() {
            return Err("Target is not a regular file".to_string());
        }
        std::fs::remove_file(&safe_path).map_err(|e| format!("Delete failed: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn rename_local_file(old_path: String, new_title: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let safe_old = sanitize_file_path(&old_path)?;
        let parent   = safe_old.parent().ok_or("No parent directory")?;
        let ext      = safe_old.extension().and_then(|e| e.to_str()).unwrap_or("mp3");
        let safe_title: String = new_title.chars()
            .map(|c| if "/\\:*?\"<>|".contains(c) { '_' } else { c })
            .collect();
        let mut new_path = parent.join(format!("{}.{}", safe_title, ext));
        let mut counter = 1;
        while new_path.exists() {
            if let (Ok(new_canon), Ok(old_canon)) = (new_path.canonicalize(), safe_old.canonicalize()) {
                if new_canon == old_canon {
                    break;
                }
            }
            new_path = parent.join(format!("{} ({}).{}", safe_title, counter, ext));
            counter += 1;
        }
        std::fs::rename(&safe_old, &new_path).map_err(|e| format!("Rename failed: {}", e))?;
        let new_path_str = new_path.to_string_lossy().to_string();
        let old_path_str = safe_old.to_string_lossy().to_string();
        let _ = db::update_local_track_path(&old_path_str, &new_path_str);
        let _ = db::update_local_track_path(&old_path, &new_path_str);
        Ok(new_path_str)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_in_file_manager(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let clean_path = expand_tilde(path.trim_start_matches("local://").trim());
        let p = std::path::Path::new(&clean_path);

        #[cfg(target_os = "windows")]
        {
            let win_path = clean_path.replace('/', "\\");
            if p.is_file() {
                Command::new("explorer.exe")
                    .arg(format!("/select,{}", win_path))
                    .no_window()
                    .spawn()
                    .map_err(|e| format!("explorer failed: {}", e))?;
            } else {
                let win_dir_path = std::path::Path::new(&win_path);
                if !win_dir_path.exists() {
                    let _ = std::fs::create_dir_all(win_dir_path);
                }
                Command::new("explorer.exe")
                    .arg(&win_path)
                    .no_window()
                    .spawn()
                    .map_err(|e| format!("explorer failed: {}", e))?;
            }
        }

        #[cfg(target_os = "macos")]
        {
            if p.is_file() {
                Command::new("open")
                    .args(["-R", &clean_path])
                    .no_window()
                    .spawn()
                    .map_err(|e| format!("open failed: {}", e))?;
            } else {
                if !p.exists() {
                    let _ = std::fs::create_dir_all(p);
                }
                Command::new("open")
                    .arg(&clean_path)
                    .no_window()
                    .spawn()
                    .map_err(|e| format!("open failed: {}", e))?;
            }
        }

        #[cfg(target_os = "linux")]
        {
            let dir = if p.is_file() {
                p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_else(|| clean_path.clone())
            } else {
                clean_path.clone()
            };
            let dir_path = std::path::Path::new(&dir);
            if !dir_path.exists() {
                let _ = std::fs::create_dir_all(dir_path);
            }
            Command::new("xdg-open")
                .arg(&dir)
                .no_window()
                .spawn()
                .map_err(|e| format!("xdg-open failed: {}", e))?;
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AudioMetadata { title: String, artist: String, album: String, duration: String, has_cover: bool }

#[tauri::command]
async fn get_audio_metadata(path: String) -> Result<AudioMetadata, String> {
    tokio::task::spawn_blocking(move || {
        let p = sanitize_file_path(&path).unwrap_or_else(|_| std::path::PathBuf::from(expand_tilde(&path)));
        if let Some(meta) = metadata::probe_track_metadata(&p) {
            return Ok(AudioMetadata {
                title: meta.title,
                artist: meta.artist,
                album: meta.album,
                duration: meta.duration_str,
                has_cover: meta.has_cover,
            });
        }
        let p_str = p.to_string_lossy();
        let output = Command::new(bin_ffprobe())
            .args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", p_str.as_ref()])
            .no_window()
            .output()
            .map_err(|_| "ffprobe not found - install ffmpeg".to_string())?;
        let json: Value = serde_json::from_str(
            &String::from_utf8_lossy(&output.stdout)
        ).unwrap_or(Value::Null);
        let tags = &json["format"]["tags"];
        let duration_secs = json["format"]["duration"]
            .as_str().and_then(|d| d.parse::<f64>().ok()).unwrap_or(0.0);
        let mins = (duration_secs as u64) / 60;
        let secs = (duration_secs as u64) % 60;
        let has_cover = json["streams"].as_array()
            .map(|streams| {
                streams.iter().any(|s| {
                    s["disposition"]["attached_pic"].as_i64() == Some(1)
                        || s["disposition"]["attached_pic"].as_str() == Some("1")
                })
            })
            .unwrap_or(false);
        Ok(AudioMetadata {
            title:    tags["title"].as_str().or_else(|| tags["TITLE"].as_str()).unwrap_or("").to_string(),
            artist:   tags["artist"].as_str().or_else(|| tags["ARTIST"].as_str())
                          .or_else(|| tags["album_artist"].as_str()).unwrap_or("").to_string(),
            album:    tags["album"].as_str().or_else(|| tags["ALBUM"].as_str()).unwrap_or("").to_string(),
            duration: format!("{}:{:02}", mins, secs),
            has_cover,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_audio_cover(path: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let resolved = expand_tilde(&path);
        let p = std::path::PathBuf::from(&resolved);
        if let Some(uri) = metadata::extract_cover_art_data_uri(&p) {
            return Ok(Some(uri));
        }

        // Fallback 1: Extract attached picture stream via ffmpeg on resolved path
        let output = Command::new(bin_ffmpeg())
            .args(["-i", &resolved, "-map", "0:v:0", "-frames:v", "1", "-f", "image2pipe", "-"])
            .no_window()
            .output();

        if let Ok(out) = output {
            if out.status.success() && !out.stdout.is_empty() {
                let bytes = out.stdout;
                let mime = if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
                    "image/jpeg"
                } else if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
                    "image/png"
                } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
                    "image/webp"
                } else if bytes.starts_with(b"GIF8") {
                    "image/gif"
                } else if bytes.starts_with(b"BM") {
                    "image/bmp"
                } else {
                    "image/jpeg"
                };

                let b64 = base64_encode(&bytes);
                return Ok(Some(format!("data:{};base64,{}", mime, b64)));
            }
        }

        // Fallback 2: Check for any cover / folder image in directory
        if let Some(cover_path) = metadata::find_directory_cover(&p) {
            if let Ok(bytes) = std::fs::read(&cover_path) {
                if !bytes.is_empty() {
                    let ext = cover_path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                    let mime = if ext == "png" {
                        "image/png"
                    } else if ext == "webp" {
                        "image/webp"
                    } else {
                        "image/jpeg"
                    };
                    let b64 = base64_encode(&bytes);
                    return Ok(Some(format!("data:{};base64,{}", mime, b64)));
                }
            }
        }

        Ok(None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn write_audio_metadata(path: String, title: String, artist: String, album: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let p = sanitize_file_path(&path)?;
        if metadata::write_track_tags(&p, Some(&title), Some(&artist), Some(&album)).is_ok() {
            let _ = db::index_local_track_fts(&title, &artist, &album, &path);
            return Ok(());
        }

        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp3");
        let temp_path = p.with_extension(format!("tmp.edit.{}", ext));
        let path_str = p.to_string_lossy().to_string();
        let temp_str = temp_path.to_string_lossy().to_string();
        
        let status = Command::new(bin_ffmpeg())
            .args([
                "-y",
                "-i", &path_str,
                "-metadata", &format!("title={}", title),
                "-metadata", &format!("artist={}", artist),
                "-metadata", &format!("album={}", album),
                "-codec", "copy",
                &temp_str
            ])
            .no_window()
            .status()
            .map_err(|e| format!("ffmpeg execution failed: {}", e))?;
            
        if !status.success() {
            let _ = std::fs::remove_file(&temp_path);
            return Err("ffmpeg failed to write metadata".to_string());
        }
        
        #[cfg(target_os = "windows")]
        let _ = std::fs::remove_file(&p);

        if let Err(e) = std::fs::rename(&temp_path, &p) {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("Failed to replace audio file: {}", e));
        }
        let _ = db::index_local_track_fts(&title, &artist, &album, &path);
            
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn base64_encode(bytes: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        match chunk.len() {
            3 => {
                let n = ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | (chunk[2] as u32);
                result.push(CHARSET[((n >> 18) & 63) as usize] as char);
                result.push(CHARSET[((n >> 12) & 63) as usize] as char);
                result.push(CHARSET[((n >> 6) & 63) as usize] as char);
                result.push(CHARSET[(n & 63) as usize] as char);
            }
            2 => {
                let n = ((chunk[0] as u32) << 8) | (chunk[1] as u32);
                result.push(CHARSET[((n >> 10) & 63) as usize] as char);
                result.push(CHARSET[((n >> 4) & 63) as usize] as char);
                result.push(CHARSET[((n << 2) & 63) as usize] as char);
                result.push('=');
            }
            1 => {
                let n = chunk[0] as u32;
                result.push(CHARSET[((n >> 2) & 63) as usize] as char);
                result.push(CHARSET[((n << 4) & 63) as usize] as char);
                result.push('=');
                result.push('=');
            }
            _ => unreachable!(),
        }
    }
    result
}

#[tauri::command]
async fn get_waveform_thumbnail(path: String) -> Result<Vec<f32>, String> {
    tokio::task::spawn_blocking(move || {
        let p = sanitize_file_path(&path).unwrap_or_else(|_| std::path::PathBuf::from(expand_tilde(&path)));
        let p_str = p.to_string_lossy();
        let output = Command::new(bin_ffmpeg())
            .args(["-i", p_str.as_ref(), "-ac", "1", "-ar", "500", "-f", "f32le", "-"])
            .no_window()
            .output()
            .map_err(|_| "ffmpeg not found".to_string())?;
        if output.stdout.is_empty() { return Err("No audio data".to_string()); }
        let samples: Vec<f32> = output.stdout.chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]).abs())
            .collect();
        let target = 200usize;
        let chunk_size = (samples.len() / target).max(1);
        let envelope: Vec<f32> = samples.chunks(chunk_size).take(target)
            .map(|chunk| {
                (chunk.iter().map(|&x| x * x).sum::<f32>() / chunk.len() as f32).sqrt()
            })
            .collect();
        Ok(envelope)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn collect_disk_usage(dir: &std::path::Path, extensions: &[&str], used_bytes: &mut u64, track_count: &mut usize) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    if extensions.contains(&ext.to_lowercase().as_str()) {
                        *used_bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
                        *track_count += 1;
                    }
                }
            } else if p.is_dir() {
                collect_disk_usage(&p, extensions, used_bytes, track_count);
            }
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct DiskInfo { used_bytes: u64, track_count: usize }

#[tauri::command]
async fn get_disk_usage(path: String) -> Result<DiskInfo, String> {
    tokio::task::spawn_blocking(move || {
        let resolved = expand_tilde(&path);
        let extensions = ["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "wma"];
        let target_path = std::path::Path::new(&resolved);
        if !target_path.exists() {
            return Err("Directory does not exist".to_string());
        }
        let mut used_bytes = 0u64;
        let mut track_count = 0usize;
        collect_disk_usage(target_path, &extensions, &mut used_bytes, &mut track_count);
        Ok(DiskInfo { used_bytes, track_count })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct TrackExport { title: String, artist: String, url: String, duration_secs: i64 }

#[tauri::command]
async fn export_playlist_m3u(tracks: Vec<TrackExport>, path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let resolved = expand_tilde(&path);
        let p = std::path::Path::new(&resolved);
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let mut content = String::from("#EXTM3U\n");
        for t in &tracks {
            content.push_str(&format!("#EXTINF:{},{} - {}\n{}\n",
                t.duration_secs, t.artist, t.title, t.url));
        }
        std::fs::write(&resolved, content).map_err(|e| format!("Write failed: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn import_playlist_m3u(path: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let resolved = expand_tilde(&path);
        let p = std::path::Path::new(&resolved);
        let parent = p.parent().unwrap_or_else(|| std::path::Path::new("."));
        let content = std::fs::read_to_string(&resolved)
            .map_err(|e| format!("Read failed: {}", e))?;
        let urls: Vec<String> = content.lines()
            .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
            .map(|l| {
                let trimmed = l.trim();
                if trimmed.starts_with("http://")
                    || trimmed.starts_with("https://")
                    || trimmed.starts_with("local://")
                    || trimmed.starts_with("file://")
                {
                    trimmed.to_string()
                } else {
                    let candidate = std::path::Path::new(trimmed);
                    if candidate.is_absolute() {
                        trimmed.to_string()
                    } else {
                        parent.join(candidate).to_string_lossy().to_string()
                    }
                }
            })
            .collect();
        Ok(urls)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn normalize_file(path: String, output_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let in_path = sanitize_file_path(&path)?;
        let out_path = sanitize_file_path(&output_path)?;

        if let Some(parent) = out_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let is_same_file = in_path == out_path;
        let actual_target = if is_same_file {
            let ext = in_path.extension().and_then(|e| e.to_str()).unwrap_or("mp3");
            out_path.with_extension(format!("tmp.norm.{}", ext))
        } else {
            out_path.clone()
        };

        let in_str = in_path.to_string_lossy().to_string();
        let target_str = actual_target.to_string_lossy().to_string();

        let out = Command::new(bin_ffmpeg())
            .args(["-i", &in_str, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                   "-ar", "44100", "-y", &target_str])
            .no_window()
            .output()
            .map_err(|_| "ffmpeg not found".to_string())?;

        if !out.status.success() {
            if is_same_file {
                let _ = std::fs::remove_file(&actual_target);
            }
            return Err(String::from_utf8_lossy(&out.stderr).to_string());
        }

        if is_same_file {
            #[cfg(target_os = "windows")]
            let _ = std::fs::remove_file(&out_path);

            if let Err(e) = std::fs::rename(&actual_target, &out_path) {
                let _ = std::fs::remove_file(&actual_target);
                return Err(format!("Failed to finalize normalized file: {}", e));
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn set_sleep_timer(seconds: u64) -> Result<(), String> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(seconds);
    let gen = { let mut g = SLEEP_TIMER_GEN.lock().unwrap(); *g += 1; *g };
    *SLEEP_TIMER.lock().unwrap() = Some((deadline, gen));
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(seconds)).await;
        let cur_gen = *SLEEP_TIMER_GEN.lock().unwrap();
        let fire = SLEEP_TIMER.lock().unwrap()
            .map(|(d, g)| g == gen && g == cur_gen && d <= std::time::Instant::now())
            .unwrap_or(false);
        if fire {
            let _ = tokio::task::spawn_blocking(|| {
                send_ipc_command_with_retry(r#"{"command": ["set_property", "pause", true]}"#, 2)
            }).await;
            *SLEEP_TIMER.lock().unwrap() = None;
        }
    });
    Ok(())
}

#[tauri::command]
async fn cancel_sleep_timer() -> Result<(), String> {
    *SLEEP_TIMER_GEN.lock().unwrap() += 1;
    *SLEEP_TIMER.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
async fn get_sleep_timer_remaining() -> Result<i64, String> {
    let remaining = SLEEP_TIMER.lock().unwrap().map(|(deadline, _)| {
        let now = std::time::Instant::now();
        if deadline > now { (deadline - now).as_secs() as i64 } else { 0 }
    }).unwrap_or(-1);
    Ok(remaining)
}

fn wait_for_socket(timeout_ms: u64) -> bool {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
    let sock = socket_path();

    #[cfg(unix)]
    {
        while std::time::Instant::now() < deadline {
            if std::path::Path::new(sock).exists() {
                if let Ok(s) = UnixStream::connect(sock) {
                    let _ = s.shutdown(std::net::Shutdown::Both);
                    return true;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
        false
    }

    #[cfg(windows)]
    {
        while std::time::Instant::now() < deadline {
            if OpenOptions::new().read(true).write(true).open(sock).is_ok() {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
        false
    }
}

fn send_ipc_batch(cmds: &[&str]) -> Vec<Result<String, String>> {
    let n = cmds.len();
    let sock = socket_path();

    #[cfg(unix)]
    {
        let stream = match UnixStream::connect(sock) {
            Ok(s) => s,
            Err(e) => return vec![Err(format!("IPC connect failed: {}", e)); n],
        };
        stream.set_read_timeout(Some(std::time::Duration::from_millis(800))).ok();
        stream.set_write_timeout(Some(std::time::Duration::from_millis(400))).ok();

        if let Ok(mut w) = stream.try_clone() {
            for cmd in cmds {
                let _ = w.write_all(cmd.as_bytes());
                let _ = w.write_all(b"\n");
            }
        } else {
            return vec![Err("UnixStream clone failed".to_string()); n];
        }

        let read_stream = match stream.try_clone() {
            Ok(s) => s,
            Err(_) => return vec![Err("UnixStream clone failed".to_string()); n],
        };
        let mut reader = BufReader::new(read_stream);
        let mut results: Vec<String> = Vec::with_capacity(n);
        let mut lines_read = 0usize;
        while results.len() < n && lines_read < n * 12 {
            let mut line = String::new();
            if reader.read_line(&mut line).is_err() || line.is_empty() { break; }
            lines_read += 1;
            let trimmed = line.trim();
            if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
                if !v["error"].is_null() { results.push(trimmed.to_string()); }
            }
        }

        let _ = stream.shutdown(std::net::Shutdown::Both);

        let mut out: Vec<Result<String, String>> = results.into_iter().map(Ok).collect();
        while out.len() < n { out.push(Err("No response from mpv".to_string())); }
        out
    }

    #[cfg(not(unix))]
    {
        let file = match OpenOptions::new().read(true).write(true).open(sock) {
            Ok(f) => f,
            Err(e) => return vec![Err(format!("IPC connect failed: {}", e)); n],
        };

        let mut reader  = BufReader::new(&file);
        let mut results = Vec::with_capacity(n);
        let deadline    = std::time::Instant::now() + std::time::Duration::from_millis(800);

        for cmd in cmds {
            {
                let mut w = &file;
                if w.write_all(cmd.as_bytes()).is_err() || w.write_all(b"\n").is_err() { break; }
            }
            let mut found = false;
            for _ in 0..12 {
                if std::time::Instant::now() > deadline { break; }
                let mut line = String::new();
                if reader.read_line(&mut line).is_err() || line.is_empty() { break; }
                let trimmed = line.trim();
                if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
                    if !v["error"].is_null() {
                        results.push(trimmed.to_string());
                        found = true;
                        break;
                    }
                }
            }
            if !found { break; }
        }

        let mut out: Vec<Result<String, String>> = results.into_iter().map(Ok).collect();
        while out.len() < n { out.push(Err("No response from mpv".to_string())); }
        out
    }
}

pub(crate) fn send_ipc_fire_and_forget(cmd: &str) -> Result<(), String> {
    let sock = socket_path();
    #[cfg(unix)]
    {
        let mut stream = UnixStream::connect(sock)
            .map_err(|e| format!("IPC connect failed: {}", e))?;
        stream.set_write_timeout(Some(std::time::Duration::from_millis(150))).ok();
        stream.write_all(cmd.as_bytes()).map_err(|e| e.to_string())?;
        stream.write_all(b"\n").map_err(|e| e.to_string())?;
        stream.flush().map_err(|e| e.to_string())?;
        let _ = stream.shutdown(std::net::Shutdown::Write);
        Ok(())
    }
    #[cfg(windows)]
    {
        let mut file = OpenOptions::new().write(true)
            .open(sock)
            .map_err(|e| format!("IPC connect failed: {}", e))?;
        file.write_all(cmd.as_bytes()).map_err(|e| e.to_string())?;
        file.write_all(b"\n").map_err(|e| e.to_string())?;
        file.flush().map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn send_ipc_command_with_retry(cmd: &str, retries: u8) -> Result<String, String> {
    let mut last_err = String::new();
    for attempt in 0..=retries {
        match send_ipc_command(cmd) {
            Ok(r) => return Ok(r),
            Err(e) => {
                last_err = e;
                if attempt < retries {
                    let delay = 50u64 * (1u64 << attempt.min(4));
                    std::thread::sleep(std::time::Duration::from_millis(delay));
                }
            }
        }
    }
    Err(last_err)
}

fn send_ipc_command(cmd: &str) -> Result<String, String> {
    fn is_cmd_response(line: &str) -> bool {
        let v: Value = serde_json::from_str(line).unwrap_or(Value::Null);
        !v.is_null() && !v["error"].is_null()
    }

    let sock = socket_path();

    #[cfg(unix)]
    {
        let stream = UnixStream::connect(sock)
            .map_err(|e| format!("IPC connect failed: {}", e))?;
        stream.set_read_timeout(Some(std::time::Duration::from_millis(500))).map_err(|e| e.to_string())?;
        stream.set_write_timeout(Some(std::time::Duration::from_millis(200))).map_err(|e| e.to_string())?;
        
        let cloned_stream = stream.try_clone().map_err(|e| e.to_string())?;
        let mut reader = BufReader::new(cloned_stream);

        {
            let mut w = &stream;
            w.write_all(cmd.as_bytes()).map_err(|e| e.to_string())?;
            w.write_all(b"\n").map_err(|e| e.to_string())?;
        }

        let mut resp = Err("No response from mpv".to_string());
        for _ in 0..24 {
            let mut line = String::new();
            if reader.read_line(&mut line).is_err() || line.is_empty() { break; }
            if is_cmd_response(line.trim()) { resp = Ok(line); break; }
        }
        let _ = stream.shutdown(std::net::Shutdown::Both);
        resp
    }

    #[cfg(windows)]
    {
        let file = OpenOptions::new().read(true).write(true)
            .open(sock)
            .map_err(|e| format!("IPC connect failed: {}", e))?;
        {
            let mut f = &file;
            f.write_all(cmd.as_bytes()).map_err(|e| e.to_string())?;
            f.write_all(b"\n").map_err(|e| e.to_string())?;
        }
        let mut reader = BufReader::new(&file);
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(600);
        for _ in 0..24 {
            if std::time::Instant::now() > deadline { break; }
            let mut line = String::new();
            if reader.read_line(&mut line).is_err() || line.is_empty() { break; }
            if is_cmd_response(line.trim()) { return Ok(line); }
        }
        Err("No response from mpv".to_string())
    }
}

fn start_mpv_event_listener(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            if !wait_for_socket(1000) {
                std::thread::sleep(std::time::Duration::from_millis(500));
                continue;
            }

            let sock = socket_path();
            #[cfg(unix)]
            let stream_res = UnixStream::connect(sock);
            #[cfg(windows)]
            let stream_res = OpenOptions::new().read(true).write(true).open(sock);

            match stream_res {
                Ok(stream) => {
                    let mut reader = BufReader::new(&stream);
                    let mut writer = &stream;

                    let obs_cmds = [
                        r#"{"command": ["observe_property", 1, "time-pos"]}"#,
                        r#"{"command": ["observe_property", 2, "pause"]}"#,
                        r#"{"command": ["observe_property", 3, "duration"]}"#,
                        r#"{"command": ["observe_property", 4, "eof-reached"]}"#,
                        r#"{"command": ["observe_property", 5, "audio-codec-name"]}"#,
                    ];
                    for cmd in obs_cmds {
                        let _ = writer.write_all(cmd.as_bytes());
                        let _ = writer.write_all(b"\n");
                    }
                    let _ = writer.flush();

                    let mut line = String::new();
                    while reader.read_line(&mut line).is_ok() && !line.is_empty() {
                        let trimmed = line.trim();
                        if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
                            if let Some(event) = v["event"].as_str() {
                                match event {
                                    "property-change" => {
                                        let name = v["name"].as_str().unwrap_or("");
                                        let mut state = current_playback_state().lock().unwrap();
                                        let mut changed = false;
                                        match name {
                                            "audio-codec-name" => {
                                                if let Some(codec) = v["data"].as_str() {
                                                    let trimmed_c = codec.trim();
                                                    if !trimmed_c.is_empty() && trimmed_c != "null" && trimmed_c != "none" {
                                                        if !state.playing && !state.paused {
                                                            state.playing = true;
                                                            let _ = app_handle.emit("mpv_track_started", ());
                                                        }
                                                        changed = true;
                                                    }
                                                }
                                            }
                                            "time-pos" => {
                                                if let Some(pos) = v["data"].as_f64() {
                                                    let p = safe_f64(pos);
                                                    state.position = p;
                                                    if p > 0.01 && !state.playing && !state.paused {
                                                        state.playing = true;
                                                        let _ = app_handle.emit("mpv_track_started", ());
                                                    }
                                                    changed = true;
                                                }
                                            }
                                            "pause" => {
                                                if let Some(paused) = v["data"].as_bool() {
                                                    state.paused = paused;
                                                    if paused {
                                                        state.playing = false;
                                                    } else if state.position > 0.05 {
                                                        state.playing = true;
                                                    }
                                                    changed = true;
                                                    mpris_notify();
                                                }
                                            }
                                            "duration" => {
                                                if let Some(dur) = v["data"].as_f64() {
                                                    let d = safe_f64(dur);
                                                    state.duration = d;
                                                    changed = true;
                                                    if d > 0.0 {
                                                        let mut meta = mpris_meta().lock().unwrap();
                                                        let dur_us = (d * 1_000_000.0) as i64;
                                                        if meta.duration_us != dur_us {
                                                            meta.duration_us = dur_us;
                                                            drop(meta);
                                                            mpris_notify();
                                                        }
                                                    }
                                                }
                                            }
                                            "eof-reached" => {
                                                if let Some(eof) = v["data"].as_bool() {
                                                    state.eof_reached = eof;
                                                    if eof {
                                                        state.playing = false;
                                                        let _ = app_handle.emit("mpv_track_end", ());
                                                    }
                                                    changed = true;
                                                }
                                            }
                                            _ => {}
                                        }
                                        if changed {
                                            let s_clone = state.clone();
                                            drop(state);
                                            let _ = app_handle.emit("mpv_playback_state", &s_clone);
                                        }
                                    }
                                    "end-file" => {
                                        let reason = v["reason"].as_str().unwrap_or("");
                                        if reason == "error" {
                                            {
                                                let mut state = current_playback_state().lock().unwrap_or_else(|p| p.into_inner());
                                                state.playing = false;
                                            }
                                            let _ = app_handle.emit("mpv_track_error", ());
                                            let s_clone = current_playback_state().lock().unwrap_or_else(|p| p.into_inner()).clone();
                                            let _ = app_handle.emit("mpv_playback_state", &s_clone);
                                        } else if reason == "eof" {
                                            {
                                                let mut state = current_playback_state().lock().unwrap();
                                                state.eof_reached = true;
                                                state.playing = false;
                                            }
                                            let _ = app_handle.emit("mpv_track_end", ());
                                            let s_clone = current_playback_state().lock().unwrap().clone();
                                            let _ = app_handle.emit("mpv_playback_state", &s_clone);
                                        }
                                    }
                                    "file-loaded" => {
                                        {
                                            let mut state = current_playback_state().lock().unwrap();
                                            if !state.paused {
                                                state.playing = true;
                                            }
                                        }
                                        let _ = app_handle.emit("mpv_track_started", ());
                                        let s_clone = current_playback_state().lock().unwrap().clone();
                                        let _ = app_handle.emit("mpv_playback_state", &s_clone);
                                    }
                                    "playback-restart" => {
                                        {
                                            let mut state = current_playback_state().lock().unwrap();
                                            state.eof_reached = false;
                                            state.position = 0.0;
                                            state.playing = false;
                                        }
                                        let s_clone = current_playback_state().lock().unwrap().clone();
                                        let _ = app_handle.emit("mpv_playback_state", &s_clone);
                                    }
                                    _ => {}
                                }
                            }
                        }
                        line.clear();
                    }
                }
                Err(_) => {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            }
        }
    });
}

fn parse_f64_from_response(response: &str) -> Result<f64, String> {
    let json: Value = serde_json::from_str(response).map_err(|e| e.to_string())?;
    if json["data"].is_null() { return Ok(0.0); }
    json["data"].as_f64().ok_or_else(|| format!("Unexpected data type: {}", response))
}

fn parse_lrc_string(lrc_text: &str, duration: f64) -> Option<String> {
    let mut lines: Vec<serde_json::Value> = Vec::new();
    for line in lrc_text.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        if let Some(rest) = line.strip_prefix('[') {
            if let Some(end) = rest.find(']') {
                let ts = &rest[..end];
                let text = rest[end+1..].trim();
                
                let secs: f64 = if let Some(colon) = ts.find(':') {
                    let min_part = &ts[..colon];
                    let sec_part = &ts[colon+1..];
                    if !min_part.is_empty() && min_part.chars().all(|c| c.is_ascii_digit()) {
                        if let (Ok(mins), Ok(s)) = (min_part.parse::<f64>(), sec_part.parse::<f64>()) {
                            mins * 60.0 + s
                        } else {
                            continue;
                        }
                    } else {
                        continue;
                    }
                } else { continue; };
                if !text.is_empty() {
                    lines.push(serde_json::json!({"time": secs, "text": text}));
                }
            }
        }
    }
    if !lines.is_empty() {
        return Some(serde_json::to_string(&lines).unwrap_or_default());
    }

    let plain_lines: Vec<&str> = lrc_text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !(l.starts_with('[') && l.ends_with(']')))
        .collect();
    if !plain_lines.is_empty() {
        let total = duration.max(1.0);
        let step = total / plain_lines.len().max(1) as f64;
        let arr: Vec<serde_json::Value> = plain_lines.iter().enumerate()
            .map(|(i, l)| serde_json::json!({"time": i as f64 * step, "text": *l}))
            .collect();
        return Some(serde_json::to_string(&arr).unwrap_or_default());
    }
    None
}

#[tauri::command]
async fn fetch_lyrics(title: String, artist: String, duration: f64, _album: Option<String>, source: Option<String>) -> Result<String, String> {
    // 0. Instant offline resolution from SQLite lyrics cache
    if let Ok(Some(cached)) = db::get_cached_lyrics(&title, &artist) {
        return Ok(cached);
    }

    let client = create_http_client(6000);
    let src = source.as_deref().unwrap_or("lrclib");

    // 1. If NetEase is selected, query NetEase Cloud Music API first
    if src == "netease" {
        let q = format!("{} {}", title.trim(), artist.trim());
        let encoded_q = urlencoding::encode(&q);
        let netease_search_url = format!("https://music.163.com/api/search/get/web?s={}&type=1&offset=0&total=true&limit=1", encoded_q);
        if let Ok(resp) = client.get(&netease_search_url).header("User-Agent", "Mozilla/5.0").send().await {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(song_id) = json.pointer("/result/songs/0/id").and_then(|id| id.as_i64()) {
                    let lyric_url = format!("https://music.163.com/api/song/lyric?id={}&lv=-1&kv=-1&tv=-1", song_id);
                    if let Ok(l_resp) = client.get(&lyric_url).header("User-Agent", "Mozilla/5.0").send().await {
                        if let Ok(l_json) = l_resp.json::<serde_json::Value>().await {
                            if let Some(lrc) = l_json.pointer("/lrc/lyric").and_then(|s| s.as_str()) {
                                if let Some(parsed) = parse_lrc_string(lrc, duration) {
                                    let _ = db::cache_lyrics(&title, &artist, &parsed);
                                    return Ok(parsed);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Query LRCLIB (Direct track query)
    let url = format!(
        "https://lrclib.net/api/get?track_name={}&artist_name={}&duration={}",
        urlencoding::encode(title.trim()),
        urlencoding::encode(artist.trim()),
        duration as u64,
    );

    if let Ok(resp) = client.get(&url).send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(synced) = json["syncedLyrics"].as_str().filter(|s| !s.is_empty()) {
                    if let Some(parsed) = parse_lrc_string(synced, duration) {
                        let _ = db::cache_lyrics(&title, &artist, &parsed);
                        return Ok(parsed);
                    }
                }
                if let Some(plain) = json["plainLyrics"].as_str().filter(|s| !s.is_empty()) {
                    if let Some(parsed) = parse_lrc_string(plain, duration) {
                        let _ = db::cache_lyrics(&title, &artist, &parsed);
                        return Ok(parsed);
                    }
                }
            }
        }
    }

    // 3. Fallback: LRCLIB search query (if exact match duration differs)
    let search_url = format!(
        "https://lrclib.net/api/search?track_name={}&artist_name={}",
        urlencoding::encode(title.trim()),
        urlencoding::encode(artist.trim()),
    );
    if let Ok(resp) = client.get(&search_url).send().await {
        if resp.status().is_success() {
            if let Ok(items) = resp.json::<Vec<serde_json::Value>>().await {
                for item in items {
                    if let Some(synced) = item["syncedLyrics"].as_str().filter(|s| !s.is_empty()) {
                        if let Some(parsed) = parse_lrc_string(synced, duration) {
                            let _ = db::cache_lyrics(&title, &artist, &parsed);
                            return Ok(parsed);
                        }
                    }
                    if let Some(plain) = item["plainLyrics"].as_str().filter(|s| !s.is_empty()) {
                        if let Some(parsed) = parse_lrc_string(plain, duration) {
                            let _ = db::cache_lyrics(&title, &artist, &parsed);
                            return Ok(parsed);
                        }
                    }
                }
            }
        }
    }

    Err("No lyrics found".to_string())
}

#[tauri::command]
async fn search_yt_music(query: String, search_type: String) -> Result<String, String> {
    let full_query = match search_type.as_str() {
        "artist" => format!("{} artist", query),
        "album"  => format!("{} full album", query),
        _        => query.clone(),
    };
    let search_arg = format!("ytsearch15:{}", full_query);
    let mut cmd = tokio::process::Command::new(bin_ytdlp());
    cmd.args([
        &search_arg,
        "--flat-playlist",
        "--print", "%(title)s====%(uploader)s====%(id)s====%(thumbnails.0.url)s====%(view_count)s",
        "--no-warnings",
        "--no-check-certificates",
        "--socket-timeout", "8",
    ]);
    if let Some(proxy_str) = get_proxy_url() {
        cmd.args(["--proxy", &proxy_str]);
    }
    cmd.no_window();

    let out = match tokio::time::timeout(std::time::Duration::from_secs(12), cmd.output()).await {
        Ok(res) => res.map_err(|e| format!("yt-dlp failed: {}", e))?,
        Err(_) => return Err("Search timed out".to_string()),
    };

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    if stdout.trim().is_empty() { return Err("No results".to_string()); }

    let items: Vec<serde_json::Value> = stdout.trim().lines().take(10).filter_map(|line| {
        let parts: Vec<&str> = line.splitn(5, "====").collect();
        if parts.len() < 3 { return None; }
        let title     = parts[0].trim();
        let uploader  = parts[1].trim();
        let id        = parts[2].trim();
        let thumb     = if parts.len() > 3 { parts[3].trim() } else {
            &format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", id)
        };
        let thumb = if thumb.starts_with("http") { thumb.to_string() }
                    else { format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", id) };
        Some(serde_json::json!({
            "title": title,
            "uploader": uploader,
            "id": id,
            "thumbnail": thumb,
            "url": format!("https://youtube.com/watch?v={}", id),
        }))
    }).collect();

    Ok(serde_json::to_string(&items).unwrap_or_default())
}

#[tauri::command]
fn ping() -> String { "pong".to_string() }

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn check_for_update() -> Result<Option<String>, String> {
    let current = env!("CARGO_PKG_VERSION");
    let client = create_http_client(8000);

    let resp = client
        .get("https://api.github.com/repos/rry0ku/veluna/releases/latest")
        .header("User-Agent", "veluna")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let latest = json["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v');

    if latest.is_empty() || latest == current {
        Ok(None)
    } else {
        Ok(Some(latest.to_string()))
    }
}

fn get_mpris_cover_cache_dir() -> std::path::PathBuf {
    if let Ok(xdg) = std::env::var("XDG_CACHE_HOME") {
        if !xdg.is_empty() {
            return std::path::PathBuf::from(xdg).join("veluna").join("mpris_covers");
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(home).join(".cache").join("veluna").join("mpris_covers")
}

fn resolve_mpris_cover(cover_input: &str, track_url: Option<&str>) -> String {
    use base64::Engine;
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let trimmed = cover_input.trim();

    // 1. If it's already an http(s) URL or file:// URI, it's valid for MPRIS clients
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") || trimmed.starts_with("file://") {
        return trimmed.to_string();
    }

    let cache_dir = get_mpris_cover_cache_dir();

    // 2. If it's a data URI (e.g. data:image/jpeg;base64,... or data:image/png;base64,...)
    if trimmed.starts_with("data:image/") {
        if let Some(comma_pos) = trimmed.find(',') {
            let meta_part = &trimmed[..comma_pos];
            let b64 = &trimmed[comma_pos + 1..];
            let ext = if meta_part.contains("png") {
                "png"
            } else if meta_part.contains("webp") {
                "webp"
            } else {
                "jpg"
            };
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64.trim()) {
                if !bytes.is_empty() {
                    let _ = std::fs::create_dir_all(&cache_dir);
                    let mut hasher = DefaultHasher::new();
                    bytes.hash(&mut hasher);
                    let hash = hasher.finish();
                    let file_path = cache_dir.join(format!("cover_{:x}.{}", hash, ext));
                    if !file_path.exists() {
                        let _ = std::fs::write(&file_path, &bytes);
                    }
                    if let Ok(canon) = file_path.canonicalize() {
                        return format!("file://{}", canon.to_string_lossy());
                    } else {
                        return format!("file://{}", file_path.to_string_lossy());
                    }
                }
            }
        }
    }

    // 3. If cover_input was empty or invalid, check if track_url is a local file
    if let Some(u) = track_url {
        if u.starts_with("local://") || u.starts_with('/') {
            let raw_path = u.trim_start_matches("local://");
            let resolved = expand_tilde(raw_path);
            let p = std::path::Path::new(&resolved);
            if p.exists() {
                // Check if directory has a cover (cover.jpg, folder.jpg, song stem image)
                if let Some(cover_file) = metadata::find_directory_cover(p) {
                    if let Ok(canon) = cover_file.canonicalize() {
                        return format!("file://{}", canon.to_string_lossy());
                    } else {
                        return format!("file://{}", cover_file.to_string_lossy());
                    }
                }

                // Check embedded tag picture via lofty/metadata
                if let Some(uri) = metadata::extract_cover_art_data_uri(p) {
                    if let Some(comma_pos) = uri.find(',') {
                        let meta_part = &uri[..comma_pos];
                        let b64 = &uri[comma_pos + 1..];
                        let ext = if meta_part.contains("png") { "png" } else { "jpg" };
                        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64.trim()) {
                            if !bytes.is_empty() {
                                let _ = std::fs::create_dir_all(&cache_dir);
                                let mut hasher = DefaultHasher::new();
                                bytes.hash(&mut hasher);
                                let hash = hasher.finish();
                                let file_path = cache_dir.join(format!("cover_{:x}.{}", hash, ext));
                                if !file_path.exists() {
                                    let _ = std::fs::write(&file_path, &bytes);
                                }
                                if let Ok(canon) = file_path.canonicalize() {
                                    return format!("file://{}", canon.to_string_lossy());
                                } else {
                                    return format!("file://{}", file_path.to_string_lossy());
                                }
                            }
                        }
                    }
                }

                // Fallback: check attached picture stream via ffmpeg
                let output = Command::new(bin_ffmpeg())
                    .args(["-i", &resolved, "-map", "0:v:0", "-frames:v", "1", "-f", "image2pipe", "-"])
                    .no_window()
                    .output();
                if let Ok(out) = output {
                    if out.status.success() && !out.stdout.is_empty() {
                        let bytes = out.stdout;
                        let ext = if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47]) { "png" } else { "jpg" };
                        let _ = std::fs::create_dir_all(&cache_dir);
                        let mut hasher = DefaultHasher::new();
                        bytes.hash(&mut hasher);
                        let hash = hasher.finish();
                        let file_path = cache_dir.join(format!("cover_{:x}.{}", hash, ext));
                        if !file_path.exists() {
                            let _ = std::fs::write(&file_path, &bytes);
                        }
                        if let Ok(canon) = file_path.canonicalize() {
                            return format!("file://{}", canon.to_string_lossy());
                        } else {
                            return format!("file://{}", file_path.to_string_lossy());
                        }
                    }
                }
            }
        }
    }

    // 4. If cover_input is a raw filesystem path without file:// scheme
    if !trimmed.is_empty() {
        let p = std::path::Path::new(trimmed);
        if p.is_file() {
            if let Ok(canon) = p.canonicalize() {
                return format!("file://{}", canon.to_string_lossy());
            } else {
                return format!("file://{}", p.to_string_lossy());
            }
        }
    }

    trimmed.to_string()
}

#[tauri::command]
async fn set_mpris_metadata(
    title: String,
    artist: String,
    album: Option<String>,
    album_artist: Option<String>,
    url: Option<String>,
    cover_url: String,
    duration_secs: f64,
    playing: bool,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut final_title = title;
        let mut final_artist = artist;
        let mut final_album = album.unwrap_or_default();
        let mut final_album_artist = album_artist.unwrap_or_default();
        let mut final_duration_us = (duration_secs * 1_000_000.0) as i64;
        let mut final_url = url.clone().unwrap_or_default();

        if final_album_artist.is_empty() {
            final_album_artist = final_artist.clone();
        }

        if let Some(ref u) = url {
            if u.starts_with("local://") || u.starts_with('/') {
                let clean_p = expand_tilde(u.trim_start_matches("local://"));
                let p = std::path::Path::new(&clean_p);
                if p.exists() {
                    let canon = p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
                    final_url = format!("file://{}", canon.to_string_lossy());
                    if let Some(meta) = metadata::probe_track_metadata(p) {
                        if final_title.is_empty() || final_title == "Unknown Track" {
                            final_title = meta.title;
                        }
                        if final_artist.is_empty() {
                            final_artist = meta.artist.clone();
                        }
                        if final_album.is_empty() {
                            final_album = meta.album;
                        }
                        if final_album_artist.is_empty() {
                            final_album_artist = meta.artist;
                        }
                        if final_duration_us <= 0 && meta.duration_secs > 0.0 {
                            final_duration_us = (meta.duration_secs * 1_000_000.0) as i64;
                        }
                    }
                }
            }
        }

        if final_duration_us <= 0 {
            let cur_dur = current_playback_state().lock().unwrap().duration;
            if cur_dur > 0.0 {
                final_duration_us = (cur_dur * 1_000_000.0) as i64;
            }
        }

        let resolved_cover = resolve_mpris_cover(&cover_url, url.as_deref());

        {
            let mut meta = mpris_meta().lock().unwrap();
            let is_same_track = meta.title == final_title && meta.artist == final_artist && !final_title.is_empty();
            let seq = if is_same_track {
                meta.track_seq
            } else {
                MPRIS_TRACK_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
            };
            if final_duration_us <= 0 && is_same_track && meta.duration_us > 0 {
                final_duration_us = meta.duration_us;
            }
            meta.title = final_title;
            meta.artist = final_artist;
            meta.album = final_album;
            meta.album_artist = final_album_artist;
            meta.url = final_url;
            meta.cover_url = resolved_cover;
            meta.duration_us = final_duration_us;
            meta.playing = playing;
            meta.is_stopped = meta.title.is_empty();
            meta.track_seq = seq;
        }
        mpris_notify();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_mpris_playback(playing: bool) -> Result<(), String> {
    {
        let mut meta = mpris_meta().lock().unwrap();
        meta.playing = playing;
        if playing {
            meta.is_stopped = false;
        }
    }
    mpris_notify();
    Ok(())
}

#[tauri::command]
async fn sync_mpris_controls(
    loop_status: Option<String>,
    shuffle: Option<bool>,
    volume: Option<f64>,
    rate: Option<f64>,
) -> Result<(), String> {
    {
        let mut meta = mpris_meta().lock().unwrap();
        if let Some(ls) = loop_status {
            meta.loop_status = ls;
        }
        if let Some(sh) = shuffle {
            meta.shuffle = sh;
        }
        if let Some(v) = volume {
            meta.volume = v.max(0.0);
        }
        if let Some(r) = rate {
            meta.rate = r.clamp(0.5, 2.0);
        }
    }
    mpris_notify();
    Ok(())
}

#[cfg(target_os = "linux")]
fn start_mpris_server(app_handle: tauri::AppHandle) {
    let (tx, rx) = tokio::sync::watch::channel(());
    let _ = MPRIS_TX.set(tx);
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio rt");
        rt.block_on(async move {
            if let Err(e) = run_mpris_server(app_handle, rx).await {
                eprintln!("[veluna] MPRIS server error: {}", e);
            }
        });
    });
}

#[cfg(target_os = "linux")]
async fn run_mpris_server(
    app_handle: tauri::AppHandle,
    mut rx: tokio::sync::watch::Receiver<()>,
) -> Result<(), Box<dyn std::error::Error>> {
    use zbus::{ConnectionBuilder, dbus_interface, InterfaceRef};
    use zbus::zvariant::{Value as ZValue, OwnedValue, ObjectPath};

    struct MediaPlayer2 {
        app: tauri::AppHandle,
    }

    #[dbus_interface(name = "org.mpris.MediaPlayer2")]
    impl MediaPlayer2 {
        #[dbus_interface(property)]
        fn can_quit(&self) -> bool { true }
        #[dbus_interface(property)]
        fn can_raise(&self) -> bool { true }
        #[dbus_interface(property)]
        fn has_track_list(&self) -> bool { false }
        #[dbus_interface(property)]
        fn identity(&self) -> &str { "Veluna" }
        #[dbus_interface(property)]
        fn desktop_entry(&self) -> &str { "veluna" }
        #[dbus_interface(property)]
        fn supported_uri_schemes(&self) -> Vec<String> {
            vec!["file".into(), "http".into(), "https".into()]
        }
        #[dbus_interface(property)]
        fn supported_mime_types(&self) -> Vec<String> {
            vec![
                "audio/mpeg".into(),
                "audio/mp4".into(),
                "audio/aac".into(),
                "audio/ogg".into(),
                "audio/wav".into(),
                "audio/webm".into(),
                "audio/x-m4a".into(),
            ]
        }
        fn quit(&self) {
            std::process::exit(0);
        }
        fn raise(&self) {
            use tauri::Manager;
            if let Some(w) = self.app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }
    }

    struct Player {
        app: tauri::AppHandle,
    }

    #[dbus_interface(name = "org.mpris.MediaPlayer2.Player")]
    impl Player {
        #[dbus_interface(property)]
        fn playback_status(&self) -> String {
            let m = mpris_meta().lock().unwrap();
            if m.is_stopped || m.title.is_empty() {
                "Stopped".into()
            } else if m.playing {
                "Playing".into()
            } else {
                "Paused".into()
            }
        }
        #[dbus_interface(property)]
        fn loop_status(&self) -> String {
            mpris_meta().lock().unwrap().loop_status.clone()
        }
        #[dbus_interface(property)]
        fn set_loop_status(&self, status: String) {
            let valid = matches!(status.as_str(), "None" | "Track" | "Playlist");
            if !valid {
                return;
            }
            {
                let mut m = mpris_meta().lock().unwrap();
                m.loop_status = status.clone();
            }
            let _ = self.app.emit("mpris_set_loop_status", status);
            mpris_notify();
        }
        #[dbus_interface(property)]
        fn rate(&self) -> f64 {
            mpris_meta().lock().unwrap().rate
        }
        #[dbus_interface(property)]
        fn set_rate(&self, rate: f64) {
            let clamped = rate.clamp(0.5, 2.0);
            {
                let mut m = mpris_meta().lock().unwrap();
                m.rate = clamped;
            }
            let cmd = format!(r#"{{"command": ["set_property", "speed", {}]}}"#, clamped);
            let _ = send_ipc_fire_and_forget(&cmd);
            let _ = self.app.emit("mpris_set_rate", clamped);
            mpris_notify();
        }
        #[dbus_interface(property)]
        fn shuffle(&self) -> bool {
            mpris_meta().lock().unwrap().shuffle
        }
        #[dbus_interface(property)]
        fn set_shuffle(&self, shuffle: bool) {
            {
                let mut m = mpris_meta().lock().unwrap();
                m.shuffle = shuffle;
            }
            let _ = self.app.emit("mpris_set_shuffle", shuffle);
            mpris_notify();
        }

        #[dbus_interface(property)]
        fn metadata(&self) -> HashMap<String, OwnedValue> {
            let (title, artist, album, album_artist, url, cover_url, duration_us, track_seq) = {
                let m = mpris_meta().lock().unwrap();
                (m.title.clone(), m.artist.clone(), m.album.clone(), m.album_artist.clone(), m.url.clone(), m.cover_url.clone(), m.duration_us, m.track_seq)
            };
            let mut map: HashMap<String, OwnedValue> = HashMap::new();
            let track_path = if title.is_empty() {
                "/org/mpris/MediaPlayer2/TrackList/NoTrack".to_string()
            } else {
                format!("/org/veluna/track/t{}", track_seq)
            };
            if let Ok(op) = ObjectPath::try_from(track_path.as_str()) {
                map.insert("mpris:trackid".into(),
                    OwnedValue::try_from(ZValue::new(op)).unwrap());
            }
            map.insert("xesam:title".into(),
                OwnedValue::try_from(ZValue::new(title.as_str())).unwrap());
            map.insert("xesam:artist".into(),
                OwnedValue::try_from(ZValue::new(vec![artist.as_str()])).unwrap());
            if !album.is_empty() {
                map.insert("xesam:album".into(),
                    OwnedValue::try_from(ZValue::new(album.as_str())).unwrap());
            }
            let resolved_album_artist = if !album_artist.is_empty() {
                album_artist
            } else {
                artist.clone()
            };
            if !resolved_album_artist.is_empty() {
                map.insert("xesam:albumArtist".into(),
                    OwnedValue::try_from(ZValue::new(vec![resolved_album_artist.as_str()])).unwrap());
            }
            if !url.is_empty() {
                map.insert("xesam:url".into(),
                    OwnedValue::try_from(ZValue::new(url.as_str())).unwrap());
            }
            if !cover_url.is_empty() {
                map.insert("mpris:artUrl".into(),
                    OwnedValue::try_from(ZValue::new(cover_url.as_str())).unwrap());
            }
            if duration_us > 0 {
                map.insert("mpris:length".into(),
                    OwnedValue::try_from(ZValue::new(duration_us)).unwrap());
            }
            map
        }

        #[dbus_interface(property)]
        fn volume(&self) -> f64 {
            mpris_meta().lock().unwrap().volume
        }
        #[dbus_interface(property)]
        fn set_volume(&self, volume: f64) {
            let v = volume.max(0.0);
            {
                let mut m = mpris_meta().lock().unwrap();
                m.volume = v;
            }
            let cmd = format!(r#"{{"command": ["set_property", "volume", {}]}}"#, (v * 100.0).clamp(0.0, 150.0));
            let _ = send_ipc_fire_and_forget(&cmd);
            let _ = self.app.emit("mpris_set_volume", v * 100.0);
            mpris_notify();
        }
        #[dbus_interface(property)]
        fn position(&self) -> i64 {
            let p = current_playback_state().lock().unwrap().position;
            if p.is_finite() && p >= 0.0 {
                (p * 1_000_000.0) as i64
            } else {
                0
            }
        }
        #[dbus_interface(property)]
        fn minimum_rate(&self) -> f64 { 0.5 }
        #[dbus_interface(property)]
        fn maximum_rate(&self) -> f64 { 2.0 }
        #[dbus_interface(property)]
        fn can_go_next(&self) -> bool { true }
        #[dbus_interface(property)]
        fn can_go_previous(&self) -> bool { true }
        #[dbus_interface(property)]
        fn can_play(&self) -> bool { true }
        #[dbus_interface(property)]
        fn can_pause(&self) -> bool { true }
        #[dbus_interface(property)]
        fn can_seek(&self) -> bool { true }
        #[dbus_interface(property)]
        fn can_control(&self) -> bool { true }

        fn next(&self)       { let _ = self.app.emit("mpris_next", ()); }
        fn previous(&self)   { let _ = self.app.emit("mpris_prev", ()); }
        fn play_pause(&self) { let _ = self.app.emit("mpris_play_pause", ()); }
        fn play(&self)       { let _ = self.app.emit("mpris_play", ()); }
        fn pause(&self)      { let _ = self.app.emit("mpris_pause", ()); }
        fn stop(&self)       { let _ = self.app.emit("mpris_stop", ()); }

        #[dbus_interface(signal)]
        async fn seeked(signal_ctxt: &zbus::SignalContext<'_>, position: i64) -> zbus::Result<()>;

        async fn seek(&self, #[zbus(signal_context)] ctxt: zbus::SignalContext<'_>, offset_us: i64) -> zbus::fdo::Result<()> {
            let offset_secs = offset_us as f64 / 1_000_000.0;
            let cmd = format!(r#"{{"command": ["seek", {}, "relative"]}}"#, offset_secs);
            let _ = send_ipc_fire_and_forget(&cmd);
            let new_pos_us = {
                let mut state = current_playback_state().lock().unwrap();
                let dur = state.duration;
                let mut new_pos = state.position + offset_secs;
                if new_pos < 0.0 { new_pos = 0.0; }
                if dur > 0.0 && new_pos > dur { new_pos = dur; }
                state.position = new_pos;
                (new_pos * 1_000_000.0) as i64
            };
            let _ = self.app.emit("mpris_seeked", new_pos_us as f64 / 1_000_000.0);
            let _ = Self::seeked(&ctxt, new_pos_us).await;
            Ok(())
        }
        async fn set_position(&self, #[zbus(signal_context)] ctxt: zbus::SignalContext<'_>, track_id: ObjectPath<'_>, position_us: i64) -> zbus::fdo::Result<()> {
            let (cur_track_seq, max_dur_us) = {
                let m = mpris_meta().lock().unwrap();
                (m.track_seq, m.duration_us)
            };
            let expected_path = format!("/org/veluna/track/t{}", cur_track_seq);
            let path_str = track_id.as_str();
            if !path_str.is_empty()
                && path_str != "/"
                && path_str != "/org/mpris/MediaPlayer2/TrackList/NoTrack"
                && path_str != expected_path
            {
                return Ok(());
            }
            if position_us < 0 {
                return Ok(());
            }
            if max_dur_us > 0 && position_us > max_dur_us {
                return Ok(());
            }
            let pos_secs = (position_us as f64) / 1_000_000.0;
            let cmd = format!(r#"{{"command": ["seek", {}, "absolute"]}}"#, pos_secs);
            let _ = send_ipc_fire_and_forget(&cmd);
            {
                let mut state = current_playback_state().lock().unwrap();
                state.position = pos_secs;
            }
            let _ = self.app.emit("mpris_seeked", pos_secs);
            let _ = Self::seeked(&ctxt, position_us).await;
            Ok(())
        }
        fn open_uri(&self, uri: String) {
            let _ = self.app.emit("mpris_open_uri", uri);
        }
    }

    let conn = ConnectionBuilder::session()?
        .name("org.mpris.MediaPlayer2.veluna")?
        .serve_at("/org/mpris/MediaPlayer2", MediaPlayer2 { app: app_handle.clone() })?
        .serve_at("/org/mpris/MediaPlayer2", Player { app: app_handle.clone() })?
        .build()
        .await?;

    let player_iface: InterfaceRef<Player> = conn
        .object_server()
        .interface("/org/mpris/MediaPlayer2")
        .await?;

    loop {
        let _ = rx.changed().await;
        let iface = player_iface.get().await;
        let ctxt  = player_iface.signal_context();
        let _ = iface.playback_status_changed(ctxt).await;
        let _ = iface.metadata_changed(ctxt).await;
        let _ = iface.loop_status_changed(ctxt).await;
        let _ = iface.shuffle_changed(ctxt).await;
        let _ = iface.volume_changed(ctxt).await;
        let _ = iface.rate_changed(ctxt).await;
    }
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let safe_path = sanitize_file_path(&path)?;
    std::fs::read_to_string(&safe_path).map_err(|e| format!("Read failed: {}", e))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let safe_path = sanitize_file_path(&path)?;
    if let Some(parent) = safe_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create directory: {}", e))?;
    }
    std::fs::write(&safe_path, content.as_bytes()).map_err(|e| format!("Write failed: {}", e))
}

static DISCORD_CLIENT: std::sync::OnceLock<Mutex<Option<DiscordIpcClient>>> = std::sync::OnceLock::new();

fn get_discord_client() -> &'static Mutex<Option<DiscordIpcClient>> {
    DISCORD_CLIENT.get_or_init(|| Mutex::new(None))
}

#[tauri::command]
fn set_network_config(proxy_url: Option<String>, custom_instance: Option<String>) -> Result<(), String> {
    let clean_proxy = proxy_url.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let clean_inst = custom_instance.map(|s| s.trim().trim_end_matches('/').to_string()).filter(|s| !s.is_empty());
    {
        let mut cfg = network_config().lock().unwrap();
        cfg.proxy_url = clean_proxy.clone();
        cfg.custom_instance = clean_inst;
    }
    if let Some(cache_lock) = CURRENT_HTTP_CLIENT.get() {
        let mut guard = cache_lock.lock().unwrap();
        *guard = None;
    }
    let proxy_target = clean_proxy.as_deref().unwrap_or("");
    let cmd = serde_json::json!({ "command": ["set_property", "http-proxy", proxy_target] }).to_string();
    let _ = send_ipc_command_with_retry(&cmd, 1);
    Ok(())
}

#[tauri::command]
async fn test_network_connection(proxy_url: Option<String>, custom_instance: Option<String>) -> Result<String, String> {
    let clean_proxy = proxy_url.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let mut clean_inst = custom_instance.map(|s| s.trim().trim_end_matches('/').to_string()).filter(|s| !s.is_empty());

    let has_proxy = clean_proxy.is_some();
    let has_inst = clean_inst.is_some();

    if let Some(ref inst) = clean_inst {
        if !inst.starts_with("http://") && !inst.starts_with("https://") {
            clean_inst = Some(format!("https://{}", inst));
        }
    }

    let mut builder = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5));
    if let Some(ref p) = clean_proxy {
        let proxy = reqwest::Proxy::all(p).map_err(|e| format!("Invalid proxy URL: {}", e))?;
        builder = builder.proxy(proxy);
    }
    let client = builder.build().map_err(|e| e.to_string())?;

    let test_url = clean_inst.unwrap_or_else(|| "https://www.youtube.com".to_string());
    let res = client.get(&test_url).send().await.map_err(|e| format!("Connection failed: {}", e))?;

    if res.status().is_success() || res.status().is_redirection() {
        let status_code = res.status().as_u16();
        if has_proxy && has_inst {
            Ok(format!("Proxy & Custom Mirror reachable (HTTP {})", status_code))
        } else if has_proxy {
            Ok(format!("Proxy connected successfully (HTTP {})", status_code))
        } else if has_inst {
            Ok(format!("Custom Mirror reachable (HTTP {})", status_code))
        } else {
            Ok(format!("Direct internet connection OK (HTTP {} - no proxy configured)", status_code))
        }
    } else {
        Err(format!("Server returned HTTP {}", res.status().as_u16()))
    }
}

static FOLDER_WATCHER: std::sync::OnceLock<Mutex<Option<notify::RecommendedWatcher>>> = std::sync::OnceLock::new();
static WATCHED_FOLDER: std::sync::OnceLock<Mutex<Option<String>>> = std::sync::OnceLock::new();

#[tauri::command]
fn watch_download_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use notify::{Watcher, RecursiveMode, Event, EventKind};

    let resolved = expand_tilde(&path);
    let p = std::path::PathBuf::from(&resolved);
    if !p.exists() || !p.is_dir() {
        return Ok(());
    }

    let mut cur_folder = WATCHED_FOLDER.get_or_init(|| Mutex::new(None)).lock().unwrap();
    if cur_folder.as_deref() == Some(&resolved) {
        return Ok(());
    }
    *cur_folder = Some(resolved.clone());

    let app_clone = app.clone();
    let mut watcher_lock = FOLDER_WATCHER.get_or_init(|| Mutex::new(None)).lock().unwrap();
    *watcher_lock = None;

    let debounce_tx = Arc::new(Mutex::new(std::time::Instant::now() - std::time::Duration::from_secs(5)));

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            match event.kind {
                EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_) => {
                    let is_audio = event.paths.iter().any(|p| {
                        if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                            matches!(ext.to_lowercase().as_str(), "mp3" | "flac" | "wav" | "m4a" | "ogg" | "opus" | "aac" | "m4b")
                        } else {
                            false
                        }
                    });
                    if is_audio || event.paths.is_empty() {
                        let mut last = debounce_tx.lock().unwrap();
                        if last.elapsed() > std::time::Duration::from_millis(400) {
                            *last = std::time::Instant::now();
                            let _ = app_clone.emit("local_folder_changed", ());
                        }
                    }
                }
                _ => {}
            }
        }
    }).map_err(|e| e.to_string())?;

    watcher.watch(&p, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    *watcher_lock = Some(watcher);
    Ok(())
}

#[tauri::command]
fn update_discord_rpc(
    title: String,
    artist: Option<String>,
    cover_url: Option<String>,
    track_url: Option<String>,
    start_timestamp: Option<i64>,
    end_timestamp: Option<i64>,
    show_cover: Option<bool>,
    time_display: Option<String>,
    custom_button_label: Option<String>,
    custom_button_url: Option<String>,
) {
    std::thread::spawn(move || {
        let mut client_lock = get_discord_client().lock().unwrap();
        if client_lock.is_none() {
            let mut client = DiscordIpcClient::new("1517835351044001953");
            if client.connect().is_ok() {
                *client_lock = Some(client);
            }
        }
        if let Some(ref mut client) = *client_lock {
            let title_trim = title.trim();
            let safe_title: String = if title_trim.is_empty() {
                "Listening to Music".to_string()
            } else if title_trim.chars().count() > 120 {
                title_trim.chars().take(120).collect()
            } else {
                title_trim.to_string()
            };
            let clean_artist = artist.as_deref().unwrap_or("").trim();
            let safe_artist: String = if clean_artist.chars().count() > 120 {
                clean_artist.chars().take(120).collect()
            } else {
                clean_artist.to_string()
            };

            let mut act = activity::Activity::new()
                .details(&safe_title)
                .activity_type(activity::ActivityType::Listening);
            if !safe_artist.is_empty() {
                act = act.state(&safe_artist);
            }
            let mut assets = activity::Assets::new()
                .small_image("icon")
                .small_text("Veluna");
            if show_cover.unwrap_or(true) {
                if let Some(ref url) = cover_url {
                    if !url.trim().is_empty() {
                        assets = assets.large_image(url);
                    }
                }
            }
            act = act.assets(assets);

            let t_mode = time_display.as_deref().unwrap_or("remaining");
            if let Some(start) = start_timestamp {
                if t_mode == "elapsed" {
                    act = act.timestamps(activity::Timestamps::new().start(start));
                } else if let Some(end) = end_timestamp {
                    if end > start {
                        act = act.timestamps(activity::Timestamps::new().start(start).end(end));
                    } else {
                        act = act.timestamps(activity::Timestamps::new().start(start));
                    }
                } else {
                    act = act.timestamps(activity::Timestamps::new().start(start));
                }
            }

            let c_label = custom_button_label.unwrap_or_default();
            let c_url = custom_button_url.unwrap_or_default();
            let l_trim = c_label.trim();
            let u_trim = c_url.trim();
            let safe_btn_label: String = if l_trim.chars().count() > 32 {
                l_trim.chars().take(32).collect()
            } else {
                l_trim.to_string()
            };
            let mut buttons = Vec::new();
            if !safe_btn_label.is_empty() && (u_trim.starts_with("http://") || u_trim.starts_with("https://")) {
                buttons.push(activity::Button::new(&safe_btn_label, u_trim));
            }
            if buttons.is_empty() {
                if let Some(ref url) = track_url {
                    if url.starts_with("http://") || url.starts_with("https://") {
                        buttons.push(activity::Button::new("Listen on YouTube", url));
                    }
                }
            }
            if buttons.len() < 2 {
                buttons.push(activity::Button::new("Download Veluna", "https://github.com/rry0ku/veluna/releases/"));
            }
            act = act.buttons(buttons);

            if client.set_activity(act).is_err() {
                let _ = client.close();
                *client_lock = None;
            }
        }
    });
}

#[tauri::command]
fn clear_discord_rpc() {
    std::thread::spawn(|| {
        let mut client_lock = get_discord_client().lock().unwrap();
        if let Some(ref mut client) = *client_lock {
            if client.clear_activity().is_err() {
                let _ = client.close();
                *client_lock = None;
            }
        }
    });
}

#[cfg(target_os = "linux")]
fn silence_ayatana_warnings() {
    use std::os::raw::{c_char, c_void};

    #[link(name = "glib-2.0")]
    extern "C" {
        fn g_log_set_handler(
            log_domain: *const c_char,
            log_level: i32,
            log_func: unsafe extern "C" fn(*const c_char, i32, *const c_char, *mut c_void),
            user_data: *mut c_void,
        ) -> u32;
    }

    unsafe extern "C" fn dummy_log_handler(
        _log_domain: *const c_char,
        _log_level: i32,
        _message: *const c_char,
        _user_data: *mut c_void,
    ) {}

    unsafe {
        let mask = 0xFFFFFFFCu32 as i32;
        g_log_set_handler(
            b"libayatana-appindicator\0".as_ptr() as *const c_char,
            mask,
            dummy_log_handler,
            std::ptr::null_mut(),
        );
    }
}

#[tauri::command]
async fn get_local_track_cover(path: String) -> Result<Option<String>, String> {
    let p = std::path::PathBuf::from(expand_tilde(&path));
    if let Some(uri) = metadata::extract_cover_art_data_uri(&p) {
        return Ok(Some(uri));
    }
    get_audio_cover(path).await
}

#[tauri::command]
async fn write_local_track_tags(
    path: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
) -> Result<(), String> {
    let p = std::path::PathBuf::from(expand_tilde(&path));
    tokio::task::spawn_blocking(move || {
        metadata::write_track_tags(&p, title.as_deref(), artist.as_deref(), album.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn db_save_playlist(playlist: db::DbPlaylist) -> Result<(), String> {
    db::save_playlist(playlist)
}

#[tauri::command]
fn db_get_playlists() -> Result<Vec<db::DbPlaylist>, String> {
    db::get_all_playlists()
}

#[tauri::command]
fn db_delete_playlist(id: String) -> Result<(), String> {
    db::delete_playlist(&id)
}

#[tauri::command]
fn db_record_play_event(url: String, title: String, artist: String, secs: i64) -> Result<(), String> {
    db::record_play_event(&url, &title, &artist, secs)
}

#[tauri::command]
fn db_get_listening_stats() -> Result<Vec<db::DbTrackStat>, String> {
    db::get_listening_stats()
}

#[tauri::command]
fn db_get_listening_history(limit: Option<usize>) -> Result<Vec<db::DbListeningEvent>, String> {
    db::get_listening_history(limit.unwrap_or(100))
}

#[tauri::command]
fn db_clear_listening_stats() -> Result<(), String> {
    db::clear_listening_stats()
}

#[tauri::command]
fn db_search_library(query: String) -> Result<Vec<db::DbSearchResult>, String> {
    db::search_library_fts(&query)
}

#[tauri::command]
async fn download_stream_chunked(
    app: tauri::AppHandle,
    stream_url: String,
    target_path: String,
    track_url: String,
    title: String,
    artist: String,
    album: String,
    cover_url: Option<String>,
    lyrics_text: Option<String>,
) -> Result<String, String> {
    let resolved = std::path::PathBuf::from(expand_tilde(&target_path));
    downloader::download_audio_stream_chunked(
        app,
        stream_url,
        resolved,
        track_url,
        title,
        artist,
        album,
        cover_url,
        lyrics_text,
    ).await
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Fix WebKitGTK Wayland crash: Error 71 (Protocol error) dispatching to Wayland display
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        silence_ayatana_warnings();
    }
    
    init_bin_paths();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
                let _ = w.emit("window_focus", ());
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

            let handle = app.handle().clone();

            init_log_path(&app.handle());
            let _ = db::init_db(&app.handle());
            app.manage(tray::init());

            #[cfg(target_os = "linux")]
            start_mpris_server(handle.clone());

            let h_mpv = handle.clone();
            std::thread::spawn(move || {
                if ensure_mpv_running() {
                    start_mpv_event_listener(h_mpv);
                }
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(tauri::include_image!("icons/128x128.png"));
                let _ = window.set_zoom(1.10);

                #[cfg(target_os = "windows")]
                {
                    if let Ok(hwnd) = window.hwnd() {
                        let raw_hwnd: *mut std::ffi::c_void = unsafe { std::mem::transmute(hwnd.0) };
                        if let Err(e) = windows_smtc::init_windows_smtc(handle.clone(), raw_hwnd) {
                            eprintln!("[SMTC] Failed to initialize Windows SMTC: {}", e);
                        }
                    }
                }
            }

            let shortcuts = [
                ("MediaPlayPause", "mpris_play_pause"),
                ("MediaNextTrack",  "mpris_next"),
                ("MediaPrevTrack",  "mpris_prev"),
            ];

            for (key, event) in shortcuts {
                if let Ok(shortcut) = key.parse::<Shortcut>() {
                    let h = handle.clone();
                    let ev = event.to_string();
                    let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _sc, event| {
                        if event.state == ShortcutState::Pressed {
                            let _ = h.emit(&ev, ());
                        }
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            get_app_version,
            check_for_update,
            set_mpris_metadata,
            update_mpris_playback,
            sync_mpris_controls,
            get_local_track_cover,
            write_local_track_tags,
            db_save_playlist,
            db_get_playlists,
            db_delete_playlist,
            db_record_play_event,
            db_get_listening_stats,
            db_get_listening_history,
            db_clear_listening_stats,
            db_search_library,
            download_stream_chunked,
            search_youtube,
            search_youtube_artists,
            get_artist_page_details,
            prefetch_track,
            import_csv_playlist,
            import_youtube_playlist,
            open_url_in_browser,
            set_loudnorm_enabled,
            set_skip_silence,
            get_loudnorm_enabled,
            play_audio,
            play_local_file,
            pause_audio,
            resume_audio,
            seek_audio,
            seek_relative,
            seek_to_start,
            set_volume,
            get_progress,
            get_duration,
            is_paused,
            get_playback_state,
            set_playback_speed,
            get_playback_speed,
            get_audio_info,
            set_equalizer,
            set_sleep_timer,
            cancel_sleep_timer,
            get_sleep_timer_remaining,
            download_song,
            cancel_download,
            batch_download,
            scan_downloads,
            delete_local_file,
            rename_local_file,
            open_in_file_manager,
            get_audio_metadata,
            write_audio_metadata,
            get_audio_cover,
            get_waveform_thumbnail,
            get_disk_usage,
            export_playlist_m3u,
            import_playlist_m3u,
            normalize_file,
            read_text_file,
            write_text_file,
            fetch_lyrics,
            search_yt_music,
            tray::tray_set,
            tray::tray_update_title,
            cache::get_cache_info,
            cache::clear_app_cache,
            cache::prune_cache_if_needed,
            set_cache_enabled,
            get_cache_enabled,
            update_discord_rpc,
            clear_discord_rpc,
            watch_download_folder,
            set_network_config,
            test_network_connection,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match event {
                
                tauri::RunEvent::WindowEvent {
                    label,
                    event: tauri::WindowEvent::CloseRequested { api, .. },
                    ..
                } if label == "main" => {
                    let flag = app_handle.state::<tray::TrayFlag>();
                    if tray::handle_close_requested(app_handle, &flag) {
                        api.prevent_close();
                    }
                }
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    if let Some(mut child) = mpv_process().lock().unwrap().take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    #[cfg(unix)]
                    { let _ = std::fs::remove_file(socket_path()); }
                    #[cfg(target_os = "windows")]
                    windows_smtc::shutdown_windows_smtc();
                }
                _ => {}
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_import_exportify_csv() {
        let csv = "\u{feff}\"Spotify ID\",\"Track URI\",\"Track Name\",\"Artist Name(s)\",\"Album Name\",\"Duration (ms)\"\n\"1\",\"spotify:track:123\",\"Starboy\",\"The Weeknd, Daft Punk\",\"Starboy\",230000\n";
        let res = import_csv_playlist(csv.to_string()).await.unwrap();
        assert!(res.contains("Starboy====The Weeknd, Daft Punk"));
    }

    #[tokio::test]
    async fn test_import_two_column_csv() {
        let csv = "Blinding Lights, The Weeknd\nSave Your Tears, The Weeknd\n";
        let res = import_csv_playlist(csv.to_string()).await.unwrap();
        assert!(res.contains("Blinding Lights====The Weeknd"));
        assert!(res.contains("Save Your Tears====The Weeknd"));
    }

    #[tokio::test]
    async fn test_import_csv_with_quotes_and_commas() {
        let csv = "Track Name,Artist Name,Album\n\"Rock, Paper, Scissors\",The Band,\"Greatest, Hits\"\n";
        let res = import_csv_playlist(csv.to_string()).await.unwrap();
        assert!(res.contains("Rock, Paper, Scissors====The Band"));
    }

    #[test]
    fn test_parse_lrc_with_metadata_tags() {
        let lrc = r#"
[ar:Radiohead]
[al:Pablo Honey]
[ti:Creep]
[00:10.50]When you were here before
[00:15.20]Couldn't look you in the eye
"#;
        let res = parse_lrc_string(lrc, 120.0).expect("should parse lrc");
        let parsed: Vec<serde_json::Value> = serde_json::from_str(&res).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0]["text"], "When you were here before");
        assert_eq!(parsed[0]["time"], 10.5);
        assert_eq!(parsed[1]["text"], "Couldn't look you in the eye");
        assert_eq!(parsed[1]["time"], 15.2);
    }

    #[test]
    fn test_parse_lrc_plain_text_ignoring_tags() {
        let lrc = r#"
[ar:Radiohead]
[ti:Creep]
When you were here before
Couldn't look you in the eye
"#;
        let res = parse_lrc_string(lrc, 10.0).expect("should parse plain text");
        let parsed: Vec<serde_json::Value> = serde_json::from_str(&res).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0]["text"], "When you were here before");
        assert_eq!(parsed[1]["text"], "Couldn't look you in the eye");
    }

    #[test]
    fn test_sanitize_file_path_valid() {
        #[cfg(unix)]
        {
            let res = sanitize_file_path("/tmp/test.mp3");
            assert!(res.is_ok());
            assert_eq!(res.unwrap(), std::path::PathBuf::from("/tmp/test.mp3"));

            let res_file = sanitize_file_path("file:///tmp/test.mp3");
            assert!(res_file.is_ok());
            assert_eq!(res_file.unwrap(), std::path::PathBuf::from("/tmp/test.mp3"));
        }
    }

    #[test]
    fn test_truncate_str_utf8() {
        let multi_byte = "こんにちは世界！Hello";
        let truncated = truncate_str(multi_byte, 5);
        assert_eq!(truncated, "こんにちは");

        let ascii = "abcdefghij";
        assert_eq!(truncate_str(ascii, 3), "abc");
        assert_eq!(truncate_str(ascii, 20), "abcdefghij");
    }
}

