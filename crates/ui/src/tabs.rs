use gpui::prelude::*;
use gpui::{AnyElement, App, Div, StyleRefinement, Window, div, px};

use crate::button::Button;
use crate::theme::ActiveTheme as _;

const GAP: f32 = 0.25;
const LINE: f32 = 1.;
const INDENT: f32 = 16.;
const ICON: f32 = 20.;

#[derive(IntoElement)]
pub struct Tabs {
    base: Div,
    items: Vec<AnyElement>,
}

#[derive(IntoElement)]
pub struct TabBar {
    base: Div,
    items: Vec<Button>,
}

impl Default for TabBar {
    fn default() -> Self {
        Self::new()
    }
}

impl TabBar {
    pub fn new() -> Self {
        Self {
            base: div(),
            items: Vec::new(),
        }
    }

    pub fn items(mut self, items: impl IntoIterator<Item = Button>) -> Self {
        self.items = items.into_iter().collect();
        self
    }
}

impl Styled for TabBar {
    fn style(&mut self) -> &mut StyleRefinement {
        self.base.style()
    }
}

impl RenderOnce for TabBar {
    fn render(self, window: &mut Window, cx: &mut App) -> impl IntoElement {
        let Self { mut base, items } = self;
        let theme = cx.theme();
        let radius = (theme.radius - window.rem_size() * GAP).max(px(0.));
        let overrides = std::mem::take(base.style());

        let mut bar = base
            .flex()
            .items_center()
            .gap_1()
            .p_1()
            .rounded(theme.radius)
            .bg(theme.secondary)
            .border_1()
            .border_color(theme.border)
            .children(items.into_iter().map(|item| item.rounded(radius)));

        bar.style().refine(&overrides);
        bar
    }
}

impl Default for Tabs {
    fn default() -> Self {
        Self::new()
    }
}

impl Tabs {
    pub fn new() -> Self {
        Self {
            base: div(),
            items: Vec::new(),
        }
    }

    pub fn items(mut self, items: impl IntoIterator<Item = impl IntoElement>) -> Self {
        self.items = items
            .into_iter()
            .map(IntoElement::into_any_element)
            .collect();
        self
    }
}

impl Styled for Tabs {
    fn style(&mut self) -> &mut StyleRefinement {
        self.base.style()
    }
}

impl RenderOnce for Tabs {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let Self { mut base, items } = self;
        let theme = cx.theme();
        let height = theme.metrics.control;
        let middle = height / 2.;
        let border = theme.sidebar_border;
        let overrides = std::mem::take(base.style());

        let mut tabs = base
            .relative()
            .flex()
            .flex_col()
            .gap_1()
            .ml(px(INDENT))
            .child(
                div()
                    .absolute()
                    .left(px(ICON - INDENT))
                    .top_0()
                    .bottom(middle)
                    .w(px(LINE))
                    .bg(border),
            )
            .children(items.into_iter().map(|item| {
                div()
                    .relative()
                    .flex()
                    .items_center()
                    .h(height)
                    .pl_3()
                    .child(div().flex().flex_1().child(item))
            }));

        tabs.style().refine(&overrides);
        tabs
    }
}
