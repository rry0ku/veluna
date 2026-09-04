use std::collections::HashMap;
use std::path::PathBuf;

use gpui::{Context, Entity, Task};
use music::{DownloadProgress, Track, download_audio_stream};
use tokio::sync::mpsc;

use crate::{AppSettings, Io, Outcome, Session, Toasts};

#[derive(Clone, Debug)]
pub struct DownloadItem {
    pub url: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover: Option<String>,
    pub percent: f64,
    pub status: String,
    pub error: Option<String>,
    pub destination: Option<PathBuf>,
}

pub struct Downloads {
    active: Vec<DownloadItem>,
    completed: Vec<DownloadItem>,
    _session: Entity<Session>,
    settings: Entity<AppSettings>,
    io: Io,
    _tasks: HashMap<String, Task<()>>,
}

impl Downloads {
    pub fn new(
        session: Entity<Session>,
        settings: Entity<AppSettings>,
        io: Io,
        _cx: &mut Context<Self>,
    ) -> Self {
        Self {
            active: Vec::new(),
            completed: Vec::new(),
            _session: session,
            settings,
            io,
            _tasks: HashMap::new(),
        }
    }

    pub fn active(&self) -> &[DownloadItem] {
        &self.active
    }

    pub fn completed(&self) -> &[DownloadItem] {
        &self.completed
    }

    pub fn is_downloading(&self, track_id: &str) -> bool {
        self.active.iter().any(|item| item.url == track_id)
    }

    pub fn progress(&self, track_id: &str) -> Option<f32> {
        self.active
            .iter()
            .find(|item| item.url == track_id)
            .map(|item| item.percent as f32)
    }

    pub fn is_downloaded(&self, track_id: &str) -> bool {
        self.completed
            .iter()
            .any(|item| item.url == track_id && item.status == "Downloaded")
    }

    pub fn is_downloaded_track(&self, track: &Track, cx: &gpui::App) -> bool {
        let track_id = track.id.as_deref().unwrap_or(&track.name);
        if self.is_downloaded(track_id) {
            return true;
        }
        let download_dir = self
            .settings
            .read(cx)
            .download_dir()
            .unwrap_or_else(|| {
                dirs::audio_dir()
                    .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Music"))
                    .join("Veluna")
            });
        let safe_artist = sanitize_filename(&track.artists);
        let safe_title = sanitize_filename(&track.name);
        for ext in ["m4a", "mp3", "opus", "webm", "flac"] {
            let filename = if safe_artist.is_empty() {
                format!("{safe_title}.{ext}")
            } else {
                format!("{safe_artist} - {safe_title}.{ext}")
            };
            if download_dir.join(&filename).exists() {
                return true;
            }
            if download_dir.join(&safe_artist).join(&filename).exists() {
                return true;
            }
        }
        false
    }

    pub fn download_track(&mut self, track: Track, cx: &mut Context<Self>) {
        let track_id = track.id.clone().unwrap_or_else(|| track.name.clone());
        if self.is_downloading(&track_id) {
            return;
        }

        let download_dir = self
            .settings
            .read(cx)
            .download_dir()
            .unwrap_or_else(|| {
                dirs::audio_dir()
                    .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Music"))
                    .join("Veluna")
            });
        let quality = self.settings.read(cx).download_quality().to_owned();

        let safe_artist = sanitize_filename(&track.artists);
        let safe_title = sanitize_filename(&track.name);
        let ext = "m4a";
        let filename = if safe_artist.is_empty() {
            format!("{safe_title}.{ext}")
        } else {
            format!("{safe_artist} - {safe_title}.{ext}")
        };
        let target_path = download_dir.join(filename);

        let item = DownloadItem {
            url: track_id.clone(),
            title: track.name.clone(),
            artist: track.artists.clone(),
            album: track.album.clone(),
            cover: track.cover.clone(),
            percent: 0.0,
            status: "Starting...".to_owned(),
            error: None,
            destination: Some(target_path.clone()),
        };

        self.active.push(item);
        cx.notify();

        let (progress_tx, mut progress_rx) = mpsc::unbounded_channel::<DownloadProgress>();
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .unwrap_or_default();
        let io = self.io.clone();
        let track_url_key = track_id.clone();
        let title_name = track.name.clone();
        let artist_name = track.artists.clone();
        let album_name = track.album.clone();
        let cover_url = track.cover.clone();
        let music_client = self._session.read(cx).client();

        let track_id_for_task = track_id.clone();
        let track_name = track.name.clone();

        let task = cx.spawn(async move |this, cx| {
            let track_id_for_io = track_id_for_task.clone();
            let dl_task = io.spawn(async move {
                let Some(music_client) = music_client else {
                    anyhow::bail!("No active music session to resolve audio stream");
                };

                let lyrics_opt = match music_client.track_lyrics(&track_id_for_io).await {
                    Ok(Some(music::Lyrics::Plain { text, .. })) => {
                        if text.trim().is_empty() {
                            None
                        } else {
                            Some(text)
                        }
                    }
                    Ok(Some(music::Lyrics::Synced { lines })) => {
                        let joined = lines
                            .iter()
                            .map(|l| l.text.as_str())
                            .collect::<Vec<_>>()
                            .join("\n");
                        if joined.trim().is_empty() {
                            None
                        } else {
                            Some(joined)
                        }
                    }
                    _ => None,
                };

                let stream_url = match music_client
                    .track_stream(&track_id_for_io, &quality)
                    .await
                {
                    Ok(Some(url)) => url,
                    Ok(None) => anyhow::bail!("No audio stream found for track"),
                    Err(err) => anyhow::bail!("Failed to resolve audio stream: {err:#}"),
                };

                download_audio_stream(
                    client,
                    stream_url,
                    target_path,
                    track_url_key,
                    title_name,
                    artist_name,
                    album_name,
                    cover_url,
                    lyrics_opt,
                    Some(progress_tx),
                )
                .await
            });

            // Stream progress into GPUI entity
            while let Some(progress) = progress_rx.recv().await {
                let _ = this.update(cx, |this, cx| {
                    if let Some(item) = this.active.iter_mut().find(|i| i.url == progress.url) {
                        item.percent = progress.percent;
                        item.status = progress.status;
                        item.error = progress.error;
                        cx.notify();
                    }
                });
            }

            let result = dl_task.await;
            this.update(cx, |this, cx| {
                if let Some(pos) = this.active.iter().position(|i| i.url == track_id_for_task) {
                    let mut finished = this.active.remove(pos);
                    match result {
                        Ok(Ok(saved_path)) => {
                            finished.percent = 100.0;
                            finished.status = "Downloaded".to_owned();
                            finished.destination = Some(saved_path);
                            this.completed.push(finished.clone());
                            Toasts::about(
                                Outcome::Done,
                                "toast-download-complete",
                                finished.title.clone(),
                                cx,
                            );
                        }
                        Ok(Err(err)) => {
                            finished.status = "Failed".to_owned();
                            finished.error = Some(err.to_string());
                            this.completed.push(finished);
                            Toasts::about(
                                Outcome::Failed,
                                "toast-download-failed",
                                track_name,
                                cx,
                            );
                        }
                        Err(err) => {
                            finished.status = "Panicked".to_owned();
                            finished.error = Some(err.to_string());
                            this.completed.push(finished);
                        }
                    }
                    cx.notify();
                }
            })
            .ok();
        });

        self._tasks.insert(track_id, task);
    }

    pub fn start_download(
        &mut self,
        track: Track,
        cover_url: Option<String>,
        lyrics: Option<String>,
        stream_url: String,
        cx: &mut Context<Self>,
    ) {
        let track_id = track.id.clone().unwrap_or_else(|| track.name.clone());
        if self.is_downloading(&track_id) {
            return;
        }

        let download_dir = self
            .settings
            .read(cx)
            .download_dir()
            .unwrap_or_else(|| {
                dirs::audio_dir()
                    .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Music"))
                    .join("Veluna")
            });

        let safe_artist = sanitize_filename(&track.artists);
        let safe_title = sanitize_filename(&track.name);
        let ext = "m4a";
        let filename = if safe_artist.is_empty() {
            format!("{safe_title}.{ext}")
        } else {
            format!("{safe_artist} - {safe_title}.{ext}")
        };
        let target_path = download_dir.join(filename);

        let item = DownloadItem {
            url: track_id.clone(),
            title: track.name.clone(),
            artist: track.artists.clone(),
            album: track.album.clone(),
            cover: cover_url.clone(),
            percent: 0.0,
            status: "Starting...".to_owned(),
            error: None,
            destination: Some(target_path.clone()),
        };

        self.active.push(item);
        cx.notify();

        let (progress_tx, mut progress_rx) = mpsc::unbounded_channel::<DownloadProgress>();
        let client = reqwest::Client::new();
        let io = self.io.clone();
        let track_url_key = track_id.clone();
        let title_name = track.name.clone();
        let artist_name = track.artists.clone();
        let album_name = track.album.clone();

        let track_id_for_task = track_id.clone();
        let track_name = track.name.clone();

        let task = cx.spawn(async move |this, cx| {
            let dl_task = io.spawn(async move {
                download_audio_stream(
                    client,
                    stream_url,
                    target_path,
                    track_url_key,
                    title_name,
                    artist_name,
                    album_name,
                    cover_url,
                    lyrics,
                    Some(progress_tx),
                )
                .await
            });

            // Stream progress into GPUI entity
            while let Some(progress) = progress_rx.recv().await {
                let _ = this.update(cx, |this, cx| {
                    if let Some(item) = this.active.iter_mut().find(|i| i.url == progress.url) {
                        item.percent = progress.percent;
                        item.status = progress.status;
                        item.error = progress.error;
                        cx.notify();
                    }
                });
            }

            let result = dl_task.await;
            this.update(cx, |this, cx| {
                if let Some(pos) = this.active.iter().position(|i| i.url == track_id_for_task) {
                    let mut finished = this.active.remove(pos);
                    match result {
                        Ok(Ok(saved_path)) => {
                            finished.percent = 100.0;
                            finished.status = "Downloaded".to_owned();
                            finished.destination = Some(saved_path);
                            this.completed.push(finished.clone());
                            Toasts::about(
                                Outcome::Done,
                                "toast-download-complete",
                                finished.title.clone(),
                                cx,
                            );
                        }
                        Ok(Err(err)) => {
                            finished.status = "Failed".to_owned();
                            finished.error = Some(err.to_string());
                            this.completed.push(finished);
                            Toasts::about(
                                Outcome::Failed,
                                "toast-download-failed",
                                track_name,
                                cx,
                            );
                        }
                        Err(err) => {
                            finished.status = "Panicked".to_owned();
                            finished.error = Some(err.to_string());
                            this.completed.push(finished);
                        }
                    }
                    cx.notify();
                }
            })
            .ok();
        });

        self._tasks.insert(track_id, task);
    }

    pub fn cancel(&mut self, url: &str, cx: &mut Context<Self>) {
        self._tasks.remove(url);
        self.active.retain(|item| item.url != url);
        cx.notify();
    }

    pub fn clear_completed(&mut self, cx: &mut Context<Self>) {
        self.completed.clear();
        cx.notify();
    }
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}
