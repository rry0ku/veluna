use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, COOKIE, ORIGIN, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

static SYNC_CANCELLED: AtomicBool = AtomicBool::new(false);

pub fn is_sync_cancelled() -> bool {
    SYNC_CANCELLED.load(Ordering::SeqCst)
}

pub fn cancel_youtube_sync_internal(_app: &AppHandle) -> Result<(), String> {
    SYNC_CANCELLED.store(true, Ordering::SeqCst);
    Ok(())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct YouTubeAccount {
    pub id: String,
    pub name: String,
    pub handle: Option<String>,
    pub avatar_url: Option<String>,
    pub is_selected: bool,
    pub page_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct YouTubeAuthStatus {
    pub is_authenticated: bool,
    pub active_account: Option<YouTubeAccount>,
    pub accounts: Vec<YouTubeAccount>,
    pub cookie_count: usize,
}

#[derive(Serialize, Clone, Debug)]
pub struct SyncProgressPayload {
    pub stage: String,
    pub progress: f64,
    pub message: String,
    pub current_item: Option<String>,
    pub total_items: usize,
    pub processed_items: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SyncedTrack {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub duration: String,
    pub url: String,
    pub cover: String,
    pub album: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SyncedPlaylist {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tracks: Vec<SyncedTrack>,
    #[serde(rename = "customCover")]
    pub custom_cover: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SyncResult {
    pub liked_songs_count: usize,
    pub playlists: Vec<SyncedPlaylist>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct SavedAccountState {
    pub active_account: Option<YouTubeAccount>,
    pub accounts: Vec<YouTubeAccount>,
}

pub fn get_storage_dir(app: &AppHandle) -> PathBuf {
    let data_dir = app.path()
        .app_data_dir()
        .ok()
        .or_else(|| app.path().app_cache_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));

    // If cookies exist in app_cache_dir but not app_data_dir, migrate them
    if let Ok(cache_dir) = app.path().app_cache_dir() {
        if cache_dir != data_dir {
            for fname in &["cookies.txt", "youtube_cookies_raw.txt", "youtube_account.json"] {
                let cache_file = cache_dir.join(fname);
                let data_file = data_dir.join(fname);
                if cache_file.is_file() && !data_file.exists() {
                    let _ = std::fs::copy(&cache_file, &data_file);
                }
            }
        }
    }

    data_dir
}

pub fn get_cookies_txt_path(app: &AppHandle) -> PathBuf {
    get_storage_dir(app).join("cookies.txt")
}

pub fn get_raw_cookies_path(app: &AppHandle) -> PathBuf {
    get_storage_dir(app).join("youtube_cookies_raw.txt")
}

pub fn get_account_state_path(app: &AppHandle) -> PathBuf {
    get_storage_dir(app).join("youtube_account.json")
}

pub fn get_valid_cookies_file(app: &AppHandle) -> Option<PathBuf> {
    let path = get_cookies_txt_path(app);
    if path.is_file() {
        if let Ok(meta) = std::fs::metadata(&path) {
            if meta.len() > 10 {
                return Some(path);
            }
        }
    }
    None
}

pub fn parse_cookie_input(raw: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    let trimmed = raw.trim();

    if trimmed.contains('\t') || trimmed.starts_with("# Netscape") {
        for line in trimmed.lines() {
            let l = line.trim();
            if l.is_empty() || l.starts_with('#') {
                continue;
            }
            let parts: Vec<&str> = l.split('\t').collect();
            if parts.len() >= 7 {
                let name = parts[5].trim().to_string();
                let value = parts[6].trim().to_string();
                if !name.is_empty() {
                    pairs.push((name, value));
                }
            }
        }
    }

    if pairs.is_empty() {
        let clean = if let Some(stripped) = trimmed.strip_prefix("Cookie:") {
            stripped
        } else if let Some(stripped) = trimmed.strip_prefix("cookie:") {
            stripped
        } else {
            trimmed
        };

        for chunk in clean.split(';') {
            let item = chunk.trim();
            if item.is_empty() {
                continue;
            }
            if let Some((k, v)) = item.split_once('=') {
                let key = k.trim().to_string();
                let val = v.trim().to_string();
                if !key.is_empty() {
                    pairs.push((key, val));
                }
            }
        }
    }

    pairs
}

pub fn pairs_to_netscape(pairs: &[(String, String)]) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let expiry = now + (365 * 24 * 3600); // 1 year expiration
    let mut out = String::from("# Netscape HTTP Cookie File\n# Generated by Veluna\n\n");
    for (k, v) in pairs {
        out.push_str(&format!(".youtube.com\tTRUE\t/\tTRUE\t{}\t{}\t{}\n", expiry, k, v));
        out.push_str(&format!(".google.com\tTRUE\t/\tTRUE\t{}\t{}\t{}\n", expiry, k, v));
    }
    out
}

pub fn pairs_to_header(pairs: &[(String, String)]) -> String {
    pairs
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("; ")
}

pub fn find_cookie_val<'a>(pairs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    pairs
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
        .map(|(_, v)| v.as_str())
}

pub fn get_sapisid(pairs: &[(String, String)]) -> Option<&str> {
    find_cookie_val(pairs, "SAPISID")
        .or_else(|| find_cookie_val(pairs, "__Secure-3PAPISID"))
        .or_else(|| find_cookie_val(pairs, "__Secure-1PAPISID"))
}

pub fn generate_sapisid_hash(sapisid: &str, origin: &str) -> (u64, String) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let to_hash = format!("{} {} {}", now, sapisid, origin);
    let mut hasher = Sha1::new();
    hasher.update(to_hash.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    (now, hash)
}

fn generate_track_id(raw_id: &str) -> i64 {
    let mut hasher = Sha1::new();
    hasher.update(raw_id.as_bytes());
    let bytes = hasher.finalize();
    let num = u64::from_be_bytes(bytes[0..8].try_into().unwrap_or([0; 8]));
    (num & 0x7FFFFFFFFFFFFFFF) as i64
}

fn load_saved_state(app: &AppHandle) -> SavedAccountState {
    let path = get_account_state_path(app);
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(state) = serde_json::from_str::<SavedAccountState>(&data) {
            return state;
        }
    }
    SavedAccountState {
        active_account: None,
        accounts: Vec::new(),
    }
}

fn save_account_state(app: &AppHandle, state: &SavedAccountState) {
    let dir = get_storage_dir(app);
    let _ = std::fs::create_dir_all(&dir);
    let path = get_account_state_path(app);
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = std::fs::write(path, json);
    }
}

pub fn get_youtube_auth_status_internal(app: &AppHandle) -> YouTubeAuthStatus {
    let cookies_path = get_cookies_txt_path(app);
    let is_authenticated = cookies_path.is_file()
        && std::fs::metadata(&cookies_path).map(|m| m.len() > 10).unwrap_or(false);

    let state = load_saved_state(app);
    let cookie_count = if let Ok(content) = std::fs::read_to_string(get_raw_cookies_path(app)) {
        parse_cookie_input(&content).len()
    } else {
        0
    };

    YouTubeAuthStatus {
        is_authenticated,
        active_account: state.active_account,
        accounts: state.accounts,
        cookie_count,
    }
}

pub fn clear_youtube_cookies_internal(app: &AppHandle) -> Result<(), String> {
    if let Ok(dir) = app.path().app_cache_dir() {
        let _ = std::fs::remove_file(dir.join("cookies.txt"));
        let _ = std::fs::remove_file(dir.join("youtube_cookies_raw.txt"));
        let _ = std::fs::remove_file(dir.join("youtube_account.json"));
    }
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::remove_file(dir.join("cookies.txt"));
        let _ = std::fs::remove_file(dir.join("youtube_cookies_raw.txt"));
        let _ = std::fs::remove_file(dir.join("youtube_account.json"));
    }
    let _ = std::fs::remove_file(get_cookies_txt_path(app));
    let _ = std::fs::remove_file(get_raw_cookies_path(app));
    let _ = std::fs::remove_file(get_account_state_path(app));
    Ok(())
}

fn extract_text_from_runs_or_simple(v: &Value) -> Option<String> {
    if let Some(s) = v.get("simpleText").and_then(|s| s.as_str()) {
        return Some(s.to_string());
    }
    if let Some(runs) = v.get("runs").and_then(|r| r.as_array()) {
        let joined: String = runs
            .iter()
            .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("");
        if !joined.is_empty() {
            return Some(joined);
        }
    }
    None
}

fn find_accounts_in_json(val: &Value, accounts: &mut Vec<YouTubeAccount>) {
    if let Some(obj) = val.as_object() {
        if let Some(item) = obj.get("accountItemRenderer") {
            let name = item
                .get("accountName")
                .and_then(extract_text_from_runs_or_simple)
                .unwrap_or_else(|| "YouTube Account".to_string());

            let handle = item
                .get("accountByline")
                .and_then(extract_text_from_runs_or_simple);

            let avatar_url = item
                .get("accountPhoto")
                .and_then(|p| p.get("thumbnails"))
                .and_then(|t| t.as_array())
                .and_then(|arr| arr.last())
                .and_then(|th| th.get("url"))
                .and_then(|u| u.as_str())
                .map(|s| s.to_string());

            let is_selected = item
                .get("isSelected")
                .and_then(|s| s.as_bool())
                .unwrap_or(false);

            // Extract page_id / channelId / identity token
            let mut page_id = None;
            if let Some(endpoint) = item.get("serviceEndpoint") {
                if let Some(select_endpoint) = endpoint.get("selectActiveIdentityEndpoint") {
                    if let Some(tokens) = select_endpoint.get("supportedTokens").and_then(|t| t.as_array()) {
                        for token in tokens {
                            if let Some(pid) = token.get("pageId").and_then(|p| p.as_str()) {
                                page_id = Some(pid.to_string());
                                break;
                            }
                            if let Some(pid) = token.get("delegatedIdentityId").and_then(|p| p.as_str()) {
                                page_id = Some(pid.to_string());
                                break;
                            }
                        }
                    }
                }
            }

            let id = page_id.clone().unwrap_or_else(|| {
                format!("acc_{}", accounts.len() + 1)
            });

            accounts.push(YouTubeAccount {
                id,
                name,
                handle,
                avatar_url,
                is_selected,
                page_id,
            });
            return;
        }

        for v in obj.values() {
            find_accounts_in_json(v, accounts);
        }
    } else if let Some(arr) = val.as_array() {
        for v in arr {
            find_accounts_in_json(v, accounts);
        }
    }
}

pub async fn query_innertube_accounts(
    raw_cookie_str: &str,
    sapisid: &str,
) -> Result<Vec<YouTubeAccount>, String> {
    let client = crate::create_http_client(15000);
    let origin = "https://music.youtube.com";
    let (ts, hash) = generate_sapisid_hash(sapisid, origin);
    let auth_header = format!("SAPISIDHASH {}_{}", ts, hash);

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://music.youtube.com"));
    headers.insert("X-Origin", HeaderValue::from_static("https://music.youtube.com"));
    headers.insert(USER_AGENT, HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ));
    if let Ok(v) = HeaderValue::from_str(&auth_header) {
        headers.insert("Authorization", v);
    }
    if let Ok(v) = HeaderValue::from_str(raw_cookie_str) {
        headers.insert(COOKIE, v);
    }

    let body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240101.01.00",
                "hl": "en"
            }
        }
    });

    let resp = client
        .post("https://www.youtube.com/youtubei/v1/account/accounts_list")
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to YouTube account service: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("YouTube account service returned HTTP {}", resp.status()));
    }

    let json_val: Value = resp
        .json()
        .await
        .map_err(|e| format!("Invalid JSON from YouTube account service: {}", e))?;

    let mut accounts = Vec::new();
    find_accounts_in_json(&json_val, &mut accounts);

    if accounts.is_empty() {
        // Fallback default single account if user only has 1 account and no multi-account switcher
        accounts.push(YouTubeAccount {
            id: "default".to_string(),
            name: "YouTube Music Account".to_string(),
            handle: None,
            avatar_url: None,
            is_selected: true,
            page_id: None,
        });
    }

    Ok(accounts)
}

pub async fn save_youtube_cookies_internal(
    app: &AppHandle,
    raw_cookies: String,
) -> Result<YouTubeAuthStatus, String> {
    let pairs = parse_cookie_input(&raw_cookies);
    if pairs.is_empty() {
        return Err("No valid cookies found in input. Please paste the full Cookie request header.".to_string());
    }

    let sapisid = get_sapisid(&pairs);
    if sapisid.is_none() && find_cookie_val(&pairs, "SID").is_none() {
        return Err("Missing required authentication cookies (SAPISID or __Secure-3PAPISID). Please ensure you copied the entire Cookie header from an authenticated YouTube Music session.".to_string());
    }

    let netscape_content = pairs_to_netscape(&pairs);
    let cookie_header = pairs_to_header(&pairs);

    let dir = get_storage_dir(app);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create storage directory: {}", e))?;

    std::fs::write(get_cookies_txt_path(app), netscape_content)
        .map_err(|e| format!("Failed to save cookies.txt: {}", e))?;

    std::fs::write(get_raw_cookies_path(app), &cookie_header)
        .map_err(|e| format!("Failed to save raw cookies: {}", e))?;

    // Try fetching accounts
    let accounts = if let Some(sid) = sapisid {
        match query_innertube_accounts(&cookie_header, sid).await {
            Ok(accs) => accs,
            Err(_) => vec![YouTubeAccount {
                id: "default".to_string(),
                name: "YouTube Music Account".to_string(),
                handle: None,
                avatar_url: None,
                is_selected: true,
                page_id: None,
            }],
        }
    } else {
        vec![YouTubeAccount {
            id: "default".to_string(),
            name: "YouTube Music Account".to_string(),
            handle: None,
            avatar_url: None,
            is_selected: true,
            page_id: None,
        }]
    };

    let active = accounts.iter().find(|a| a.is_selected).cloned().or_else(|| accounts.first().cloned());

    let state = SavedAccountState {
        active_account: active.clone(),
        accounts: accounts.clone(),
    };
    save_account_state(app, &state);

    Ok(YouTubeAuthStatus {
        is_authenticated: true,
        active_account: active,
        accounts,
        cookie_count: pairs.len(),
    })
}

pub async fn select_youtube_account_internal(
    app: &AppHandle,
    account_id: String,
) -> Result<YouTubeAuthStatus, String> {
    let mut state = load_saved_state(app);
    let mut found = false;
    for acc in &mut state.accounts {
        if acc.id == account_id {
            acc.is_selected = true;
            state.active_account = Some(acc.clone());
            found = true;
        } else {
            acc.is_selected = false;
        }
    }

    if !found {
        return Err("Account not found in discovered accounts list.".to_string());
    }

    save_account_state(app, &state);
    Ok(get_youtube_auth_status_internal(app))
}

fn find_playlists_in_json(val: &Value, playlists: &mut Vec<(String, String, Option<String>)>) {
    if let Some(obj) = val.as_object() {
        if let Some(renderer) = obj.get("musicTwoRowItemRenderer") {
            let title = renderer
                .get("title")
                .and_then(extract_text_from_runs_or_simple)
                .unwrap_or_else(|| "YouTube Playlist".to_string());

            let mut browse_id = None;
            if let Some(nav) = renderer.get("navigationEndpoint") {
                if let Some(browse_end) = nav.get("browseEndpoint") {
                    if let Some(bid) = browse_end.get("browseId").and_then(|b| b.as_str()) {
                        browse_id = Some(bid.to_string());
                    }
                }
            }

            let thumbnail = renderer
                .get("thumbnailRenderer")
                .and_then(|tr| tr.get("musicThumbnailRenderer"))
                .and_then(|mtr| mtr.get("thumbnail"))
                .and_then(|th| th.get("thumbnails"))
                .and_then(|arr| arr.as_array())
                .and_then(|arr| arr.last())
                .and_then(|t| t.get("url"))
                .and_then(|u| u.as_str())
                .map(|s| s.to_string());

            if let Some(bid) = browse_id {
                let playlist_id = if let Some(stripped) = bid.strip_prefix("VL") {
                    stripped.to_string()
                } else {
                    bid
                };
                if !playlist_id.is_empty() && playlist_id != "LM" && playlist_id != "LL" {
                    playlists.push((playlist_id, title, thumbnail));
                }
            }
            return;
        }

        for v in obj.values() {
            find_playlists_in_json(v, playlists);
        }
    } else if let Some(arr) = val.as_array() {
        for v in arr {
            find_playlists_in_json(v, playlists);
        }
    }
}

async fn query_innertube_playlists(
    raw_cookie_str: &str,
    sapisid: &str,
    page_id: Option<&str>,
) -> Vec<(String, String, Option<String>)> {
    let client = crate::create_http_client(20000);
    let origin = "https://music.youtube.com";
    let (ts, hash) = generate_sapisid_hash(sapisid, origin);
    let auth_header = format!("SAPISIDHASH {}_{}", ts, hash);

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://music.youtube.com"));
    headers.insert("X-Origin", HeaderValue::from_static("https://music.youtube.com"));
    headers.insert(USER_AGENT, HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ));
    if let Ok(v) = HeaderValue::from_str(&auth_header) {
        headers.insert("Authorization", v);
    }
    if let Ok(v) = HeaderValue::from_str(raw_cookie_str) {
        headers.insert(COOKIE, v);
    }
    if let Some(pid) = page_id {
        if let Ok(v) = HeaderValue::from_str(pid) {
            headers.insert("X-Goog-PageId", v);
        }
    }

    let mut playlists = Vec::new();

    // Try FEmusic_liked_playlists first
    let body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240101.01.00",
                "hl": "en"
            }
        },
        "browseId": "FEmusic_liked_playlists"
    });

    if let Ok(resp) = client
        .post("https://music.youtube.com/youtubei/v1/browse")
        .headers(headers.clone())
        .json(&body)
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(json_val) = resp.json::<Value>().await {
                find_playlists_in_json(&json_val, &mut playlists);
            }
        }
    }

    // Also check FEmusic_library_landing if needed
    if playlists.is_empty() {
        let body_lib = serde_json::json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": "1.20240101.01.00",
                    "hl": "en"
                }
            },
            "browseId": "FEmusic_library_landing"
        });

        if let Ok(resp) = client
            .post("https://music.youtube.com/youtubei/v1/browse")
            .headers(headers)
            .json(&body_lib)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(json_val) = resp.json::<Value>().await {
                    find_playlists_in_json(&json_val, &mut playlists);
                }
            }
        }
    }

    playlists
}

async fn fetch_liked_songs_innertube(
    raw_cookie_str: &str,
    sapisid: &str,
    page_id: Option<&str>,
) -> Vec<SyncedTrack> {
    let client = crate::create_http_client(30000);
    let origin = "https://music.youtube.com";
    let (ts, hash) = generate_sapisid_hash(sapisid, origin);
    let auth_header = format!("SAPISIDHASH {}_{}", ts, hash);

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ORIGIN, HeaderValue::from_static("https://music.youtube.com"));
    headers.insert("X-Origin", HeaderValue::from_static("https://music.youtube.com"));
    headers.insert(USER_AGENT, HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ));
    if let Ok(v) = HeaderValue::from_str(&auth_header) {
        headers.insert("Authorization", v);
    }
    if let Ok(v) = HeaderValue::from_str(raw_cookie_str) {
        headers.insert(COOKIE, v);
    }
    if let Some(pid) = page_id {
        if let Ok(v) = HeaderValue::from_str(pid) {
            headers.insert("X-Goog-PageId", v);
        }
    }

    let mut all_tracks: Vec<SyncedTrack> = Vec::new();
    let mut continuation_token: Option<String> = None;

    // 1. Try browseId FEmusic_liked_songs
    let base_body = serde_json::json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240101.01.00",
                "hl": "en"
            }
        },
        "browseId": "FEmusic_liked_songs"
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/browse?alt=json")
        .headers(headers.clone())
        .json(&base_body)
        .send()
        .await;

    if let Ok(r) = resp {
        if r.status().is_success() {
            if let Ok(json_val) = r.json::<Value>().await {
                extract_liked_songs_from_json(&json_val, &mut all_tracks, &mut continuation_token);
            }
        }
    }

    // 2. If FEmusic_liked_songs returned nothing, try VLLM (YouTube Music playlist browseId for Liked Music)
    if all_tracks.is_empty() {
        let vllm_body = serde_json::json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": "1.20240101.01.00",
                    "hl": "en"
                }
            },
            "browseId": "VLLM"
        });

        if let Ok(resp) = client
            .post("https://music.youtube.com/youtubei/v1/browse?alt=json")
            .headers(headers.clone())
            .json(&vllm_body)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(json_val) = resp.json::<Value>().await {
                    extract_liked_songs_from_json(&json_val, &mut all_tracks, &mut continuation_token);
                }
            }
        }
    }

    // 3. Paginate continuations to fetch ALL songs (e.g. 500+ songs, up to 10,000)
    let mut page_count = 0;
    let mut seen_tokens: std::collections::HashSet<String> = std::collections::HashSet::new();
    while let Some(token) = continuation_token.take() {
        if is_sync_cancelled() {
            break;
        }
        if !seen_tokens.insert(token.clone()) {
            break;
        }
        page_count += 1;
        if page_count > 100 { break; } // Safety cap: 100 pages

        let cont_body = serde_json::json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": "1.20240101.01.00",
                    "hl": "en"
                }
            },
            "continuation": token
        });

        // Standard InnerTube continuation request: POST to browse endpoint with continuation payload
        let cont_url = "https://music.youtube.com/youtubei/v1/browse?alt=json";

        let mut resp = client
            .post(cont_url)
            .headers(headers.clone())
            .json(&cont_body)
            .send()
            .await;

        // Fallback: If clean browse fails, try with ctoken and continuation query params
        if resp.as_ref().map(|r| !r.status().is_success()).unwrap_or(true) {
            let encoded_token = urlencoding::encode(&token);
            let fallback_url = format!(
                "https://music.youtube.com/youtubei/v1/browse?ctoken={}&continuation={}&type=next&alt=json",
                encoded_token, encoded_token
            );
            resp = client
                .post(&fallback_url)
                .headers(headers.clone())
                .json(&cont_body)
                .send()
                .await;
        }

        match resp {
            Ok(r) if r.status().is_success() => {
                if let Ok(json_val) = r.json::<Value>().await {
                    let prev_len = all_tracks.len();
                    extract_liked_songs_from_json(&json_val, &mut all_tracks, &mut continuation_token);
                    if all_tracks.len() == prev_len && continuation_token.is_none() {
                        break;
                    }
                } else {
                    break;
                }
            }
            _ => break,
        }
    }

    // Preserve ALL items returned by YouTube Music without artificial deduplication
    all_tracks
}

fn is_valid_youtube_video_id(s: &str) -> bool {
    let len = s.len();
    (8..=16).contains(&len) && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn extract_video_id_from_url_str(s: &str) -> Option<String> {
    if let Some(pos) = s.find("/vi/") {
        let remainder = &s[pos + 4..];
        let id: String = remainder.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
        if is_valid_youtube_video_id(&id) {
            return Some(id);
        }
    }
    if let Some(pos) = s.find("v=") {
        let remainder = &s[pos + 2..];
        let id: String = remainder.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
        if is_valid_youtube_video_id(&id) {
            return Some(id);
        }
    }
    if let Some(pos) = s.find("youtu.be/") {
        let remainder = &s[pos + 9..];
        let id: String = remainder.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
        if is_valid_youtube_video_id(&id) {
            return Some(id);
        }
    }
    None
}

fn find_first_valid_video_id(val: &Value) -> Option<String> {
    if let Some(obj) = val.as_object() {
        if let Some(vid) = obj.get("videoId").and_then(|v| v.as_str()) {
            if is_valid_youtube_video_id(vid) {
                return Some(vid.to_string());
            }
        }
        if let Some(url_str) = obj.get("url").and_then(|u| u.as_str()) {
            if let Some(vid) = extract_video_id_from_url_str(url_str) {
                return Some(vid);
            }
        }
        for v in obj.values() {
            if let Some(vid) = find_first_valid_video_id(v) {
                return Some(vid);
            }
        }
    } else if let Some(arr) = val.as_array() {
        for v in arr {
            if let Some(vid) = find_first_valid_video_id(v) {
                return Some(vid);
            }
        }
    }
    None
}

fn find_continuation_token(val: &Value) -> Option<String> {
    if let Some(obj) = val.as_object() {
        // 1. continuationCommand -> token
        if let Some(cmd) = obj.get("continuationCommand") {
            if let Some(token) = cmd.get("token").and_then(|t| t.as_str()) {
                if !token.is_empty() {
                    return Some(token.to_string());
                }
            }
        }

        // 2. continuationItemRenderer -> continuationEndpoint -> continuationCommand -> token
        if let Some(cir) = obj.get("continuationItemRenderer") {
            if let Some(token) = cir
                .pointer("/continuationEndpoint/continuationCommand/token")
                .and_then(|t| t.as_str())
            {
                if !token.is_empty() {
                    return Some(token.to_string());
                }
            }
        }

        // 3. nextContinuationData -> continuation
        if let Some(ncd) = obj.get("nextContinuationData") {
            if let Some(token) = ncd.get("continuation").and_then(|c| c.as_str()) {
                if !token.is_empty() {
                    return Some(token.to_string());
                }
            }
        }

        // 4. reloadContinuationData -> continuation
        if let Some(rcd) = obj.get("reloadContinuationData") {
            if let Some(token) = rcd.get("continuation").and_then(|c| c.as_str()) {
                if !token.is_empty() {
                    return Some(token.to_string());
                }
            }
        }

        // 5. General token in continuationEndpoint
        if let Some(token) = val.pointer("/continuationEndpoint/continuationCommand/token").and_then(|t| t.as_str()) {
            if !token.is_empty() {
                return Some(token.to_string());
            }
        }

        // Recurse into object values
        for v in obj.values() {
            if let Some(t) = find_continuation_token(v) {
                return Some(t);
            }
        }
    } else if let Some(arr) = val.as_array() {
        // Iterate in reverse because continuation items are typically at the end of lists
        for v in arr.iter().rev() {
            if let Some(t) = find_continuation_token(v) {
                return Some(t);
            }
        }
    }
    None
}

fn extract_liked_songs_from_json(
    val: &Value,
    tracks: &mut Vec<SyncedTrack>,
    continuation: &mut Option<String>,
) {
    if let Some(token) = find_continuation_token(val) {
        *continuation = Some(token);
    }
    find_responsive_items_in_json(val, tracks);
}

fn find_responsive_items_in_json(val: &Value, tracks: &mut Vec<SyncedTrack>) {
    if let Some(obj) = val.as_object() {
        // 1. YouTube Music Responsive List Item Renderer
        if let Some(item) = obj.get("musicResponsiveListItemRenderer") {
            let video_id = item
                .pointer("/playlistItemData/videoId")
                .or_else(|| item.pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId"))
                .or_else(|| item.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/navigationEndpoint/watchEndpoint/videoId"))
                .or_else(|| item.pointer("/navigationEndpoint/watchEndpoint/videoId"))
                .or_else(|| item.pointer("/menu/menuRenderer/topLevelButtons/0/likeButtonRenderer/target/videoId"))
                .and_then(|v| v.as_str())
                .filter(|s| is_valid_youtube_video_id(s))
                .map(|s| s.to_string())
                .or_else(|| find_first_valid_video_id(item));

            let Some(vid_id) = video_id else {
                for v in obj.values() {
                    find_responsive_items_in_json(v, tracks);
                }
                return;
            };

            // Title from first flex column
            let title = item
                .pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs")
                .and_then(|r| r.as_array())
                .map(|runs| {
                    runs.iter()
                        .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                        .collect::<Vec<_>>()
                        .join("")
                })
                .filter(|s| !s.trim().is_empty())
                .or_else(|| {
                    item.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| "Untitled Track".to_string());

            // Artist from second flex column (join artist runs before any bullet separator)
            let artist = item
                .pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs")
                .and_then(|r| r.as_array())
                .map(|runs| {
                    let mut parts = Vec::new();
                    for r in runs {
                        if let Some(t) = r.get("text").and_then(|t| t.as_str()) {
                            if t.contains('•') || t.contains("views") || t.contains("plays") {
                                break;
                            }
                            parts.push(t);
                        }
                    }
                    parts.join("").trim().to_string()
                })
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| {
                    item.pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown Artist")
                        .to_string()
                });

            // Duration from fixed columns
            let duration = item
                .pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/text/runs/0/text")
                .or_else(|| item.pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/text/simpleText"))
                .and_then(|v| v.as_str())
                .unwrap_or("0:00")
                .to_string();

            let thumbnail = item
                .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
                .and_then(|t| t.as_array())
                .and_then(|arr| arr.last())
                .and_then(|t| t.get("url"))
                .and_then(|u| u.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", vid_id));

            // Extract album if present in column 2 or after bullet in column 1
            let album = item
                .pointer("/flexColumns/2/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| {
                    item.pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs")
                        .and_then(|r| r.as_array())
                        .and_then(|runs| {
                            let mut found_bullet = false;
                            for r in runs {
                                if let Some(t) = r.get("text").and_then(|t| t.as_str()) {
                                    if found_bullet {
                                        let trimmed = t.trim();
                                        if !trimmed.is_empty() && !trimmed.contains("views") && !trimmed.contains("plays") && !trimmed.contains(':') {
                                            return Some(trimmed.to_string());
                                        }
                                    }
                                    if t.contains('•') {
                                        found_bullet = true;
                                    }
                                }
                            }
                            None
                        })
                });

            let track_idx = tracks.len();
            tracks.push(SyncedTrack {
                id: generate_track_id(&format!("{}_{}", vid_id, track_idx)),
                title,
                artist,
                duration,
                url: format!("https://www.youtube.com/watch?v={}", vid_id),
                cover: thumbnail,
                album,
            });
            return;
        }

        // 2. Playlist Video Renderer (YouTube video in playlist)
        if let Some(item) = obj.get("playlistVideoRenderer") {
            let video_id = item.get("videoId").and_then(|v| v.as_str())
                .filter(|s| is_valid_youtube_video_id(s))
                .map(|s| s.to_string())
                .or_else(|| find_first_valid_video_id(item));
            if let Some(vid_id) = video_id {
                let title = item.pointer("/title/runs/0/text")
                    .or_else(|| item.pointer("/title/simpleText"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Untitled Track")
                    .to_string();
                let artist = item.pointer("/shortBylineText/runs/0/text")
                    .or_else(|| item.pointer("/shortBylineText/simpleText"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Artist")
                    .to_string();
                let duration = item.pointer("/lengthText/simpleText")
                    .or_else(|| item.pointer("/lengthText/runs/0/text"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("0:00")
                    .to_string();
                let thumbnail = item.pointer("/thumbnail/thumbnails")
                    .and_then(|t| t.as_array())
                    .and_then(|arr| arr.last())
                    .and_then(|t| t.get("url"))
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", vid_id));

                let track_idx = tracks.len();
                tracks.push(SyncedTrack {
                    id: generate_track_id(&format!("{}_{}", vid_id, track_idx)),
                    title,
                    artist,
                    duration,
                    url: format!("https://www.youtube.com/watch?v={}", vid_id),
                    cover: thumbnail,
                    album: None,
                });
                return;
            }
        }

        // 3. Music Two Row Item Renderer
        if let Some(item) = obj.get("musicTwoRowItemRenderer") {
            if let Some(vid_id) = find_first_valid_video_id(item) {
                let title = item.pointer("/title/runs/0/text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Untitled Track")
                    .to_string();
                let artist = item.pointer("/subtitle/runs/0/text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Artist")
                    .to_string();
                let thumbnail = item.pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
                    .and_then(|t| t.as_array())
                    .and_then(|arr| arr.last())
                    .and_then(|t| t.get("url"))
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", vid_id));

                let track_idx = tracks.len();
                tracks.push(SyncedTrack {
                    id: generate_track_id(&format!("{}_{}", vid_id, track_idx)),
                    title,
                    artist,
                    duration: "0:00".to_string(),
                    url: format!("https://www.youtube.com/watch?v={}", vid_id),
                    cover: thumbnail,
                    album: None,
                });
                return;
            }
        }

        for v in obj.values() {
            find_responsive_items_in_json(v, tracks);
        }
    } else if let Some(arr) = val.as_array() {
        for v in arr {
            find_responsive_items_in_json(v, tracks);
        }
    }
}

async fn fetch_tracks_from_playlist_url(
    url: &str,
    cookies_path: &Path,
) -> Result<Vec<SyncedTrack>, String> {
    let mut cmd = tokio::process::Command::new(crate::bin_ytdlp());
    cmd.kill_on_drop(true);
    cmd.args([
        "--flat-playlist",
        "--yes-playlist",
        "--no-warnings",
        "--ignore-errors",
        "--geo-bypass",
        "--socket-timeout", "20",
        "--no-config",
        "--cookies", cookies_path.to_str().unwrap_or(""),
        "--print", "%(id)s====%(title)s====%(duration_string|0:00)s====%(artist,uploader,channel,creator,uploader_id|Unknown)s====%(playlist,playlist_title|YouTube Playlist)s",
        "--",
        url,
    ]);
    if let Some(proxy_str) = crate::get_proxy_url() {
        cmd.args(["--proxy", &proxy_str]);
    }
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    let output = match tokio::time::timeout(std::time::Duration::from_secs(120), cmd.output()).await {
        Ok(res) => res.map_err(|e| format!("yt-dlp execution error: {}", e))?,
        Err(_) => return Err("yt-dlp playlist fetch timed out".to_string()),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut tracks = Vec::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split("====").collect();
        if parts.len() >= 4 {
            let vid_id = parts[0].trim();
            if vid_id.is_empty() || vid_id == "NA" || vid_id == "null" {
                continue;
            }
            let title = parts[1].trim();
            let duration = parts[2].trim();
            let artist = parts[3].trim();

            let track_idx = tracks.len();
            let track_id = generate_track_id(&format!("{}_{}", vid_id, track_idx));
            tracks.push(SyncedTrack {
                id: track_id,
                title: if title.is_empty() { "Untitled Track".to_string() } else { title.to_string() },
                artist: if artist.is_empty() { "Unknown Artist".to_string() } else { artist.to_string() },
                duration: if duration.is_empty() || duration == "NA" { "0:00".to_string() } else { duration.to_string() },
                url: format!("https://www.youtube.com/watch?v={}", vid_id),
                cover: format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", vid_id),
                album: None,
            });
        }
    }

    Ok(tracks)
}

pub async fn sync_youtube_library_internal(
    app: &AppHandle,
    page_id: Option<String>,
) -> Result<SyncResult, String> {
    SYNC_CANCELLED.store(false, Ordering::SeqCst);

    let cookies_path = get_cookies_txt_path(app);
    if !cookies_path.is_file() {
        return Err("No YouTube cookies found. Please paste your cookies first.".to_string());
    }

    let raw_cookies = std::fs::read_to_string(get_raw_cookies_path(app))
        .map_err(|_| "Raw cookies not found.".to_string())?;
    let pairs = parse_cookie_input(&raw_cookies);
    let sapisid = get_sapisid(&pairs);

    let _ = app.emit("youtube_sync_progress", SyncProgressPayload {
        stage: "fetching_liked_songs".to_string(),
        progress: 10.0,
        message: "Fetching your Liked Music from YouTube Music...".to_string(),
        current_item: Some("Liked Music".to_string()),
        total_items: 0,
        processed_items: 0,
    });

    // 1. Fetch Liked Music via InnerTube YouTube Music API (YouTube Music ONLY, never import non-music YouTube liked videos)
    let mut liked_songs = Vec::new();
    if let Some(sid) = sapisid {
        liked_songs = fetch_liked_songs_innertube(&raw_cookies, sid, page_id.as_deref()).await;
    }

    if is_sync_cancelled() {
        return Err("Sync cancelled by user".to_string());
    }

    // 1b. Also query YouTube Music Liked Music (LM) via yt-dlp to guarantee 100% complete parity
    if let Ok(ytdlp_liked) = fetch_tracks_from_playlist_url("https://www.youtube.com/playlist?list=LM", &cookies_path).await {
        if is_sync_cancelled() {
            return Err("Sync cancelled by user".to_string());
        }
        if ytdlp_liked.len() > liked_songs.len() {
            let mut innertube_map = std::collections::HashMap::new();
            for t in &liked_songs {
                innertube_map.insert(t.url.clone(), t.clone());
            }
            liked_songs = ytdlp_liked.into_iter().enumerate().map(|(idx, mut yt_track)| {
                if let Some(it_track) = innertube_map.get(&yt_track.url) {
                    if yt_track.artist == "Unknown" || yt_track.artist == "Unknown Artist" {
                        yt_track.artist = it_track.artist.clone();
                    }
                    if yt_track.album.is_none() {
                        yt_track.album = it_track.album.clone();
                    }
                    if yt_track.cover.is_empty() || yt_track.cover.contains("null") {
                        yt_track.cover = it_track.cover.clone();
                    }
                }
                yt_track.id = generate_track_id(&format!("{}_{}", yt_track.url, idx));
                yt_track
            }).collect();
        } else if !ytdlp_liked.is_empty() {
            let mut existing_urls: std::collections::HashSet<String> = liked_songs.iter().map(|t| t.url.clone()).collect();
            for yt_track in ytdlp_liked {
                if !existing_urls.contains(&yt_track.url) {
                    existing_urls.insert(yt_track.url.clone());
                    let idx = liked_songs.len();
                    let mut t = yt_track;
                    t.id = generate_track_id(&format!("{}_{}", t.url, idx));
                    liked_songs.push(t);
                }
            }
        }
    }

    if is_sync_cancelled() {
        return Err("Sync cancelled by user".to_string());
    }

    let _ = app.emit("youtube_sync_progress", SyncProgressPayload {
        stage: "fetching_playlists".to_string(),
        progress: 35.0,
        message: format!("Retrieved {} Liked Music tracks. Discovering your playlists...", liked_songs.len()),
        current_item: None,
        total_items: 0,
        processed_items: 0,
    });

    // 2. Discover user playlists
    let mut discovered_playlists = Vec::new();
    if let Some(sid2) = get_sapisid(&pairs) {
        discovered_playlists = query_innertube_playlists(&raw_cookies, sid2, page_id.as_deref()).await;
    }

    if is_sync_cancelled() {
        return Err("Sync cancelled by user".to_string());
    }

    let total_playlists = discovered_playlists.len();
    let mut synced_playlists: Vec<SyncedPlaylist> = Vec::new();

    // 2a. Add liked music as a separate "Liked Music" playlist
    if !liked_songs.is_empty() {
        synced_playlists.push(SyncedPlaylist {
            id: "yt_liked".to_string(),
            name: "Liked Music".to_string(),
            description: "Liked music imported from YouTube Music".to_string(),
            tracks: liked_songs.clone(),
            custom_cover: None,
        });
    }

    // 2b. Import regular user playlists
    for (idx, (pl_id, pl_name, pl_cover)) in discovered_playlists.into_iter().enumerate() {
        if is_sync_cancelled() {
            return Err("Sync cancelled by user".to_string());
        }
        let pct = 40.0 + ((idx as f64) / (total_playlists.max(1) as f64)) * 55.0;
        let _ = app.emit("youtube_sync_progress", SyncProgressPayload {
            stage: "importing_tracks".to_string(),
            progress: pct,
            message: format!("Importing playlist {} of {}: {}", idx + 1, total_playlists, pl_name),
            current_item: Some(pl_name.clone()),
            total_items: total_playlists,
            processed_items: idx + 1,
        });

        let pl_url = format!("https://music.youtube.com/playlist?list={}", pl_id);
        if let Ok(tracks) = fetch_tracks_from_playlist_url(&pl_url, &cookies_path).await {
            synced_playlists.push(SyncedPlaylist {
                id: format!("yt_{}", pl_id),
                name: pl_name,
                description: "Imported from YouTube Music".to_string(),
                tracks,
                custom_cover: pl_cover,
            });
        }
    }

    let _ = app.emit("youtube_sync_progress", SyncProgressPayload {
        stage: "completed".to_string(),
        progress: 100.0,
        message: format!(
            "Import complete! {} liked songs and {} playlists imported.",
            liked_songs.len(),
            synced_playlists.len().saturating_sub(if liked_songs.is_empty() { 0 } else { 1 })
        ),
        current_item: None,
        total_items: total_playlists,
        processed_items: total_playlists,
    });

    Ok(SyncResult {
        liked_songs_count: liked_songs.len(),
        playlists: synced_playlists,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cookie_header() {
        let header = "Cookie: SID=sid_123; __Secure-3PAPISID=3pap_456; SAPISID=sap_789; test=1";
        let pairs = parse_cookie_input(header);
        assert_eq!(pairs.len(), 4);
        assert_eq!(find_cookie_val(&pairs, "SID"), Some("sid_123"));
        assert_eq!(get_sapisid(&pairs), Some("sap_789"));
    }

    #[test]
    fn test_parse_netscape_cookies() {
        let netscape = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2147483647\tSAPISID\tsecret123\n";
        let pairs = parse_cookie_input(netscape);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, "SAPISID");
        assert_eq!(pairs[0].1, "secret123");
    }

    #[test]
    fn test_generate_sapisid_hash() {
        let (ts, hash) = generate_sapisid_hash("test_sapisid", "https://music.youtube.com");
        assert!(ts > 0);
        assert_eq!(hash.len(), 40);
    }

    #[test]
    fn test_find_continuation_token() {
        // Page 1 style (nextContinuationData)
        let page1_json = serde_json::json!({
            "contents": {
                "musicPlaylistShelfRenderer": {
                    "continuations": [
                        {
                            "nextContinuationData": {
                                "continuation": "token_page_1_abc"
                            }
                        }
                    ]
                }
            }
        });
        assert_eq!(find_continuation_token(&page1_json), Some("token_page_1_abc".to_string()));

        // Page 2+ style (continuationItemRenderer -> continuationEndpoint -> continuationCommand -> token)
        let page2_json = serde_json::json!({
            "onResponseReceivedActions": [
                {
                    "appendContinuationItemsAction": {
                        "continuationItems": [
                            {
                                "musicResponsiveListItemRenderer": {
                                    "playlistItemData": { "videoId": "vid123" }
                                }
                            },
                            {
                                "continuationItemRenderer": {
                                    "trigger": "CONTINUATION_TRIGGER_ON_ITEM_SHOWN",
                                    "continuationEndpoint": {
                                        "continuationCommand": {
                                            "token": "token_page_2_xyz",
                                            "request": "CONTINUATION_REQUEST_TYPE_BROWSE"
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            ]
        });
        assert_eq!(find_continuation_token(&page2_json), Some("token_page_2_xyz".to_string()));

        // End of list (no continuation)
        let end_json = serde_json::json!({
            "onResponseReceivedActions": [
                {
                    "appendContinuationItemsAction": {
                        "continuationItems": [
                            {
                                "musicResponsiveListItemRenderer": {
                                    "playlistItemData": { "videoId": "vid456" }
                                }
                            }
                        ]
                    }
                }
            ]
        });
        assert_eq!(find_continuation_token(&end_json), None);
    }

    #[test]
    fn test_find_responsive_items_in_json() {
        let json = serde_json::json!({
            "contents": [
                {
                    "musicResponsiveListItemRenderer": {
                        "playlistItemData": { "videoId": "abc12345" },
                        "flexColumns": [
                            {
                                "musicResponsiveListItemFlexColumnRenderer": {
                                    "text": {
                                        "runs": [
                                            { "text": "Song Title" }
                                        ]
                                    }
                                }
                            },
                            {
                                "musicResponsiveListItemFlexColumnRenderer": {
                                    "text": {
                                        "runs": [
                                            { "text": "Main Artist" },
                                            { "text": " & " },
                                            { "text": "Featured Artist" },
                                            { "text": " • " },
                                            { "text": "Test Album" }
                                        ]
                                    }
                                }
                            }
                        ],
                        "fixedColumns": [
                            {
                                "musicResponsiveListItemFixedColumnRenderer": {
                                    "text": {
                                        "runs": [
                                            { "text": "3:45" }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                }
            ]
        });

        let mut tracks = Vec::new();
        find_responsive_items_in_json(&json, &mut tracks);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "Song Title");
        assert_eq!(tracks[0].artist, "Main Artist & Featured Artist");
        assert_eq!(tracks[0].album, Some("Test Album".to_string()));
        assert_eq!(tracks[0].duration, "3:45");
        assert_eq!(tracks[0].url, "https://www.youtube.com/watch?v=abc12345");
    }

    #[test]
    fn test_multiple_renderers_and_duplicates() {
        let json = serde_json::json!({
            "contents": [
                // 1. Standard musicResponsiveListItemRenderer
                {
                    "musicResponsiveListItemRenderer": {
                        "playlistItemData": { "videoId": "vid00111111" },
                        "flexColumns": [
                            {
                                "musicResponsiveListItemFlexColumnRenderer": {
                                    "text": { "runs": [{ "text": "First Track" }] }
                                }
                            },
                            {
                                "musicResponsiveListItemFlexColumnRenderer": {
                                    "text": { "runs": [{ "text": "Artist A" }] }
                                }
                            }
                        ]
                    }
                },
                // 2. Duplicate song (same video ID, different playlist entry)
                {
                    "musicResponsiveListItemRenderer": {
                        "playlistItemData": { "videoId": "vid00111111" },
                        "flexColumns": [
                            {
                                "musicResponsiveListItemFlexColumnRenderer": {
                                    "text": { "runs": [{ "text": "First Track (Re-release)" }] }
                                }
                            },
                            {
                                "musicResponsiveListItemFlexColumnRenderer": {
                                    "text": { "runs": [{ "text": "Artist A" }] }
                                }
                            }
                        ]
                    }
                },
                // 3. playlistVideoRenderer
                {
                    "playlistVideoRenderer": {
                        "videoId": "vid00222222",
                        "title": { "runs": [{ "text": "Music Video Track" }] },
                        "shortBylineText": { "runs": [{ "text": "Artist B" }] },
                        "lengthText": { "simpleText": "4:12" }
                    }
                },
                // 4. Item where videoId is only in thumbnail URL
                {
                    "musicResponsiveListItemRenderer": {
                        "flexColumns": [
                            {
                                "musicResponsiveListItemFlexColumnRenderer": {
                                    "text": { "runs": [{ "text": "Restricted Track" }] }
                                }
                            },
                            {
                                "musicResponsiveListItemFlexColumnRenderer": {
                                    "text": { "runs": [{ "text": "Artist C" }] }
                                }
                            }
                        ],
                        "thumbnail": {
                            "musicThumbnailRenderer": {
                                "thumbnail": {
                                    "thumbnails": [
                                        { "url": "https://i.ytimg.com/vi/vid00333333/hqdefault.jpg" }
                                    ]
                                }
                            }
                        }
                    }
                }
            ]
        });

        let mut tracks = Vec::new();
        find_responsive_items_in_json(&json, &mut tracks);
        assert_eq!(tracks.len(), 4, "All 4 items including duplicate and playlistVideoRenderer must be extracted");
        assert_eq!(tracks[0].url, "https://www.youtube.com/watch?v=vid00111111");
        assert_eq!(tracks[1].url, "https://www.youtube.com/watch?v=vid00111111");
        assert_eq!(tracks[2].url, "https://www.youtube.com/watch?v=vid00222222");
        assert_eq!(tracks[3].url, "https://www.youtube.com/watch?v=vid00333333");
        // Ensure each has a unique ID
        assert_ne!(tracks[0].id, tracks[1].id);
    }
}
