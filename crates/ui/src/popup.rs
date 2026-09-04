use std::rc::Rc;

use gpui::prelude::*;
use gpui::{App, MouseButton, Pixels, Point, StyleRefinement, Window, anchored, px};

use crate::menu::Menu;

const MARGIN: Pixels = px(8.);

type Close = Box<dyn Fn(&(), &mut Window, &mut App) + 'static>;

#[derive(IntoElement)]
pub struct Popup {
    at: Point<Pixels>,
    menu: Menu,
    close: Option<Close>,
}

impl Popup {
    pub fn new(at: Point<Pixels>, menu: Menu) -> Self {
        Self {
            at,
            menu,
            close: None,
        }
    }

    pub fn on_close(mut self, handler: impl Fn(&(), &mut Window, &mut App) + 'static) -> Self {
        self.close = Some(Box::new(handler));
        self
    }
}

impl Styled for Popup {
    fn style(&mut self) -> &mut StyleRefinement {
        self.menu.style()
    }
}

impl RenderOnce for Popup {
    fn render(self, _: &mut Window, _: &mut App) -> impl IntoElement {
        let Self { at, menu, close } = self;
        let menu = match close {
            None => menu,
            Some(close) => {
                let close = Rc::new(close);
                let outside = close.clone();
                let toggled = close.clone();

                menu.on_dismiss(move |_, window, cx| outside(&(), window, cx))
                    .on_action(move |_, window, cx| close(&(), window, cx))
                    .on_mouse_down(MouseButton::Right, move |_, window, cx| {
                        cx.stop_propagation();
                        toggled(&(), window, cx);
                    })
            }
        };

        anchored()
            .position(at)
            .snap_to_window_with_margin(MARGIN)
            .child(menu)
    }
}
