use gpui::prelude::*;
use gpui::{Context, Entity, Pixels, Render, Window, div, px, svg};
use i18n::t;
use state::{Veluna, UpdateState, Updates};
use ui::{ActiveTheme as _, Button, Text};

const ICON: Pixels = px(18.);
const REACH: Pixels = px(340.);

pub(crate) struct UpdateNotice {
    updates: Entity<Updates>,
}

impl UpdateNotice {
    pub fn new(cx: &mut Context<Self>) -> Self {
        let updates = Veluna::global(cx).updates.clone();
        cx.observe(&updates, |_, _, cx| cx.notify()).detach();
        Self { updates }
    }
}

impl Render for UpdateNotice {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = *cx.theme();
        let state = self.updates.read(cx).state().clone();
        let installable = self.updates.read(cx).installable();
        let (version, page) = match &state {
            UpdateState::Offered(release) => (release.version.clone(), release.page.clone()),
            _ => (String::new(), String::new()),
        };
        let working = matches!(state, UpdateState::Fetching);
        let failed = matches!(state, UpdateState::Failed);
        if matches!(state, UpdateState::Quiet) {
            return div();
        }

        let updates = self.updates.clone();
        let dismiss = self.updates.clone();
        let title = match failed {
            true => t!("update-failed"),
            false => t!("update-available", version = version.as_str()),
        };

        div()
            .absolute()
            .top(theme.metrics.pad)
            .left(theme.metrics.pad)
            .w(REACH)
            .flex()
            .flex_col()
            .gap_2()
            .p(theme.metrics.pad)
            .rounded(theme.radius)
            .border_1()
            .border_color(theme.border)
            .shadow_md()
            .bg(theme.popover)
            .text_color(theme.foreground)
            .child(
                div()
                    .flex()
                    .items_start()
                    .justify_between()
                    .gap_2()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_2()
                            .min_w_0()
                            .child(
                                svg()
                                    .path(icons::path("icons/refresh-cw.svg"))
                                    .size(ICON)
                                    .flex_none()
                                    .text_color(theme.primary),
                            )
                            .child(
                                div()
                                    .min_w_0()
                                    .font_weight(gpui::FontWeight::SEMIBOLD)
                                    .child(title),
                            ),
                    )
                    .child(
                        Button::new("update-dismiss")
                            .ghost()
                            .small()
                            .icon("icons/x.svg")
                            .tooltip("common-dismiss")
                            .on_click(cx.listener(move |_, _, _, cx| {
                                dismiss.update(cx, |updates, cx| updates.dismiss(cx));
                            })),
                    ),
            )
            .when(!failed, |this| {
                this.child(
                    div()
                        .text_size(theme.text(Text::Small))
                        .text_color(theme.muted_foreground)
                        .child(match installable {
                            true => t!("update-detail", running = env!("CARGO_PKG_VERSION")),
                            false => {
                                t!("update-detail-notes", running = env!("CARGO_PKG_VERSION"))
                            }
                        }),
                )
            })
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_end()
                    .gap_2()
                    .when(!page.is_empty(), |this| {
                        this.child(
                            Button::new("update-notes")
                                .ghost()
                                .small()
                                .label(t!("update-notes"))
                                .on_click(move |_, _, cx| cx.open_url(&page)),
                        )
                    })
                    .child(
                        Button::new("update-later")
                            .outline()
                            .small()
                            .label(t!("update-later"))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.updates.update(cx, |updates, cx| updates.dismiss(cx));
                            })),
                    )
                    .when(installable && !failed, |this| {
                        this.child(
                            Button::new("update-now")
                                .primary()
                                .small()
                                .disabled(working)
                                .label(match working {
                                    true => t!("update-working"),
                                    false => t!("update-now"),
                                })
                                .on_click(cx.listener(move |_, _, _, cx| {
                                    updates.update(cx, |updates, cx| updates.install(cx));
                                })),
                        )
                    }),
            )
    }
}
