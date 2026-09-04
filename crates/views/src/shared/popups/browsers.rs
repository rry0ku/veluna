use std::rc::Rc;

use gpui::prelude::*;
use gpui::{App, SharedString, Window, div};
use i18n::t;
use ui::{Button, Modal};

type Pick = Rc<dyn Fn(&SharedString, &mut Window, &mut App)>;
type Cancel = Rc<dyn Fn(&(), &mut Window, &mut App)>;

#[derive(IntoElement)]
pub(crate) struct BrowserPicker {
    names: Vec<SharedString>,
    pick: Option<Pick>,
    cancel: Option<Cancel>,
}

impl BrowserPicker {
    pub(crate) fn new(names: Vec<SharedString>) -> Self {
        Self {
            names,
            pick: None,
            cancel: None,
        }
    }

    pub(crate) fn on_pick(
        mut self,
        handler: impl Fn(&SharedString, &mut Window, &mut App) + 'static,
    ) -> Self {
        self.pick = Some(Rc::new(handler));
        self
    }

    pub(crate) fn on_cancel(
        mut self,
        handler: impl Fn(&(), &mut Window, &mut App) + 'static,
    ) -> Self {
        self.cancel = Some(Rc::new(handler));
        self
    }
}

impl RenderOnce for BrowserPicker {
    fn render(self, _window: &mut Window, _cx: &mut App) -> impl IntoElement {
        let Self {
            names,
            pick,
            cancel,
        } = self;
        let dismissed = cancel.clone();

        Modal::new("browser-picker", t!("login-browser-title"))
            .detail(t!("login-browser-detail"))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .children(names.into_iter().map(|name| {
                        let pick = pick.clone();
                        Button::new(SharedString::from(format!("browser-{name}")))
                            .label(name.clone())
                            .outline()
                            .w_full()
                            .on_click(move |_, window, cx| {
                                if let Some(pick) = &pick {
                                    pick(&name, window, cx);
                                }
                            })
                    })),
            )
            .action(
                Button::new("cancel-browser")
                    .ghost()
                    .label(t!("common-cancel"))
                    .on_click(move |_, window, cx| {
                        if let Some(cancel) = &cancel {
                            cancel(&(), window, cx);
                        }
                    }),
            )
            .on_dismiss(move |_, window, cx| {
                if let Some(dismissed) = &dismissed {
                    dismissed(&(), window, cx);
                }
            })
    }
}
