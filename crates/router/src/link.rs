use gpui::prelude::*;
use gpui::{Div, Stateful};

use crate::{Destination, navigate};

pub trait Link: Sized {
    fn link(self, to: Destination) -> Self;
}

impl Link for Stateful<Div> {
    fn link(self, to: Destination) -> Self {
        self.cursor_pointer().on_click(move |_, _, cx| {
            cx.stop_propagation();
            navigate(to.clone(), cx);
        })
    }
}
