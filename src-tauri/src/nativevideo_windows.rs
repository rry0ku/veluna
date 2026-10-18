//! Music video on Windows, drawn by mpv underneath the webview, as on Linux (nativevideo.rs has
//! the why: one clock instead of a `<video>` kept in step from JavaScript, #321). Same four
//! functions, so the callers only differ in their `cfg`.
//!
//! The layering differs. mpv draws with its own video output (D3D11) into a child window of the
//! main window, handed over as `wid` (`Player::set_video_window`). That child sits at the bottom
//! of the main window's z-order, under WebView2, which is transparent like the window, so the
//! picture shows through the hole the page leaves for it. tauri-plugin-libmpv layers mpv under
//! WebView2 the same way.
//!
//! Anywhere mpv has not drawn, the window is see-through: tao makes it transparent with DWM
//! blur-behind, and whatever GDI paints there counts as transparent. So the hole may only open
//! over a live mpv window: `set_rect` waits for mpv's output before it says the picture is up, and
//! the player keeps that output up between tracks while the picture is visible (`apply_vid`).

use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use windows::core::w;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DestroyWindow, SetWindowPos, HWND_BOTTOM, SWP_HIDEWINDOW, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW, WS_CHILD, WS_EX_NOACTIVATE,
};

use crate::state::AppState;

/// The child window mpv draws into, as an integer because `HWND` is not `Send`. 0 until
/// [`install`] made one, which is also what [`available`] reads.
static CHILD: AtomicIsize = AtomicIsize::new(0);

/// For [`next_frame`], which the command calls without one.
static STATE: OnceLock<Arc<AppState>> = OnceLock::new();

/// How long [`set_rect`] waits for mpv's window before letting the page open the hole anyway.
/// Its output starts in a few hundred milliseconds; this only bounds a driver that never answers.
const OUTPUT_WAIT: Duration = Duration::from_millis(1500);

pub fn available() -> bool {
    CHILD.load(Ordering::Relaxed) != 0
}

/// Make the child window and give it to mpv. Best-effort: on any failure videos keep using the
/// `<video>` element.
pub fn install(win: &tauri::WebviewWindow, state: Arc<AppState>) {
    let parent = match win.hwnd() {
        Ok(h) => h,
        Err(e) => {
            tracing::warn!(error = %e, "native video: no window handle, videos use <video>");
            return;
        }
    };
    // A plain STATIC control: a system class, so nothing to register, and it never takes input
    // (WebView2 is on top of it anyway). Hidden until the page has a hole for it.
    // No WS_CLIPSIBLINGS: WebView2's window is above this one and covers all of it, so clipping
    // to siblings left this window, and mpv's window inside it, no visible region at all. mpv
    // drew every frame and the hole showed the desktop (rc.6). mpv's own embedded window is
    // `WS_CHILD | WS_VISIBLE` for the same reason.
    // SAFETY: a child of a live top-level window, made on the thread that owns that window
    // (setup runs on the main thread).
    let child = unsafe {
        CreateWindowExW(
            WS_EX_NOACTIVATE,
            w!("STATIC"),
            None,
            WS_CHILD,
            0,
            0,
            0,
            0,
            Some(parent),
            None,
            None,
            None,
        )
    };
    let child = match child {
        Ok(h) => h,
        Err(e) => {
            tracing::warn!(error = %e, "native video: no child window, videos use <video>");
            return;
        }
    };
    if let Err(e) = state.player.set_video_window(child.0 as i64) {
        tracing::warn!(error = %e, "native video: mpv refused the window, videos use <video>");
        // SAFETY: ours, made just above, on this thread.
        let _ = unsafe { DestroyWindow(child) };
        return;
    }
    let _ = STATE.set(state);
    CHILD.store(child.0 as isize, Ordering::Relaxed);
    tracing::info!("native video: mpv draws into a child window under WebView2");
}

/// Put the picture at `rect` (`[x, y, w, h]`, CSS pixels relative to the viewport) or take it
/// away, and tell mpv whether anyone can see it. `dpr` is the page's `devicePixelRatio`, which in
/// WebView2 is the display scale times the page zoom. Returns whether the picture is up.
pub async fn set_rect(
    app: &tauri::AppHandle,
    state: Arc<AppState>,
    rect: Option<[f64; 4]>,
    dpr: f64,
) -> bool {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let res = app.run_on_main_thread(move || {
        let _ = tx.send(place(rect, dpr));
    });
    let shown = res.is_ok() && rx.await.unwrap_or(false);
    // After the window moves: mpv's own window lives inside it, so it shows and hides with it.
    state.player.set_video_visible(shown);
    if shown {
        let until = Instant::now() + OUTPUT_WAIT;
        while !state.player.video_output_up() && Instant::now() < until {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }
    tracing::debug!(?rect, dpr, shown, "native video: rect");
    shown
}

/// Show the child at `rect`, or hide it. Main thread.
fn place(rect: Option<[f64; 4]>, dpr: f64) -> bool {
    let child = HWND(CHILD.load(Ordering::Relaxed) as *mut _);
    if child.is_invalid() {
        return false;
    }
    let Some([x, y, w, h]) = rect.filter(|r| r[2] >= 1.0 && r[3] >= 1.0) else {
        let flags = SWP_HIDEWINDOW | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE;
        // SAFETY: our own child window, on the thread that made it.
        let _ = unsafe { SetWindowPos(child, None, 0, 0, 0, 0, flags) };
        return false;
    };
    let s = if dpr.is_finite() && dpr > 0.0 { dpr } else { 1.0 };
    // A pixel of slack all round, as on Linux: the page's surround covers the excess, and a
    // picture a pixel short of the hole would leave a hairline of desktop.
    let (x0, y0) = ((x * s).floor() as i32 - 1, (y * s).floor() as i32 - 1);
    let (x1, y1) = (((x + w) * s).ceil() as i32 + 1, ((y + h) * s).ceil() as i32 + 1);
    // Back to the bottom every time: under WebView2's window, which was made before this one.
    // SAFETY: as above.
    unsafe {
        SetWindowPos(
            child,
            Some(HWND_BOTTOM),
            x0,
            y0,
            x1 - x0,
            y1 - y0,
            SWP_SHOWWINDOW | SWP_NOACTIVATE,
        )
    }
    .is_ok()
}

// --- Ambient light ------------------------------------------------------------------------------
// The page cannot see mpv's picture, so the glow's frames come from here, in the format the Linux
// GPU readback produces. mpv's own output keeps its frames on the GPU, so this asks mpv for a copy
// (`Player::video_thumbnail`) when the page asks, about 15 times a second, not on every frame.

/// The width the frame is shrunk to at most, as on Linux.
const GRAB_MAX_W: usize = 128;

/// `(seq, pts)` of the last frame handed out.
static LAST: Mutex<(u32, f64)> = Mutex::new((0, f64::NAN));

/// A frame other than `after`: `seq`, `w`, `h` as little-endian u32s, then RGBA rows bottom-up.
/// `None` with no picture up, or while still paused on the frame `after` already is.
pub async fn next_frame(after: u32) -> Option<Arc<[u8]>> {
    let state = STATE.get()?.clone();
    tokio::task::spawn_blocking(move || {
        let mut last = LAST.lock().ok()?;
        let unless = (after == last.0).then_some(last.1);
        let t = state.player.video_thumbnail(GRAB_MAX_W, unless)?;
        last.0 = last.0.wrapping_add(1).max(1);
        last.1 = t.pts;
        let mut out = Vec::with_capacity(12 + t.rgba.len());
        for v in [last.0, t.width as u32, t.height as u32] {
            out.extend_from_slice(&v.to_le_bytes());
        }
        out.extend_from_slice(&t.rgba);
        Some(Arc::from(out))
    })
    .await
    .ok()
    .flatten()
}
