use std::fs::File;
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Emitter;

#[derive(serde::Serialize, Clone, Debug)]
pub struct DownloadProgressPayload {
    pub url: String,
    pub percent: f64,
    pub status: String,
    pub error: Option<String>,
}

pub async fn download_audio_stream_chunked(
    app: tauri::AppHandle,
    stream_url: String,
    target_path: PathBuf,
    track_url: String,
    title: String,
    artist: String,
    album: String,
    cover_url: Option<String>,
    lyrics_text: Option<String>,
) -> Result<String, String> {
    let client = crate::create_http_client(30000);

    let _ = app.emit(
        "download_progress",
        &DownloadProgressPayload {
            url: track_url.clone(),
            percent: 5.0,
            status: "Connecting to audio stream...".to_string(),
            error: None,
        },
    );

    let parent = target_path.parent().unwrap_or_else(|| Path::new("."));
    let _ = std::fs::create_dir_all(parent);

    // 1. Send Range: bytes=0-1 to probe support & length
    let probe_res = client
        .get(&stream_url)
        .header("Range", "bytes=0-1")
        .send()
        .await;

    let total_size = probe_res
        .as_ref()
        .ok()
        .and_then(|resp| {
            resp.headers()
                .get("content-range")
                .and_then(|h| h.to_str().ok())
                .and_then(|cr| cr.split('/').last())
                .and_then(|s| s.parse::<u64>().ok())
                .or_else(|| resp.content_length())
        });

    let mut chunked_success = false;

    // 2. Try 4-thread parallel chunked range requests if file size > 512KB
    if let Some(total_bytes) = total_size.filter(|&s| s > 512 * 1024) {
        let num_workers = 4u64;
        let chunk_size = total_bytes / num_workers;

        if let Ok(f) = File::create(&target_path) {
            let _ = f.set_len(total_bytes);
            drop(f);

            let downloaded_bytes = Arc::new(AtomicU64::new(0));
            let mut tasks = Vec::new();

            for i in 0..num_workers {
                let start = i * chunk_size;
                let end = if i == num_workers - 1 {
                    total_bytes - 1
                } else {
                    (i + 1) * chunk_size - 1
                };

                let s_url = stream_url.clone();
                let c = client.clone();
                let p = target_path.clone();
                let d_counter = Arc::clone(&downloaded_bytes);
                let app_h = app.clone();
                let t_url = track_url.clone();

                tasks.push(tokio::spawn(async move {
                    let range_header = format!("bytes={}-{}", start, end);
                    let mut res = c
                        .get(&s_url)
                        .header("Range", range_header)
                        .send()
                        .await
                        .map_err(|e| e.to_string())?;

                    if !res.status().is_success() && res.status() != reqwest::StatusCode::PARTIAL_CONTENT {
                        return Err(format!("Chunk HTTP {}", res.status()));
                    }

                    let mut file = File::options()
                        .write(true)
                        .open(&p)
                        .map_err(|e| e.to_string())?;
                    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;

                    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
                        file.write_all(&chunk).map_err(|e| e.to_string())?;
                        let current = d_counter.fetch_add(chunk.len() as u64, Ordering::SeqCst) + chunk.len() as u64;
                        let pct = 5.0 + ((current as f64 / total_bytes as f64) * 85.0).clamp(0.0, 85.0);

                        let _ = app_h.emit(
                            "download_progress",
                            &DownloadProgressPayload {
                                url: t_url.clone(),
                                percent: pct,
                                status: format!("Downloading ({:.0}%)", pct),
                                error: None,
                            },
                        );
                    }
                    Ok::<(), String>(())
                }));
            }

            let mut all_ok = true;
            let mut pending_tasks = tasks;
            while !pending_tasks.is_empty() {
                let task = pending_tasks.remove(0);
                match task.await {
                    Ok(Ok(())) => {},
                    _ => {
                        all_ok = false;
                        for remaining in pending_tasks {
                            remaining.abort();
                        }
                        break;
                    }
                }
            }
            if all_ok {
                chunked_success = true;
            } else {
                let _ = std::fs::remove_file(&target_path);
            }
        }
    }

    // 3. Fallback: Single stream if chunking was unsupported or errored
    if !chunked_success {
        let mut res = client
            .get(&stream_url)
            .send()
            .await
            .map_err(|e| {
                let err_msg = format!("Stream request failed: {}", e);
                let _ = app.emit(
                    "download_progress",
                    &DownloadProgressPayload {
                        url: track_url.clone(),
                        percent: 0.0,
                        status: "Error".to_string(),
                        error: Some(err_msg.clone()),
                    },
                );
                err_msg
            })?;

        let mut file = File::create(&target_path).map_err(|e| format!("Failed to create file: {}", e))?;
        let mut dl_bytes = 0u64;

        while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            dl_bytes += chunk.len() as u64;
            let pct = if let Some(tot) = total_size {
                5.0 + ((dl_bytes as f64 / tot as f64) * 85.0).clamp(0.0, 85.0)
            } else {
                50.0
            };
            let _ = app.emit(
                "download_progress",
                &DownloadProgressPayload {
                    url: track_url.clone(),
                    percent: pct,
                    status: format!("Downloading ({:.0}%)", pct),
                    error: None,
                },
            );
        }
    }

    let _ = app.emit(
        "download_progress",
        &DownloadProgressPayload {
            url: track_url.clone(),
            percent: 92.0,
            status: "Writing ID3 tags & album artwork...".to_string(),
            error: None,
        },
    );

    // 4. Fetch cover art bytes if available
    let mut cover_bytes: Option<Vec<u8>> = None;
    if let Some(ref c_url) = cover_url {
        if c_url.starts_with("http") {
            if let Ok(c_res) = client.get(c_url).send().await {
                if let Ok(bytes) = c_res.bytes().await {
                    cover_bytes = Some(bytes.to_vec());
                }
            }
        }
    }

    // 5. Embed ID3 tags, cover art, and lyrics via lofty
    let _ = crate::metadata::write_track_tags(
        &target_path,
        Some(&title),
        Some(&artist),
        Some(&album),
    );
    let _ = crate::metadata::embed_cover_and_lyrics(
        &target_path,
        cover_bytes.as_deref(),
        lyrics_text.as_deref(),
    );

    let _ = app.emit(
        "download_progress",
        &DownloadProgressPayload {
            url: track_url.clone(),
            percent: 100.0,
            status: "Completed".to_string(),
            error: None,
        },
    );

    Ok(target_path.to_string_lossy().to_string())
}
