//! Hold off automatic suspend while music plays (#347).
//!
//! Linux only. Windows and macOS already keep the machine awake while an audio stream is open (the
//! audio driver's power request, coreaudiod's idle-sleep assertion); Linux desktops don't, so GNOME
//! suspended mid-song. Suspend only: the screen still blanks and locks as usual.
//!
//! Two session APIs, tried in order: `org.gnome.SessionManager` (GNOME and its forks) and
//! `org.freedesktop.PowerManagement.Inhibit` (Plasma, Xfce). Not the Inhibit portal: gnome-session
//! up to 48 rejects an inhibitor without an app id, and the portal has none for an unsandboxed app
//! started from a terminal. Both drop our inhibitor when the bus connection closes, so quitting
//! mid-song leaves nothing held.

use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::OnceLock;

use zbus::blocking::Connection;
use zbus::zvariant::DynamicType;
use zbus::Message;

/// The installed `veluna.desktop`, which is how the desktop finds a name and icon to show.
const APP_ID: &str = "veluna";
const REASON: &str = "Playing music";

/// On both, the interface is named like the bus name.
struct Api {
    name: &'static str,
    path: &'static str,
    release: &'static str,
}

static GNOME: Api = Api {
    name: "org.gnome.SessionManager",
    path: "/org/gnome/SessionManager",
    release: "Uninhibit",
};
static FDO: Api = Api {
    name: "org.freedesktop.PowerManagement.Inhibit",
    path: "/org/freedesktop/PowerManagement/Inhibit",
    release: "UnInhibit",
};

static TX: OnceLock<Sender<bool>> = OnceLock::new();

/// Called on every play/pause from `AppState::media_set_playing`. The D-Bus calls block, so they
/// run on a thread of their own, spawned on first use.
pub fn set_playing(playing: bool) {
    let tx = TX.get_or_init(|| {
        let (tx, rx) = channel();
        let spawned = std::thread::Builder::new().name("sleep-inhibit".into()).spawn(|| run(rx));
        if let Err(e) = spawned {
            tracing::warn!(error = %e, "sleep-inhibit thread spawn failed");
        }
        tx
    });
    let _ = tx.send(playing);
}

fn run(rx: Receiver<bool>) {
    let conn = match Connection::session() {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(error = %e, "no session bus, suspend is not held off while playing");
            return;
        }
    };
    let mut held: Option<(&Api, u32)> = None;
    while let Ok(playing) = rx.recv() {
        if playing && held.is_none() {
            match inhibit(&conn) {
                Ok(h) => held = Some(h),
                Err(e) => tracing::warn!(error = %e, "could not hold off suspend"),
            }
        } else if let (false, Some((api, cookie))) = (playing, held) {
            held = None;
            if let Err(e) = call(&conn, api, api.release, &cookie) {
                tracing::warn!(error = %e, "releasing the suspend inhibitor failed");
            }
        }
    }
}

fn inhibit(conn: &Connection) -> zbus::Result<(&'static Api, u32)> {
    // gnome-session flag 4 is suspend alone. PowerManagement has no flags and only ever blocks sleep.
    let cookie = |reply: Message| reply.body().deserialize::<u32>();
    call(conn, &GNOME, "Inhibit", &(APP_ID, 0u32, REASON, 4u32))
        .and_then(cookie)
        .map(|c| (&GNOME, c))
        .or_else(|_| {
            call(conn, &FDO, "Inhibit", &(APP_ID, REASON)).and_then(cookie).map(|c| (&FDO, c))
        })
}

fn call<B: serde::Serialize + DynamicType>(
    conn: &Connection,
    api: &Api,
    method: &str,
    body: &B,
) -> zbus::Result<Message> {
    conn.call_method(Some(api.name), api.path, Some(api.name), method, body)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Takes a real inhibitor on this desktop's session bus, checks the desktop reports suspend as
    /// inhibited, and releases it. Ignored: needs a desktop session.
    #[test]
    #[ignore]
    fn inhibits_and_releases_on_this_desktop() {
        let conn = Connection::session().unwrap();
        let (api, cookie) = inhibit(&conn).expect("no session manager took the inhibitor");
        println!("held by {} (cookie {cookie})", api.name);
        let inhibited = || {
            let reply = if std::ptr::eq(api, &GNOME) {
                call(&conn, api, "IsInhibited", &4u32)
            } else {
                call(&conn, api, "HasInhibit", &())
            };
            reply.unwrap().body().deserialize::<bool>().unwrap()
        };
        // PowerDevil applies a new inhibition about 5 s after the call.
        let seen = (0..20).any(|_| {
            std::thread::sleep(std::time::Duration::from_millis(500));
            inhibited()
        });
        call(&conn, api, api.release, &cookie).expect("release failed");
        assert!(seen, "the desktop never reported suspend as inhibited");
    }
}
