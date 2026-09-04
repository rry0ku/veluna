use gpui::{App, Menu, MenuItem};
use i18n::t;
use input::{
    Quit, RefreshLibrary, SignOut, SongNext, SongPrevious, TogglePlayback, ZoomIn, ZoomOut,
    ZoomReset,
};
use router::Destination;
use state::Veluna;
use ui::{ActiveTheme, Look, MAX_FONT, MIN_FONT, Theme};

pub fn register(lingers: bool, cx: &mut App) {
    cx.bind_keys(input::bindings());

    cx.on_action(|_: &Quit, cx: &mut App| cx.quit());

    cx.on_window_closed(move |cx, _| {
        if !cx.windows().is_empty() {
            return;
        }
        let close_to_tray = Veluna::global(cx).settings.read(cx).close_to_tray();
        match lingers && close_to_tray {
            true => crate::dock::show(false),
            false => cx.quit(),
        }
    })
    .detach();

    cx.on_action(|_: &SignOut, cx: &mut App| {
        let session = Veluna::global(cx).session.clone();
        session.update(cx, |session, cx| session.sign_out(cx));
    });

    cx.on_action(
        |_: &RefreshLibrary, cx: &mut App| match router::trail(cx).read(cx).current() {
            Destination::History => {
                let history = Veluna::global(cx).history.clone();
                history.update(cx, |history, cx| history.refresh(cx));
            }
            _ => {
                let library = Veluna::global(cx).library.clone();
                library.update(cx, |library, cx| library.refresh(cx));
            }
        },
    );

    cx.on_action(|_: &TogglePlayback, cx: &mut App| {
        let playback = Veluna::global(cx).playback.clone();
        playback.update(cx, |playback, cx| playback.toggle_play(cx));
    });

    cx.on_action(|_: &SongPrevious, cx: &mut App| {
        let playback = Veluna::global(cx).playback.clone();
        playback.update(cx, |playback, cx| playback.previous(cx));
    });

    cx.on_action(|_: &SongNext, cx: &mut App| {
        let playback = Veluna::global(cx).playback.clone();
        playback.update(cx, |playback, cx| playback.next(cx));
    });

    cx.on_action(|_: &ZoomIn, cx: &mut App| {
        let settings = Veluna::global(cx).settings.clone();
        let (look, overrides) = {
            let settings = settings.read(cx);
            (settings.look(), settings.theme_overrides().clone())
        };
        let tint = cx.theme().tint;
        let current_font = look.font;
        let wanted = (current_font + 1.0).clamp(MIN_FONT, MAX_FONT);
        if (wanted - current_font).abs() > 0.001 {
            settings.update(cx, |settings, cx| settings.set_font_size(wanted, cx));
            Theme::set(
                Look {
                    font: wanted,
                    tint,
                    ..look
                },
                &overrides,
                cx,
            );
        }
    });

    cx.on_action(|_: &ZoomOut, cx: &mut App| {
        let settings = Veluna::global(cx).settings.clone();
        let (look, overrides) = {
            let settings = settings.read(cx);
            (settings.look(), settings.theme_overrides().clone())
        };
        let tint = cx.theme().tint;
        let current_font = look.font;
        let wanted = (current_font - 1.0).clamp(MIN_FONT, MAX_FONT);
        if (wanted - current_font).abs() > 0.001 {
            settings.update(cx, |settings, cx| settings.set_font_size(wanted, cx));
            Theme::set(
                Look {
                    font: wanted,
                    tint,
                    ..look
                },
                &overrides,
                cx,
            );
        }
    });

    cx.on_action(|_: &ZoomReset, cx: &mut App| {
        let settings = Veluna::global(cx).settings.clone();
        let (look, overrides) = {
            let settings = settings.read(cx);
            (settings.look(), settings.theme_overrides().clone())
        };
        let tint = cx.theme().tint;
        let wanted = 14.0;
        if (look.font - wanted).abs() > 0.001 {
            settings.update(cx, |settings, cx| settings.set_font_size(wanted, cx));
            Theme::set(
                Look {
                    font: wanted,
                    tint,
                    ..look
                },
                &overrides,
                cx,
            );
        }
    });

    cx.set_menus(vec![Menu {
        name: "Veluna".into(),
        disabled: false,
        items: vec![
            MenuItem::action(t!("app-refresh-library"), RefreshLibrary),
            MenuItem::action(t!("app-sign-out"), SignOut),
            MenuItem::separator(),
            MenuItem::action(t!("app-quit"), Quit),
        ],
    }]);
}
