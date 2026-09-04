use gpui::prelude::*;
use gpui::{
    AnyElement, App, Div, ElementId, Entity, Interactivity, ScrollWheelEvent, StyleRefinement,
    Window, div,
};

use crate::scrollbar::Scrollbar;

#[derive(IntoElement)]
pub struct Scroller {
    base: Div,
    id: ElementId,
    bar: Entity<Scrollbar>,
    children: Vec<AnyElement>,
    present_surface: bool,
}

impl Scroller {
    #[track_caller]
    pub fn new(id: impl Into<ElementId>, bar: &Entity<Scrollbar>) -> Self {
        Self {
            base: div(),
            id: id.into(),
            bar: bar.clone(),
            children: Vec::new(),
            present_surface: true,
        }
    }

    /// Lets a caller merge the scroll presentation into child transforms, avoiding nested
    /// compositor sampling when those children already have their own spring motion.
    pub fn manual_presentation(mut self) -> Self {
        self.present_surface = false;
        self
    }
}

impl Styled for Scroller {
    fn style(&mut self) -> &mut StyleRefinement {
        self.base.style()
    }
}

impl InteractiveElement for Scroller {
    fn interactivity(&mut self) -> &mut Interactivity {
        self.base.interactivity()
    }
}

impl ParentElement for Scroller {
    fn extend(&mut self, elements: impl IntoIterator<Item = AnyElement>) {
        self.children.extend(elements);
    }
}

impl RenderOnce for Scroller {
    fn render(self, _window: &mut Window, cx: &mut App) -> impl IntoElement {
        let Self {
            mut base,
            id,
            bar,
            children,
            present_surface,
        } = self;

        let scroll = bar.read(cx).scroll().clone();
        let overrides = std::mem::take(base.style());
        bar.read(cx).sync();
        let presentation = bar.read(cx).presentation();
        let gliding = bar.clone();

        let mut surface = base
            .id(id)
            .size_full()
            .overflow_y_scroll()
            .restrict_scroll_to_axis()
            .track_scroll(&scroll)
            .on_scroll_wheel(move |event: &ScrollWheelEvent, window, cx| {
                match event.delta.precise() {
                    true => gliding.update(cx, |bar, _| bar.stirred()),
                    false => gliding.update(cx, |bar, _| bar.nudge(window)),
                }
            })
            .children(children);

        surface.style().refine(&overrides);
        if present_surface {
            surface = surface.layer_translate(presentation);
        }

        div()
            .relative()
            .size_full()
            .min_h_0()
            .child(surface)
            .child(bar)
    }
}
