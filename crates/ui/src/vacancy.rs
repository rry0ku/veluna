use gpui::prelude::*;
use gpui::{AnyElement, App, Div, SharedString, StyleRefinement, Window, div, svg};

use crate::label::vacant;
use crate::theme::ActiveTheme as _;

const GLYPH: f32 = 0.35;
const GLYPH_SIZE: f32 = 0.5;

#[derive(IntoElement)]
pub struct Vacancy {
    base: Div,
    label: SharedString,
    icon: Option<SharedString>,
    action: Option<AnyElement>,
}

impl Vacancy {
    pub fn new(label: impl Into<SharedString>) -> Self {
        Self {
            base: div(),
            label: label.into(),
            icon: None,
            action: None,
        }
    }

    pub fn icon(mut self, path: impl Into<SharedString>) -> Self {
        self.icon = Some(path.into());
        self
    }

    pub fn action(mut self, action: impl IntoElement) -> Self {
        self.action = Some(action.into_any_element());
        self
    }
}

impl Styled for Vacancy {
    fn style(&mut self) -> &mut StyleRefinement {
        self.base.style()
    }
}

impl RenderOnce for Vacancy {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let Self {
            mut base,
            label,
            icon,
            action,
        } = self;

        let theme = *cx.theme();
        let overrides = std::mem::take(base.style());
        let glyph = theme.metrics.cover * GLYPH_SIZE;

        let mut vacancy = base
            .flex()
            .flex_col()
            .w_full()
            .items_center()
            .justify_center()
            .when_some(icon, |this, icon| {
                this.child(
                    svg()
                        .path(icons::path(icon))
                        .size(glyph)
                        .mt(theme.metrics.inset)
                        .flex_none()
                        .text_color(theme.muted_foreground.opacity(GLYPH)),
                )
            })
            .child(vacant(label, cx))
            .when_some(action, |this, action| this.child(action));

        vacancy.style().refine(&overrides);
        vacancy
    }
}
