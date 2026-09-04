use std::rc::Rc;

use gpui::prelude::*;
use gpui::{App, ClickEvent, Entity, Pixels, SharedString, Window, div, px};
use i18n::t;
use router::{Destination, navigate};
use ui::{ActiveTheme as _, Artwork, Button, Modal, Scrollbar, Scroller, eyebrow, heading};

use crate::shared::effects;

const PORTRAIT: Pixels = px(88.);
const LINES: usize = 3;
const DIALOG: f32 = 4.5;
const BIO_HEIGHT: Pixels = px(360.);
const FADE: Pixels = px(64.);

type Open = Rc<dyn Fn(&ClickEvent, &mut Window, &mut App)>;

#[derive(IntoElement)]
pub(crate) struct AboutArtist {
    id: &'static str,
    name: SharedString,
    cover: Option<String>,
    biography: Option<String>,
    on_open: Option<Open>,
}

impl AboutArtist {
    pub(crate) fn new(id: &'static str, name: impl Into<SharedString>) -> Self {
        Self {
            id,
            name: name.into(),
            cover: None,
            biography: None,
            on_open: None,
        }
    }

    pub(crate) fn cover(mut self, cover: Option<String>) -> Self {
        self.cover = cover;
        self
    }

    pub(crate) fn biography(mut self, biography: Option<String>) -> Self {
        self.biography = biography;
        self
    }

    pub(crate) fn on_open(
        mut self,
        handler: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
    ) -> Self {
        self.on_open = Some(Rc::new(handler));
        self
    }
}

impl RenderOnce for AboutArtist {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = *cx.theme();

        div()
            .id(self.id)
            .flex()
            .items_center()
            .gap_5()
            .p_5()
            .rounded(theme.radius)
            .border_1()
            .border_color(theme.border)
            .when_some(self.on_open, |this, open| {
                this.cursor_pointer()
                    .hover(|style| style.bg(theme.secondary))
                    .on_click(move |event, window, cx| open(event, window, cx))
            })
            .child(Artwork::new(self.cover).size(PORTRAIT).circle())
            .child(
                div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_w_0()
                    .gap_2()
                    .child(eyebrow(t!("artist-about"), cx))
                    .child(heading(self.name, cx).min_w_0().truncate())
                    .child(
                        div()
                            .min_w_0()
                            .overflow_hidden()
                            .line_clamp(LINES)
                            .text_ellipsis()
                            .text_color(theme.muted_foreground)
                            .child(blurb(self.biography)),
                    ),
            )
    }
}

pub(crate) fn about_modal(
    name: SharedString,
    biography: Option<String>,
    artist: Option<SharedString>,
    bar: &Entity<Scrollbar>,
    cx: &App,
) -> Modal {
    let theme = *cx.theme();
    let biography = biography.filter(|biography| !biography.is_empty());

    Modal::new("artist-about-dialog", t!("artist-about"))
        .w(theme.metrics.cover * DIALOG)
        .detail(name)
        .map(|modal| match biography {
            Some(biography) => {
                let text = SharedString::from(biography);
                let overflows = bar.read(cx).scroll().max_offset().y > Pixels::ZERO;
                let tail = FADE * 0.75;

                modal.child(
                    div()
                        .relative()
                        .max_h(BIO_HEIGHT)
                        .min_h_0()
                        .text_color(theme.muted_foreground)
                        .child(
                            div()
                                .invisible()
                                .when(overflows, |this| this.pb(tail))
                                .child(text.clone()),
                        )
                        .child(
                            div().absolute().inset_0().child(
                                Scroller::new("artist-about-bio", bar)
                                    .when(overflows, |this| this.pb(tail))
                                    .when(overflows && effects(), |this| {
                                        this.fade_edges(px(0.), FADE)
                                    })
                                    .child(text),
                            ),
                        ),
                )
            }
            None => modal.child(
                div()
                    .text_color(theme.muted_foreground)
                    .child(t!("artist-about-fallback")),
            ),
        })
        .when_some(artist, |modal, artist| {
            modal.action(
                Button::new("artist-about-open")
                    .label(t!("artist-about-open"))
                    .outline()
                    .on_click(move |_, _, cx| {
                        navigate(Destination::Artist(artist.clone()), cx);
                    }),
            )
        })
}

fn blurb(biography: Option<String>) -> SharedString {
    biography
        .filter(|biography| !biography.is_empty())
        .map(SharedString::from)
        .unwrap_or_else(|| t!("artist-about-fallback"))
}
