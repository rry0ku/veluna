use crate::theme::ActiveTheme as _;
use gpui::prelude::*;
use gpui::{App, Div, IntoElement, RenderOnce, StyleRefinement, Window, div};

#[derive(IntoElement)]
pub struct ExplicitBadge {
    base: Div,
}

impl ExplicitBadge {
    pub fn new() -> Self {
        Self { base: div() }
    }
}

impl Default for ExplicitBadge {
    fn default() -> Self {
        Self::new()
    }
}

impl Styled for ExplicitBadge {
    fn style(&mut self) -> &mut StyleRefinement {
        self.base.style()
    }
}

impl RenderOnce for ExplicitBadge {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let Self { mut base } = self;
        let theme = *cx.theme();
        let overrides = std::mem::take(base.style());

        let mut badge = base
            .size_4()
            .flex()
            .items_center()
            .justify_center()
            .text_xs()
            .text_color(theme.muted_foreground)
            .bg(theme.muted)
            .rounded_xs()
            .child("E");
        badge.style().refine(&overrides);
        badge
    }
}
