use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use gpui::{App, AppContext as _, Context, Entity, Global};
use state::{AppSettings, DiscordTimeDisplay, Playback, PlaybackState, Veluna};

const DISCORD_APP_ID: &str = "1517835351044001953";
const GITHUB_REPO_URL: &str = "https://github.com/rry0ku/veluna";

#[derive(Clone, Debug, PartialEq)]
struct ActivityState {
    title: String,
    artist: String,
    album: String,
    cover: Option<String>,
    start_timestamp: Option<i64>,
    end_timestamp: Option<i64>,
    show_cover: bool,
    show_artist: bool,
    time_display: DiscordTimeDisplay,
}

enum DiscordMsg {
    Update(ActivityState),
    Clear,
}

pub struct DiscordRpc {
    playback: Entity<Playback>,
    settings: Entity<AppSettings>,
    tx: Sender<DiscordMsg>,
}

struct DiscordService(#[allow(dead_code)] Entity<DiscordRpc>);

impl Global for DiscordService {}

pub fn attach(cx: &mut App) {
    let Veluna {
        playback,
        settings,
        ..
    } = Veluna::global(cx);

    let playback = playback.clone();
    let settings = settings.clone();

    let entity = cx.new(|cx| DiscordRpc::new(playback, settings, cx));
    cx.set_global(DiscordService(entity));
}

impl DiscordRpc {
    pub fn new(
        playback: Entity<Playback>,
        settings: Entity<AppSettings>,
        cx: &mut Context<Self>,
    ) -> Self {
        let (tx, rx) = mpsc::channel::<DiscordMsg>();

        // Spawn persistent background worker that maintains the Discord IPC socket
        thread::spawn(move || {
            worker_loop(rx);
        });

        cx.observe(&playback, move |this, _, cx| {
            this.update_presence(cx);
        })
        .detach();

        cx.observe(&settings, move |this, _, cx| {
            this.update_presence(cx);
        })
        .detach();

        Self {
            playback,
            settings,
            tx,
        }
    }

    fn update_presence(&self, cx: &mut Context<Self>) {
        let settings_ref = self.settings.read(cx);
        let enabled = settings_ref.discord_rpc_enabled();
        if !enabled {
            let _ = self.tx.send(DiscordMsg::Clear);
            return;
        }

        let show_cover = settings_ref.discord_rpc_show_cover();
        let show_artist = settings_ref.discord_rpc_show_artist();
        let time_display = settings_ref.discord_rpc_time_display();

        let playback = self.playback.read(cx);
        let track = playback.track().cloned();
        let state = playback.state();
        let pos = playback.position();

        let Some(track) = track else {
            let _ = self.tx.send(DiscordMsg::Clear);
            return;
        };

        let is_playing = matches!(state, PlaybackState::Playing);
        if !is_playing {
            let _ = self.tx.send(DiscordMsg::Clear);
            return;
        }

        let title = if track.name.trim().is_empty() {
            "Unknown Title".to_string()
        } else {
            track.name
        };
        let artist = track.artists;
        let album = track.album;
        let cover = track.cover;
        let elapsed_secs = pos.as_secs();
        let duration_secs = track.duration.as_secs();

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let (start_timestamp, end_timestamp) = match time_display {
            DiscordTimeDisplay::Remaining => {
                if duration_secs > 0 {
                    let start = now - elapsed_secs as i64;
                    let end = start + duration_secs as i64;
                    (Some(start), Some(end))
                } else {
                    (Some(now - elapsed_secs as i64), None)
                }
            }
            DiscordTimeDisplay::Elapsed => {
                let start = now - elapsed_secs as i64;
                (Some(start), None)
            }
        };

        let _ = self.tx.send(DiscordMsg::Update(ActivityState {
            title,
            artist,
            album,
            cover,
            start_timestamp,
            end_timestamp,
            show_cover,
            show_artist,
            time_display,
        }));
    }
}

fn worker_loop(rx: Receiver<DiscordMsg>) {
    let mut client: Option<DiscordIpcClient> = None;
    let mut current_state: Option<ActivityState> = None;
    let mut last_published_state: Option<ActivityState> = None;

    loop {
        // Wait for next message or check every 3s to auto-reconnect if Discord was opened
        let received = match rx.recv_timeout(Duration::from_secs(3)) {
            Ok(msg) => Some(msg),
            Err(RecvTimeoutError::Timeout) => None,
            Err(RecvTimeoutError::Disconnected) => break,
        };

        if let Some(msg) = received {
            match msg {
                DiscordMsg::Update(state) => {
                    current_state = Some(state);
                }
                DiscordMsg::Clear => {
                    current_state = None;
                    last_published_state = None;
                    if let Some(ref mut c) = client {
                        let _ = c.clear_activity();
                    }
                }
            }
        }

        if let Some(ref state) = current_state {
            if client.is_none() {
                let mut new_client = DiscordIpcClient::new(DISCORD_APP_ID);
                match new_client.connect() {
                    Ok(_) => {
                        log::info!("Discord RPC: connected to Discord IPC socket");
                        client = Some(new_client);
                        last_published_state = None; // force re-publish on new connection
                    }
                    Err(_) => {
                        // Discord not open yet or socket unreachable, will retry on next tick
                        continue;
                    }
                }
            }

            if let Some(ref mut c) = client {
                let state_changed = match &last_published_state {
                    Some(prev) => {
                        let seek_changed = match (prev.start_timestamp, state.start_timestamp) {
                            (Some(p), Some(c)) => (p - c).abs() > 2,
                            (None, Some(_)) | (Some(_), None) => true,
                            (None, None) => false,
                        };
                        seek_changed
                            || prev.title != state.title
                            || prev.artist != state.artist
                            || prev.album != state.album
                            || prev.cover != state.cover
                            || prev.show_cover != state.show_cover
                            || prev.show_artist != state.show_artist
                            || prev.time_display != state.time_display
                    }
                    None => true,
                };

                if state_changed {
                    let state_text = if state.show_artist {
                        let clean_artist = state.artist.trim();
                        if !clean_artist.is_empty() {
                            if !state.album.trim().is_empty() {
                                Some(format!("by {} • {}", clean_artist, state.album.trim()))
                            } else {
                                Some(format!("by {}", clean_artist))
                            }
                        } else {
                            None
                        }
                    } else {
                        None
                    };

                    let mut act = activity::Activity::new()
                        .details(&state.title)
                        .activity_type(activity::ActivityType::Listening);

                    if let Some(ref st) = state_text {
                        act = act.state(st);
                    }

                    let mut assets = activity::Assets::new()
                        .small_image("icon")
                        .small_text("Veluna");

                    if state.show_cover {
                        if let Some(ref url) = state.cover {
                            let trimmed = url.trim();
                            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                                assets = assets.large_image(trimmed);
                            } else {
                                assets = assets.large_image("logo");
                            }
                        } else {
                            assets = assets.large_image("logo");
                        }
                    } else {
                        assets = assets.large_image("logo");
                    }
                    assets = assets.large_text("Veluna");
                    act = act.assets(assets);

                    if let (Some(start), Some(end)) = (state.start_timestamp, state.end_timestamp) {
                        if end > start {
                            act = act.timestamps(activity::Timestamps::new().start(start).end(end));
                        }
                    } else if let Some(start) = state.start_timestamp {
                        act = act.timestamps(activity::Timestamps::new().start(start));
                    }

                    act = act.buttons(vec![activity::Button::new("Download Veluna", GITHUB_REPO_URL)]);

                    match c.set_activity(act) {
                        Ok(_) => {
                            log::info!("Discord RPC: updated activity for '{}'", state.title);
                            last_published_state = Some(state.clone());
                        }
                        Err(err) => {
                            log::warn!("Discord RPC set_activity error: {err:#}");
                            let _ = c.close();
                            client = None;
                            last_published_state = None;
                        }
                    }
                }
            }
        }
    }

    if let Some(ref mut c) = client {
        let _ = c.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ipc_connect() {
        let mut client = DiscordIpcClient::new(DISCORD_APP_ID);
        match client.connect() {
            Ok(_) => {
                println!("SUCCESS: Connected to Discord IPC!");
                let act = activity::Activity::new()
                    .details("Testing Veluna")
                    .activity_type(activity::ActivityType::Listening);
                let res = client.set_activity(act);
                println!("set_activity result: {:?}", res);
                let _ = client.close();
            }
            Err(e) => {
                println!("NOTICE: Discord IPC connect error: {:?}", e);
            }
        }
    }
}
