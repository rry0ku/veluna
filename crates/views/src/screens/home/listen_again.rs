use std::rc::Rc;

use gpui::prelude::*;
use gpui::{App, ClickEvent, Entity, FontWeight, MouseDownEvent, Pixels, Window, div};
use music::Track;
use state::Playback;
use ui::{Button, heading};

use crate::shared::album_grid::CardGrid;
use crate::shared::track_card::{ContextHandler, StartHandler, TrackCard};

type ClickHandler = Rc<dyn Fn(&ClickEvent, &mut Window, &mut App)>;

#[derive(Clone, Copy)]
pub(super) struct Shape {
    pub(super) columns: usize,
    pub(super) pages: usize,
}

impl Shape {
    pub(super) fn new(width: Pixels, count: usize) -> Self {
        let columns = CardGrid::layout(width).columns;

        Self {
            columns,
            pages: count.div_ceil(columns).max(1),
        }
    }
}

#[derive(IntoElement)]
pub(super) struct ListenAgain {
    tracks: Rc<Vec<Track>>,
    playback: Entity<Playback>,
    active: Option<String>,
    width: Pixels,
    page: usize,
    on_previous: Option<ClickHandler>,
    on_next: Option<ClickHandler>,
    on_context_menu: Option<ContextHandler>,
    on_start: Option<StartHandler>,
}

impl ListenAgain {
    pub(super) fn new(
        tracks: Rc<Vec<Track>>,
        playback: Entity<Playback>,
        active: Option<String>,
        width: Pixels,
        page: usize,
    ) -> Self {
        Self {
            tracks,
            playback,
            active,
            width,
            page,
            on_previous: None,
            on_next: None,
            on_context_menu: None,
            on_start: None,
        }
    }

    pub(super) fn on_previous(
        mut self,
        handler: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
    ) -> Self {
        self.on_previous = Some(Rc::new(handler));
        self
    }

    pub(super) fn on_next(
        mut self,
        handler: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
    ) -> Self {
        self.on_next = Some(Rc::new(handler));
        self
    }

    pub(super) fn on_context_menu(
        mut self,
        handler: impl Fn(usize, &MouseDownEvent, &mut Window, &mut App) + 'static,
    ) -> Self {
        self.on_context_menu = Some(Rc::new(handler));
        self
    }

    pub(super) fn on_start(mut self, handler: impl Fn(usize, &mut App) + 'static) -> Self {
        self.on_start = Some(Rc::new(handler));
        self
    }
}

impl RenderOnce for ListenAgain {
    fn render(self, _: &mut Window, cx: &mut App) -> impl IntoElement {
        let layout = CardGrid::layout(self.width);
        let shape = Shape::new(self.width, self.tracks.len());
        let page = self.page.min(shape.pages.saturating_sub(1));
        let start = page * shape.columns;
        let tracks = self.tracks;
        let cards = tracks
            .iter()
            .enumerate()
            .skip(start)
            .take(shape.columns)
            .map(|(place, _)| {
                TrackCard::new(
                    "listen-again-card",
                    place,
                    tracks.clone(),
                    self.playback.clone(),
                    self.active.as_deref(),
                )
                .context(self.on_context_menu.clone())
                .start(self.on_start.clone())
                .render(cx)
                .tile(layout.card)
                .flat()
                .weight(FontWeight::SEMIBOLD)
                .hint()
                .into_any_element()
            });

        div()
            .w_full()
            .flex()
            .flex_col()
            .gap_3()
            .child(
                div()
                    .flex()
                    .items_end()
                    .justify_between()
                    .gap_4()
                    .child(heading(i18n::lookup("home-listen-again", None), cx))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_1()
                            .child(
                                Button::new("listen-again-previous")
                                    .small()
                                    .outline()
                                    .icon("icons/chevron-left.svg")
                                    .tooltip("common-previous")
                                    .disabled(page == 0)
                                    .when_some(self.on_previous, |button, handler| {
                                        button.on_click(move |event, window, cx| {
                                            handler(event, window, cx)
                                        })
                                    }),
                            )
                            .child(
                                Button::new("listen-again-next")
                                    .small()
                                    .outline()
                                    .icon("icons/chevron-right.svg")
                                    .tooltip("common-next")
                                    .disabled(page + 1 >= shape.pages)
                                    .when_some(self.on_next, |button, handler| {
                                        button.on_click(move |event, window, cx| {
                                            handler(event, window, cx)
                                        })
                                    }),
                            ),
                    ),
            )
            .child(CardGrid::new(self.width).children(cards))
    }
}
