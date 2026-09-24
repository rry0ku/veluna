#![cfg(target_os = "windows")]

use std::sync::Mutex;
use std::time::Duration;
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition,
    PlatformConfig, SeekDirection,
};
use tauri::{Emitter, Manager};

static WINDOWS_SMTC: std::sync::OnceLock<Mutex<Option<MediaControls>>> = std::sync::OnceLock::new();

fn windows_smtc() -> &'static Mutex<Option<MediaControls>> {
    WINDOWS_SMTC.get_or_init(|| Mutex::new(None))
}

pub fn init_windows_smtc(app: tauri::AppHandle, hwnd: *mut std::ffi::c_void) -> Result<(), String> {
    let config = PlatformConfig {
        dbus_name: "veluna",
        display_name: "Veluna",
        hwnd: Some(hwnd),
    };

    let mut controls = MediaControls::new(config)
        .map_err(|e| format!("Failed to create SMTC controls: {:?}", e))?;

    let app_handle = app.clone();
    controls
        .attach(move |event| {
            handle_smtc_event(&app_handle, event);
        })
        .map_err(|e| format!("Failed to attach SMTC event handler: {:?}", e))?;

    let mut lock = windows_smtc().lock().unwrap();
    *lock = Some(controls);
    println!("[SMTC] Windows System Media Transport Controls initialized successfully.");
    Ok(())
}

fn handle_smtc_event(app: &tauri::AppHandle, event: MediaControlEvent) {
    match event {
        MediaControlEvent::Play => {
            let _ = app.emit("mpris_play", ());
        }
        MediaControlEvent::Pause => {
            let _ = app.emit("mpris_pause", ());
        }
        MediaControlEvent::Toggle => {
            let _ = app.emit("mpris_play_pause", ());
        }
        MediaControlEvent::Next => {
            let _ = app.emit("mpris_next", ());
        }
        MediaControlEvent::Previous => {
            let _ = app.emit("mpris_prev", ());
        }
        MediaControlEvent::Stop => {
            let _ = app.emit("mpris_stop", ());
        }
        MediaControlEvent::Seek(dir) => {
            let offset_secs = match dir {
                SeekDirection::Forward => 5.0,
                SeekDirection::Backward => -5.0,
            };
            let cmd = format!(r#"{{"command": ["seek", {}, "relative"]}}"#, offset_secs);
            let _ = crate::send_ipc_fire_and_forget(&cmd);
            let new_pos = {
                let mut state = crate::current_playback_state().lock().unwrap();
                let dur = state.duration;
                let mut p = state.position + offset_secs;
                if p < 0.0 { p = 0.0; }
                if dur > 0.0 && p > dur { p = dur; }
                state.position = p;
                p
            };
            let _ = app.emit("mpris_seeked", new_pos);
        }
        MediaControlEvent::SeekBy(dir, duration) => {
            let mult = match dir {
                SeekDirection::Forward => 1.0,
                SeekDirection::Backward => -1.0,
            };
            let offset_secs = mult * duration.as_secs_f64();
            let cmd = format!(r#"{{"command": ["seek", {}, "relative"]}}"#, offset_secs);
            let _ = crate::send_ipc_fire_and_forget(&cmd);
            let new_pos = {
                let mut state = crate::current_playback_state().lock().unwrap();
                let dur = state.duration;
                let mut p = state.position + offset_secs;
                if p < 0.0 { p = 0.0; }
                if dur > 0.0 && p > dur { p = dur; }
                state.position = p;
                p
            };
            let _ = app.emit("mpris_seeked", new_pos);
        }
        MediaControlEvent::SetPosition(pos) => {
            let pos_secs = pos.0.as_secs_f64();
            let cmd = format!(r#"{{"command": ["seek", {}, "absolute"]}}"#, pos_secs);
            let _ = crate::send_ipc_fire_and_forget(&cmd);
            {
                let mut state = crate::current_playback_state().lock().unwrap();
                state.position = pos_secs;
            }
            let _ = app.emit("mpris_seeked", pos_secs);
        }
        MediaControlEvent::SetVolume(vol) => {
            let clamped = vol.clamp(0.0, 1.0);
            let pct = (clamped * 100.0).round() as i64;
            let cmd = format!(r#"{{"command": ["set_property", "volume", {}]}}"#, pct);
            let _ = crate::send_ipc_fire_and_forget(&cmd);
            let _ = app.emit("mpris_set_volume", clamped);
        }
        MediaControlEvent::OpenUri(uri) => {
            let _ = app.emit("mpris_open_uri", uri);
        }
        MediaControlEvent::Raise => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        MediaControlEvent::Quit => {
            app.exit(0);
        }
    }
}

pub fn update_windows_smtc(meta: &crate::MprisMetadata) {
    let mut lock = match windows_smtc().lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    let controls = match lock.as_mut() {
        Some(c) => c,
        None => return,
    };

    let title = if meta.title.is_empty() { None } else { Some(meta.title.as_str()) };
    let artist = if meta.artist.is_empty() { None } else { Some(meta.artist.as_str()) };
    let album = if meta.album.is_empty() { None } else { Some(meta.album.as_str()) };

    let normalized_cover: Option<String> = if meta.cover_url.is_empty() {
        None
    } else {
        let raw = meta.cover_url.trim();
        if raw.starts_with("file:///") {
            Some(format!("file://{}", raw.trim_start_matches("file:///")))
        } else if raw.starts_with("file://") {
            Some(raw.to_string())
        } else if raw.starts_with("http://") || raw.starts_with("https://") {
            Some(raw.to_string())
        } else if std::path::Path::new(raw).is_file() {
            Some(format!("file://{}", raw))
        } else {
            None
        }
    };

    let duration = if meta.duration_us > 0 {
        Some(Duration::from_micros(meta.duration_us as u64))
    } else {
        None
    };

    let media_meta = MediaMetadata {
        title,
        artist,
        album,
        cover_url: normalized_cover.as_deref(),
        duration,
    };

    if let Err(e) = controls.set_metadata(media_meta) {
        eprintln!("[SMTC] Failed to set metadata with cover: {:?}. Retrying without cover...", e);
        let fallback_meta = MediaMetadata {
            title,
            artist,
            album,
            cover_url: None,
            duration,
        };
        let _ = controls.set_metadata(fallback_meta);
    }

    let cur_pos = crate::current_playback_state().lock().unwrap_or_else(|p| p.into_inner()).position;
    let progress = Some(MediaPosition(Duration::from_secs_f64(cur_pos.max(0.0))));

    let playback = if meta.is_stopped {
        MediaPlayback::Stopped
    } else if meta.playing {
        MediaPlayback::Playing { progress }
    } else {
        MediaPlayback::Paused { progress }
    };

    if let Err(e) = controls.set_playback(playback) {
        eprintln!("[SMTC] Failed to set playback state: {:?}", e);
    }
}

pub fn shutdown_windows_smtc() {
    let mut lock = match windows_smtc().lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    if let Some(mut controls) = lock.take() {
        let _ = controls.detach();
    }
}
