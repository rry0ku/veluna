use std::fs::File;
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::{Context as _, Result};
use lofty::config::WriteOptions;
use lofty::file::{AudioFile as _, TaggedFileExt as _};
use lofty::picture::{Picture, PictureType};
use lofty::prelude::{Accessor as _, ItemKey};
use lofty::probe::Probe;
use lofty::tag::Tag;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone, Debug)]
pub struct DownloadProgress {
    pub url: String,
    pub percent: f64,
    pub status: String,
    pub error: Option<String>,
}

pub async fn download_audio_stream(
    client: reqwest::Client,
    stream_url: String,
    target_path: PathBuf,
    track_url: String,
    title: String,
    artist: String,
    album: String,
    cover_url: Option<String>,
    lyrics_text: Option<String>,
    progress: Option<UnboundedSender<DownloadProgress>>,
) -> Result<PathBuf> {
    let notify = |percent: f64, status: &str, error: Option<String>| {
        if let Some(ref sender) = progress {
            let _ = sender.send(DownloadProgress {
                url: track_url.clone(),
                percent,
                status: status.to_owned(),
                error,
            });
        }
    };

    notify(5.0, "Connecting to audio stream...", None);

    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent).context("cannot create target directory")?;
    }

    // 1. Probe stream support & length with Range request
    let probe_res = client
        .get(&stream_url)
        .header("Range", "bytes=0-1")
        .send()
        .await;

    let total_size = probe_res.as_ref().ok().and_then(|resp| {
        resp.headers()
            .get("content-range")
            .and_then(|h| h.to_str().ok())
            .and_then(|cr| cr.split('/').last())
            .and_then(|s| s.parse::<u64>().ok())
            .or_else(|| resp.content_length())
    });

    let mut chunked_success = false;

    // 2. Parallel chunked download for files > 512KB
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
                let sender = progress.clone();
                let t_url = track_url.clone();

                tasks.push(tokio::spawn(async move {
                    let range_header = format!("bytes={}-{}", start, end);
                    let mut res = c
                        .get(&s_url)
                        .header("Range", range_header)
                        .send()
                        .await
                        .map_err(|e| e.to_string())?;

                    if !res.status().is_success()
                        && res.status() != reqwest::StatusCode::PARTIAL_CONTENT
                    {
                        return Err(format!("Chunk HTTP error: {}", res.status()));
                    }

                    let mut file = File::options()
                        .write(true)
                        .open(&p)
                        .map_err(|e| e.to_string())?;
                    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;

                    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
                        file.write_all(&chunk).map_err(|e| e.to_string())?;
                        let current = d_counter.fetch_add(chunk.len() as u64, Ordering::SeqCst)
                            + chunk.len() as u64;
                        let pct =
                            5.0 + ((current as f64 / total_bytes as f64) * 85.0).clamp(0.0, 85.0);

                        if let Some(ref sender) = sender {
                            let _ = sender.send(DownloadProgress {
                                url: t_url.clone(),
                                percent: pct,
                                status: format!("Downloading ({:.0}%)", pct),
                                error: None,
                            });
                        }
                    }
                    Ok::<(), String>(())
                }));
            }

            let mut all_ok = true;
            for task in tasks {
                if let Ok(res) = task.await {
                    if res.is_err() {
                        all_ok = false;
                        break;
                    }
                } else {
                    all_ok = false;
                    break;
                }
            }
            if all_ok {
                chunked_success = true;
            }
        }
    }

    // 3. Sequential streaming fallback
    if !chunked_success {
        let mut res = client
            .get(&stream_url)
            .send()
            .await
            .context("cannot start stream download")?;

        if !res.status().is_success() {
            let status = res.status();
            notify(0.0, "Download failed", Some(format!("HTTP error {status}")));
            anyhow::bail!("download stream returned HTTP {status}");
        }

        let mut file = File::create(&target_path).context("cannot create destination file")?;
        let mut dl_bytes = 0u64;

        while let Some(chunk) = res.chunk().await.context("error reading stream chunk")? {
            file.write_all(&chunk)
                .context("cannot write to destination file")?;
            dl_bytes += chunk.len() as u64;
            let pct = if let Some(tot) = total_size {
                5.0 + ((dl_bytes as f64 / tot as f64) * 85.0).clamp(0.0, 85.0)
            } else {
                50.0
            };
            notify(pct, &format!("Downloading ({:.0}%)", pct), None);
        }
    }

    notify(92.0, "Writing tags & artwork...", None);

    // 4. Fetch cover image if present
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

    // 5. Write metadata tags & artwork with lofty
    embed_metadata(
        &target_path,
        &title,
        &artist,
        &album,
        cover_bytes.as_deref(),
        lyrics_text.as_deref(),
    )
    .ok();

    notify(100.0, "Completed", None);

    Ok(target_path)
}


fn embed_metadata(
    path: &Path,
    title: &str,
    artist: &str,
    album: &str,
    cover: Option<&[u8]>,
    lyrics: Option<&str>,
) -> Result<()> {
    let mut tagged_file = Probe::open(path)
        .context("cannot probe audio file for tags")?
        .read()
        .context("cannot read audio file tags")?;

    if tagged_file.primary_tag().is_none() && tagged_file.first_tag().is_none() {
        let tag_type = tagged_file.primary_tag_type();
        tagged_file.insert_tag(Tag::new(tag_type));
    }

    let tag = if tagged_file.primary_tag_mut().is_some() {
        tagged_file.primary_tag_mut()
    } else {
        tagged_file.first_tag_mut()
    };

    let Some(tag) = tag else {
        anyhow::bail!("audio file cannot hold tags: {}", path.display());
    };

    if !title.is_empty() {
        tag.set_title(title.to_owned());
    }
    if !artist.is_empty() {
        tag.set_artist(artist.to_owned());
    }
    if !album.is_empty() {
        tag.set_album(album.to_owned());
    }
    if let Some(text) = lyrics.filter(|l| !l.is_empty()) {
        tag.insert_text(ItemKey::Lyrics, text.to_owned());
    }

    if let Some(image_data) = cover {
        if let Ok(picture) = Picture::from_reader(&mut std::io::Cursor::new(image_data)) {
            let mut cover_pic = picture;
            cover_pic.set_pic_type(PictureType::CoverFront);
            tag.push_picture(cover_pic);
        }
    }

    tagged_file
        .save_to_path(path, WriteOptions::default())
        .context("cannot save audio file tags")?;

    Ok(())
}

