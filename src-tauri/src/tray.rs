use std::sync::Mutex;
use tauri::{
    Emitter, Manager, AppHandle,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const TRAY_ID: &str = "veluna-tray";

pub type TrayFlag = Mutex<bool>;

pub fn init() -> TrayFlag {
    Mutex::new(false)
}

fn load_icon() -> Result<tauri::image::Image<'static>, String> {
    decode_png_to_rgba()
}

fn decode_png_to_rgba() -> Result<tauri::image::Image<'static>, String> {
    let png_bytes = include_bytes!("../icons/icon.png");
    let mut decoder = png::Decoder::new(std::io::Cursor::new(png_bytes as &[u8]));
    
    decoder.set_transformations(
        png::Transformations::EXPAND | png::Transformations::ALPHA
    );
    let mut reader = decoder.read_info().map_err(|e| format!("read_info: {e}"))?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).map_err(|e| format!("decode: {e}"))?;
    let (w, h) = (info.width, info.height);
    let raw = buf[..info.buffer_size()].to_vec();

    let expected_rgba = (w * h * 4) as usize;

    if raw.len() == expected_rgba {
        return Ok(tauri::image::Image::new_owned(raw, w, h));
    }

    let expected_rgb = (w * h * 3) as usize;
    if raw.len() == expected_rgb {
        let mut rgba = Vec::with_capacity(expected_rgba);
        for chunk in raw.chunks_exact(3) {
            rgba.extend_from_slice(chunk);
            rgba.push(0xFF);
        }
        return Ok(tauri::image::Image::new_owned(rgba, w, h));
    }

    Err(format!(
        "Unexpected buffer size {} for {}x{} (expected {} RGBA or {} RGB)",
        raw.len(), w, h, expected_rgba, expected_rgb
    ))
}

fn build_tray(app: &AppHandle) -> Result<(), String> {
    let play_pause_i = MenuItem::with_id(app, "play_pause", "Play / Pause", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let next_i = MenuItem::with_id(app, "next", "Next Track", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let prev_i = MenuItem::with_id(app, "prev", "Previous Track", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let sep1 = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let show_i = MenuItem::with_id(app, "show", "Show / Hide Veluna", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let sep2 = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit Veluna", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let menu = Menu::with_items(app, &[&play_pause_i, &next_i, &prev_i, &sep1, &show_i, &sep2, &quit_i])
        .map_err(|e| e.to_string())?;

    let icon = load_icon()?;

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        TrayIconBuilder::with_id(TRAY_ID)
            .icon(icon)
            .icon_as_template(false)
            .tooltip("Veluna")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id.as_ref() {
                "play_pause" => { let _ = app.emit("tray_play_pause", ()); }
                "next"       => { let _ = app.emit("tray_next", ()); }
                "prev"       => { let _ = app.emit("tray_prev", ()); }
                "show"       => toggle_window(app),
                "quit"       => app.exit(0),
                _            => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event {
                    let app = tray.app_handle();
                    toggle_window(app);
                }
            })
            .build(app)
    }));

    match result {
        Ok(Ok(_))  => Ok(()),
        Ok(Err(e)) => Err(format!("Tray build failed: {e}")),
        Err(_)     => Err(
            "Tray init panicked - on Linux install: libayatana-appindicator3-1".into()
        ),
    }
}

fn toggle_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let visible   = w.is_visible().unwrap_or(false);
        let minimized = w.is_minimized().unwrap_or(false);
        if visible && !minimized {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
            let _ = w.emit("window_focus", ());
        }
    }
}

fn ensure_created(app: &AppHandle) -> Result<(), String> {
    if app.tray_by_id(TRAY_ID).is_some() { return Ok(()); }
    build_tray(app)
}

#[tauri::command]
pub fn tray_set(
    app: AppHandle,
    enabled: bool,
    flag: tauri::State<'_, TrayFlag>,
) -> Result<bool, String> {
    if enabled {
        ensure_created(&app)?;
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            let _ = tray.set_visible(true);
        }
    } else {
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            let _ = tray.set_visible(false);
        }
    }
    
    if let Ok(mut guard) = flag.lock() { *guard = enabled; }
    Ok(enabled)
}

#[tauri::command]
pub fn tray_update_title(
    app: AppHandle,
    title: Option<String>,
    artist: Option<String>,
    is_playing: bool,
) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let tooltip = match (title, artist) {
            (Some(t), Some(a)) if !t.is_empty() && !a.is_empty() => {
                let status = if is_playing { "▶" } else { "⏸" };
                format!("Veluna: {status} {a} - {t}")
            }
            (Some(t), _) if !t.is_empty() => {
                let status = if is_playing { "▶" } else { "⏸" };
                format!("Veluna: {status} {t}")
            }
            _ => "Veluna Music Player".to_string(),
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
    Ok(())
}

pub fn handle_close_requested(app: &AppHandle, flag: &TrayFlag) -> bool {
    let active = flag.lock().map(|g| *g).unwrap_or(false);
    if !active { return false; }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    true
}
