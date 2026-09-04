use gpui::{App, Entity, Pixels, ScrollHandle, Window, px};

use state::{AppSettings, Playback};
use ui::{Listing, TableState, Viewport, quantize, scrolled};

use crate::shared::cells;
use crate::shared::tracks::{self, TrackSource};

pub(crate) fn store(
    settings: &Entity<AppSettings>,
    table: &dyn Listing,
    layout_key: &str,
    sort_key: &str,
    cx: &mut App,
) {
    let layout = table.layout(cx);
    let sorting = table.sorting(cx);

    settings.update(cx, |settings, cx| {
        settings.set_table(layout_key, layout, cx);
        settings.set_sorting(sort_key, sorting, cx);
    });
}

pub(crate) fn reserved(inset: Pixels) -> Pixels {
    inset * 2. + px(2.)
}

pub(crate) fn play(
    table: &Entity<TableState<TrackSource>>,
    playback: &Entity<Playback>,
    display: usize,
    cx: &mut App,
) {
    let queued = tracks::ordered(table, cx);
    let from = tracks::whence(table, cx);
    playback.update(cx, |playback, cx| playback.start(queued, display, from, cx));
}

pub(crate) fn play_or_toggle(
    table: &Entity<TableState<TrackSource>>,
    playback: &Entity<Playback>,
    display: usize,
    cx: &mut App,
) {
    let queued = tracks::ordered(table, cx);
    let Some(track) = queued.get(display) else {
        return;
    };
    let current = playback.read(cx).track();
    let same = current.and_then(|track| track.id.as_deref()) == track.id.as_deref();
    match same {
        true => playback.update(cx, |playback, cx| playback.toggle_play(cx)),
        false => play(table, playback, display, cx),
    }
}

pub(crate) fn resize(
    table: &dyn Listing,
    width: &mut Pixels,
    inset: Pixels,
    window: &Window,
    cx: &mut App,
) {
    let next = cells::content_width(window, reserved(inset), cx);
    if (next - *width).abs() < px(0.5) {
        return;
    }
    *width = next;
    table.set_width(next, cx);
}

pub(crate) fn viewport(scroll: &ScrollHandle, inset: Pixels, window: &Window) -> Viewport {
    quantize(scroll, window);
    let hero = scroll
        .bounds_for_item(0)
        .map(|bounds| bounds.size.height)
        .unwrap_or_default();
    let visible = scroll.bounds().size.height;

    Viewport::measured(scrolled(scroll) - inset - hero, visible, window)
}
