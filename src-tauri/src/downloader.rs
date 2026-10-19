//! Downloader module for Veluna: downloads songs in user-selected formats/qualities,
//! with unthrottled bounded chunk fetching, ffmpeg transcoding, and lofty metadata/artwork embedding.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use futures_util::StreamExt;
use lofty::config::WriteOptions;
use lofty::file::TaggedFileExt;
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::probe::Probe;
use lofty::tag::{Accessor, Tag, TagExt};
use reqwest::header;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

const CHUNK_SIZE: u64 = 4 * 1024 * 1024; // 4MB bounded range requests to avoid YouTube's 2x realtime throttle

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRequest {
    pub video_id: String,
    pub title: String,
    pub artists: String,
    pub album: Option<String>,
    pub thumbnail: Option<String>,
    pub duration_secs: Option<i64>,
    pub quality: String, // "best_opus", "aac_native", "mp3_320", "mp3_192", "flac", "wav"
    pub output_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub id: String,
    pub video_id: String,
    pub title: String,
    pub artists: String,
    pub quality: String,
    pub status: String, // "downloading", "transcoding", "tagging", "completed", "failed", "cancelled"
    pub percent: f64,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub speed_mbps: f64,
    pub file_path: Option<String>,
    pub error: Option<String>,
}

struct QualityConfig {
    ext: &'static str,
    ffmpeg_args: Option<Vec<&'static str>>,
}

fn get_quality_config(quality: &str) -> QualityConfig {
    match quality {
        "best_opus" => QualityConfig {
            ext: "opus",
            ffmpeg_args: Some(vec!["-c:a", "copy"]),
        },
        "aac_native" => QualityConfig {
            ext: "m4a",
            ffmpeg_args: Some(vec!["-c:a", "copy"]),
        },
        "mp3_320" => QualityConfig {
            ext: "mp3",
            ffmpeg_args: Some(vec!["-vn", "-c:a", "libmp3lame", "-b:a", "320k"]),
        },
        "mp3_192" => QualityConfig {
            ext: "mp3",
            ffmpeg_args: Some(vec!["-vn", "-c:a", "libmp3lame", "-b:a", "192k"]),
        },
        "flac" => QualityConfig {
            ext: "flac",
            ffmpeg_args: Some(vec!["-vn", "-c:a", "flac"]),
        },
        "wav" => QualityConfig {
            ext: "wav",
            ffmpeg_args: Some(vec!["-vn", "-c:a", "pcm_s16le"]),
        },
        _ => QualityConfig {
            ext: "mp3",
            ffmpeg_args: Some(vec!["-vn", "-c:a", "libmp3lame", "-b:a", "320k"]),
        },
    }
}

fn sanitize_filename(name: &str) -> String {
    let clean: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            other => other,
        })
        .collect();
    let trimmed = clean.trim();
    if trimmed.is_empty() {
        "audio".to_string()
    } else {
        trimmed.to_string()
    }
}

pub async fn check_ffmpeg_installed() -> bool {
    tokio::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub async fn is_ffmpeg_available(app: &AppHandle) -> bool {
    if let Ok(cmd) = app.shell().sidecar("veluna-ffmpeg") {
        if let Ok(out) = cmd.args(["-version"]).output().await {
            if out.status.success() {
                return true;
            }
        }
    }
    if let Ok(cmd) = app.shell().sidecar("binaries/veluna-ffmpeg") {
        if let Ok(out) = cmd.args(["-version"]).output().await {
            if out.status.success() {
                return true;
            }
        }
    }
    if let Ok(cmd) = app.shell().sidecar("ffmpeg") {
        if let Ok(out) = cmd.args(["-version"]).output().await {
            if out.status.success() {
                return true;
            }
        }
    }
    check_ffmpeg_installed().await
}

async fn run_ffmpeg_transcode(
    app: &AppHandle,
    input_path: &Path,
    output_path: &Path,
    extra_args: &[&str],
) -> Result<(), String> {
    let mut args: Vec<String> = vec![
        "-y".to_string(),
        "-i".to_string(),
        input_path.to_string_lossy().to_string(),
    ];
    for a in extra_args {
        args.push(a.to_string());
    }
    args.push(output_path.to_string_lossy().to_string());

    if let Ok(cmd) = app.shell().sidecar("veluna-ffmpeg") {
        match cmd.args(&args).output().await {
            Ok(out) if out.status.success() => return Ok(()),
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                tracing::warn!("Sidecar veluna-ffmpeg failed: {stderr}");
            }
            Err(e) => {
                tracing::debug!("Sidecar veluna-ffmpeg could not run: {e}");
            }
        }
    }

    if let Ok(cmd) = app.shell().sidecar("binaries/veluna-ffmpeg") {
        match cmd.args(&args).output().await {
            Ok(out) if out.status.success() => return Ok(()),
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                tracing::warn!("Sidecar binaries/veluna-ffmpeg failed: {stderr}");
            }
            Err(e) => {
                tracing::debug!("Sidecar binaries/veluna-ffmpeg could not run: {e}");
            }
        }
    }

    let mut sys_cmd = tokio::process::Command::new("ffmpeg");
    sys_cmd.args(&args);
    let out = sys_cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;

    if out.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr);
        Err(format!("ffmpeg transcoding failed: {stderr}"))
    }
}

pub struct DownloadManager {
    app: AppHandle,
    active_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
    downloads: Mutex<HashMap<String, DownloadProgress>>,
}

impl DownloadManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            active_flags: Mutex::new(HashMap::new()),
            downloads: Mutex::new(HashMap::new()),
        }
    }

    pub fn default_download_dir(&self) -> PathBuf {
        self.app
            .path()
            .audio_dir()
            .or_else(|_| self.app.path().download_dir())
            .or_else(|_| self.app.path().home_dir().map(|h| h.join("Music")))
            .unwrap_or_else(|_| std::env::temp_dir())
            .join("Veluna")
    }

    pub async fn get_all(&self) -> Vec<DownloadProgress> {
        self.downloads.lock().await.values().cloned().collect()
    }

    pub async fn cancel(&self, id: &str) -> bool {
        let mut flags = self.active_flags.lock().await;
        if let Some(flag) = flags.remove(id) {
            flag.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    pub async fn start(
        self: &Arc<Self>,
        state: Arc<crate::state::AppState>,
        req: DownloadRequest,
    ) -> Result<String, String> {
        let download_id = format!(
            "{}_{}",
            req.video_id,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );

        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.active_flags
            .lock()
            .await
            .insert(download_id.clone(), cancel_flag.clone());

        let initial_progress = DownloadProgress {
            id: download_id.clone(),
            video_id: req.video_id.clone(),
            title: req.title.clone(),
            artists: req.artists.clone(),
            quality: req.quality.clone(),
            status: "downloading".to_string(),
            percent: 0.0,
            bytes_downloaded: 0,
            total_bytes: 0,
            speed_mbps: 0.0,
            file_path: None,
            error: None,
        };

        self.downloads
            .lock()
            .await
            .insert(download_id.clone(), initial_progress.clone());
        let _ = self.app.emit("download_progress", &initial_progress);

        let dm = self.clone();
        let app_handle = self.app.clone();
        let id_for_task = download_id.clone();

        tauri::async_runtime::spawn(async move {
            let res = dm
                .run_download(state, req, &id_for_task, cancel_flag.clone())
                .await;
            dm.active_flags.lock().await.remove(&id_for_task);

            match res {
                Ok(path) => {
                    let mut lock = dm.downloads.lock().await;
                    if let Some(item) = lock.get_mut(&id_for_task) {
                        item.status = "completed".to_string();
                        item.percent = 100.0;
                        item.file_path = Some(path.to_string_lossy().to_string());
                        let _ = app_handle.emit("download_progress", &*item);
                    }
                }
                Err(err) => {
                    let is_cancelled = cancel_flag.load(Ordering::SeqCst);
                    let mut lock = dm.downloads.lock().await;
                    if let Some(item) = lock.get_mut(&id_for_task) {
                        item.status = if is_cancelled {
                            "cancelled".to_string()
                        } else {
                            "failed".to_string()
                        };
                        item.error = Some(err.clone());
                        let _ = app_handle.emit("download_progress", &*item);
                    }
                }
            }
        });

        Ok(download_id)
    }

    async fn run_download(
        &self,
        state: Arc<crate::state::AppState>,
        req: DownloadRequest,
        download_id: &str,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<PathBuf, String> {
        let output_dir = if let Some(ref d) = req.output_dir {
            PathBuf::from(d)
        } else {
            self.default_download_dir()
        };

        tokio::fs::create_dir_all(&output_dir)
            .await
            .map_err(|e| format!("Failed to create download directory: {e}"))?;

        let safe_title = sanitize_filename(&req.title);
        let safe_artists = sanitize_filename(&req.artists);
        let temp_file_path = output_dir.join(format!("{safe_artists} - {safe_title}.veluna.tmp"));

        let res = self
            .run_download_inner(
                state,
                req,
                download_id,
                cancel_flag,
                &output_dir,
                &temp_file_path,
            )
            .await;

        // Guaranteed cleanup of temp file on any outcome
        if temp_file_path.exists() {
            let _ = tokio::fs::remove_file(&temp_file_path).await;
        }

        res
    }

    async fn run_download_inner(
        &self,
        state: Arc<crate::state::AppState>,
        req: DownloadRequest,
        download_id: &str,
        cancel_flag: Arc<AtomicBool>,
        output_dir: &Path,
        temp_file_path: &Path,
    ) -> Result<PathBuf, String> {
        // 1. Resolve stream via AppState orchestrator
        let mut data = state
            .resolve(&req.video_id, false, req.duration_secs.unwrap_or(0))
            .await
            .map_err(|e| format!("Could not resolve audio stream: {e}"))?;

        let title = if req.title.trim().is_empty() {
            data.title.clone().unwrap_or_else(|| "Unknown Track".into())
        } else {
            req.title.clone()
        };

        let artists = if req.artists.trim().is_empty() {
            data.artists
                .clone()
                .unwrap_or_else(|| "Unknown Artist".into())
        } else {
            req.artists.clone()
        };

        let config = get_quality_config(&req.quality);
        let safe_title = sanitize_filename(&title);
        let safe_artists = sanitize_filename(&artists);
        let target_path = output_dir.join(format!("{safe_artists} - {safe_title}.{}", config.ext));

        let ffmpeg_available = is_ffmpeg_available(&self.app).await;
        let is_native_request = req.quality == "best_opus" || req.quality == "aac_native";
        if !ffmpeg_available && !is_native_request {
            return Err(format!(
                "ffmpeg is required for transcoding to {}. Please install ffmpeg or select 'Best Native (Opus)' or 'AAC Native'.",
                config.ext.to_uppercase()
            ));
        }

        // 2. Probe content-range for exact length
        let client = crate::http::client();
        let mut probe_req = client
            .get(&data.stream_url)
            .header(header::RANGE, "bytes=0-0")
            .header(header::ACCEPT_ENCODING, "identity");
        for (k, v) in &data.headers {
            probe_req = probe_req.header(k.as_str(), v.as_str());
        }

        let mut total_bytes = 0u64;
        if let Ok(resp) = probe_req.send().await {
            if let Some(cr) = resp
                .headers()
                .get(header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
            {
                if let Some((_, total_str)) = cr.rsplit_once('/') {
                    total_bytes = total_str.trim().parse().unwrap_or(0);
                }
            } else if let Some(cl) = resp
                .headers()
                .get(header::CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
            {
                total_bytes = cl.parse().unwrap_or(0);
            }
        }

        // 3. Download in bounded chunks (bypasses YouTube 2x realtime throttle)
        let mut file = tokio::fs::File::create(temp_file_path)
            .await
            .map_err(|e| format!("Failed to create temp download file: {e}"))?;

        let mut downloaded_bytes = 0u64;
        let start_time = Instant::now();
        let mut last_emit = Instant::now();

        if total_bytes > 0 {
            while downloaded_bytes < total_bytes {
                if cancel_flag.load(Ordering::SeqCst) {
                    return Err("Download cancelled by user".to_string());
                }

                let end = (downloaded_bytes + CHUNK_SIZE - 1).min(total_bytes - 1);
                let mut chunk_req = client
                    .get(&data.stream_url)
                    .header(header::RANGE, format!("bytes={downloaded_bytes}-{end}"))
                    .header(header::ACCEPT_ENCODING, "identity");
                for (k, v) in &data.headers {
                    chunk_req = chunk_req.header(k.as_str(), v.as_str());
                }

                let mut resp = chunk_req.send().await;
                // If token expired (HTTP 403), re-resolve stream URL once
                if let Ok(ref r) = resp {
                    if r.status() == reqwest::StatusCode::FORBIDDEN {
                        if let Ok(fresh_data) = state
                            .resolve(&req.video_id, false, req.duration_secs.unwrap_or(0))
                            .await
                        {
                            data = fresh_data;
                            let mut retry_req = client
                                .get(&data.stream_url)
                                .header(header::RANGE, format!("bytes={downloaded_bytes}-{end}"))
                                .header(header::ACCEPT_ENCODING, "identity");
                            for (k, v) in &data.headers {
                                retry_req = retry_req.header(k.as_str(), v.as_str());
                            }
                            resp = retry_req.send().await;
                        }
                    }
                }

                let resp = resp.map_err(|e| format!("Stream request failed: {e}"))?;

                if !resp.status().is_success()
                    && resp.status() != reqwest::StatusCode::PARTIAL_CONTENT
                {
                    return Err(format!("Upstream error: HTTP {}", resp.status()));
                }

                let bytes = resp
                    .bytes()
                    .await
                    .map_err(|e| format!("Failed reading stream bytes: {e}"))?;

                file.write_all(&bytes)
                    .await
                    .map_err(|e| format!("Failed writing bytes to file: {e}"))?;

                downloaded_bytes += bytes.len() as u64;

                let elapsed = start_time.elapsed().as_secs_f64();
                let speed_mbps = if elapsed > 0.1 {
                    ((downloaded_bytes as f64 / 1_048_576.0) / elapsed).min(1000.0)
                } else {
                    0.0
                };
                let percent = (downloaded_bytes as f64 / total_bytes as f64) * 100.0;

                if last_emit.elapsed().as_millis() >= 250 || downloaded_bytes >= total_bytes {
                    last_emit = Instant::now();
                    let mut lock = self.downloads.lock().await;
                    if let Some(item) = lock.get_mut(download_id) {
                        item.percent = percent;
                        item.bytes_downloaded = downloaded_bytes;
                        item.total_bytes = total_bytes;
                        item.speed_mbps = speed_mbps;
                        let _ = self.app.emit("download_progress", &*item);
                    }
                }
            }
        } else {
            // Unbounded fallback if content-range is completely absent
            let mut req_stream = client.get(&data.stream_url);
            for (k, v) in &data.headers {
                req_stream = req_stream.header(k.as_str(), v.as_str());
            }
            let resp = req_stream
                .send()
                .await
                .map_err(|e| format!("Stream failed: {e}"))?;
            let mut stream = resp.bytes_stream();

            while let Some(chunk_res) = stream.next().await {
                if cancel_flag.load(Ordering::SeqCst) {
                    return Err("Download cancelled by user".to_string());
                }

                let chunk = chunk_res.map_err(|e| format!("Stream read error: {e}"))?;
                file.write_all(&chunk)
                    .await
                    .map_err(|e| format!("Write error: {e}"))?;
                downloaded_bytes += chunk.len() as u64;

                let elapsed = start_time.elapsed().as_secs_f64();
                let speed_mbps = if elapsed > 0.1 {
                    ((downloaded_bytes as f64 / 1_048_576.0) / elapsed).min(1000.0)
                } else {
                    0.0
                };

                if last_emit.elapsed().as_millis() >= 250 {
                    last_emit = Instant::now();
                    let mut lock = self.downloads.lock().await;
                    if let Some(item) = lock.get_mut(download_id) {
                        item.percent = 50.0;
                        item.bytes_downloaded = downloaded_bytes;
                        item.speed_mbps = speed_mbps;
                        let _ = self.app.emit("download_progress", &*item);
                    }
                }
            }
        }

        file.flush()
            .await
            .map_err(|e| format!("Flush error: {e}"))?;
        drop(file);

        // 4. Transcoding / Remuxing via ffmpeg or direct move
        {
            let mut lock = self.downloads.lock().await;
            if let Some(item) = lock.get_mut(download_id) {
                item.status = "transcoding".to_string();
                item.percent = 92.0;
                let _ = self.app.emit("download_progress", &*item);
            }
        }

        if ffmpeg_available {
            let extra_args = config.ffmpeg_args.unwrap_or_default();
            let res = run_ffmpeg_transcode(&self.app, temp_file_path, &target_path, &extra_args).await;
            let _ = tokio::fs::remove_file(temp_file_path).await;
            res?;
        } else {
            // Native format without ffmpeg: direct rename
            tokio::fs::rename(temp_file_path, &target_path)
                .await
                .map_err(|e| format!("Failed to save audio file: {e}"))?;
        }

        // 5. Metadata and Cover Tagging via lofty
        {
            let mut lock = self.downloads.lock().await;
            if let Some(item) = lock.get_mut(download_id) {
                item.status = "tagging".to_string();
                item.percent = 98.0;
                let _ = self.app.emit("download_progress", &*item);
            }
        }

        let thumb_url = req.thumbnail.as_ref().or(data.thumbnail.as_ref());
        let mut cover_bytes: Option<Vec<u8>> = None;
        if let Some(url) = thumb_url {
            if let Ok(resp) = client.get(url).send().await {
                if let Ok(b) = resp.bytes().await {
                    cover_bytes = Some(b.to_vec());
                }
            }
        }

        let _ = embed_metadata(
            &target_path,
            &title,
            &artists,
            req.album.as_deref(),
            cover_bytes.as_deref(),
        );

        // 6. Ensure downloaded file folder is recognized by local music library
        let folder_str = output_dir.to_string_lossy().to_string();
        crate::local::add_folder(&state.db, folder_str);

        Ok(target_path)
    }
}

/// Embed metadata and optional front cover image into an audio file using lofty.
pub fn embed_metadata(
    file_path: &Path,
    title: &str,
    artists: &str,
    album: Option<&str>,
    cover_bytes: Option<&[u8]>,
) -> anyhow::Result<()> {
    let mut tagged_file = Probe::open(file_path)?.read()?;
    let tag = match tagged_file.primary_tag_mut() {
        Some(t) => t,
        None => {
            if let Some(first) = tagged_file.first_tag_mut() {
                first
            } else {
                let tag_type = tagged_file.primary_tag_type();
                tagged_file.insert_tag(Tag::new(tag_type));
                match tagged_file.primary_tag_mut() {
                    Some(t) => t,
                    None => tagged_file
                        .first_tag_mut()
                        .ok_or_else(|| anyhow::anyhow!("No writable audio tag available"))?,
                }
            }
        }
    };

    tag.set_title(title.to_string());
    tag.set_artist(artists.to_string());
    if let Some(alb) = album {
        tag.set_album(alb.to_string());
    }

    if let Some(bytes) = cover_bytes {
        let pic = Picture::new_unchecked(
            PictureType::CoverFront,
            Some(MimeType::Jpeg),
            None,
            bytes.to_vec(),
        );
        tag.push_picture(pic);
    }

    tag.save_to_path(file_path, WriteOptions::default())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("AC/DC: Back In Black? *rock*"), "AC_DC_ Back In Black_ _rock_");
        assert_eq!(sanitize_filename("  Clean Title  "), "Clean Title");
        assert_eq!(sanitize_filename(""), "audio");
    }

    #[test]
    fn test_quality_configs() {
        assert_eq!(get_quality_config("best_opus").ext, "opus");
        assert_eq!(get_quality_config("aac_native").ext, "m4a");
        assert_eq!(get_quality_config("mp3_320").ext, "mp3");
        assert_eq!(get_quality_config("mp3_192").ext, "mp3");
        assert_eq!(get_quality_config("flac").ext, "flac");
        assert_eq!(get_quality_config("wav").ext, "wav");
    }
}
