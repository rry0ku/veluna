use gpui::prelude::*;
use gpui::{
    Anchor, AnyView, App, Context, Pixels, Point, SharedString, Window, anchored, div, point, px,
};

use crate::metrics::Text;
use crate::theme::ActiveTheme as _;

const MARGIN: Pixels = px(8.);
const OFFSET: Pixels = px(6.);

#[derive(Clone, Copy, Default, PartialEq)]
pub enum Perch {
    #[default]
    Pointer,
    Above,
}

pub struct Tooltip {
    text: SharedString,
    raw: bool,
    perch: Perch,
    at: Point<Pixels>,
}

impl Tooltip {
    pub fn new(key: impl Into<SharedString>, at: Point<Pixels>) -> Self {
        Self {
            text: key.into(),
            raw: false,
            perch: Perch::default(),
            at,
        }
    }

    pub fn perch(mut self, perch: Perch) -> Self {
        self.perch = perch;
        self
    }

    pub fn raw(mut self) -> Self {
        self.raw = true;
        self
    }

    pub fn build(
        key: impl Into<SharedString>,
        perch: Perch,
    ) -> impl Fn(&mut Window, &mut App) -> AnyView + 'static {
        let key = key.into();
        move |window, cx| {
            let at = window.mouse_position();
            cx.new(|_| Self::new(key.clone(), at).perch(perch)).into()
        }
    }

    pub fn label(
        text: impl Into<SharedString>,
        perch: Perch,
    ) -> impl Fn(&mut Window, &mut App) -> AnyView + 'static {
        let text = text.into();
        move |window, cx| {
            let at = window.mouse_position();
            cx.new(|_| Self::new(text.clone(), at).perch(perch).raw())
                .into()
        }
    }
}

impl Render for Tooltip {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = *cx.theme();
        let at = self.at;
        let (position, anchor) = match self.perch {
            Perch::Pointer => (at + point(-OFFSET, OFFSET), Anchor::TopRight),
            Perch::Above => (
                point(at.x, at.y - theme.metrics.control_small / 2.),
                Anchor::BottomCenter,
            ),
        };

        anchored()
            .position(position)
            .anchor(anchor)
            .snap_to_window_with_margin(MARGIN)
            .child(
                div()
                    .px_2()
                    .py_1()
                    .rounded(theme.radius)
                    .border_1()
                    .border_color(theme.border)
                    .bg(theme.popover)
                    .text_size(theme.text(Text::Small))
                    .text_color(theme.popover_foreground)
                    .child(match self.raw {
                        true => self.text.clone(),
                        false => i18n::lookup(&self.text, None),
                    }),
            )
    }
}
