use std::process::Command;

use gpui::prelude::*;
use gpui::{
    AnyElement, App, Context, Entity, FontWeight, Pixels, Render, ScrollHandle,
    Window, div, px,
};
use state::{AppSettings, Downloads, Playback, Veluna};
use ui::{ActiveTheme as _, Button, Scrollbar, Scroller, vacant};

use crate::chrome::{Toolbar, Tooled};
use crate::shared::cells;
use crate::shared::hero::{HeroMetaStrip, PageHero};

pub(crate) struct DownloadsView {
    downloads: Entity<Downloads>,
    settings: Entity<AppSettings>,
    _playback: Entity<Playback>,
    scrollbar: Entity<Scrollbar>,
    toolbar: Entity<Toolbar>,
    width: Pixels,
}

impl DownloadsView {
    pub(crate) fn new(
        playback: Entity<Playback>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let downloads = Veluna::global(cx).downloads.clone();
        let settings = Veluna::global(cx).settings.clone();
        let width = cells::content_width(window, Pixels::ZERO, cx);
        let id = cx.entity_id();
        let scrollbar = cx.new(|_| Scrollbar::new(ScrollHandle::new()).watching(id));
        let toolbar = cx.new(Toolbar::new);

        cx.observe(&downloads, |_, _, cx| {
            cx.notify();
        })
        .detach();

        Self {
            downloads,
            settings,
            _playback: playback,
            scrollbar,
            toolbar,
            width,
        }
    }

    fn open_folder(&self, cx: &App) {
        let dir = self.settings.read(cx).download_dir().unwrap_or_else(|| {
            dirs::audio_dir()
                .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Music"))
                .join("Veluna")
        });
        std::fs::create_dir_all(&dir).ok();
        #[cfg(target_os = "linux")]
        {
            Command::new("xdg-open").arg(&dir).spawn().ok();
        }
        #[cfg(target_os = "macos")]
        {
            Command::new("open").arg(&dir).spawn().ok();
        }
        #[cfg(target_os = "windows")]
        {
            Command::new("explorer").arg(&dir).spawn().ok();
        }
    }

    fn header(&self, cx: &mut Context<Self>) -> AnyElement {
        let (active_count, completed_count) = {
            let dl = self.downloads.read(cx);
            (dl.active().len(), dl.completed().len())
        };

        let strip = HeroMetaStrip::new()
            .text(format!("{active_count} active"))
            .text(format!("{completed_count} completed"));

        PageHero::new("downloads-hero", "Offline Downloads")
            .fallback("icons/arrow-up-down.svg")
            .accent()
            .eyebrow("Downloads")
            .meta(strip)
            .actions(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        Button::new("open-download-dir")
                            .outline()
                            .icon("icons/folder-plus.svg")
                            .label("Open Folder")
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.open_folder(cx);
                            })),
                    )
                    .child(
                        Button::new("clear-completed-dl")
                            .ghost()
                            .icon("icons/trash-2.svg")
                            .label("Clear Completed")
                            .disabled(completed_count == 0)
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.downloads.update(cx, |dl, cx| dl.clear_completed(cx));
                            })),
                    ),
            )
            .into_any_element()
    }

    fn active_section(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = *cx.theme();
        let downloads = self.downloads.read(cx);
        let active = downloads.active();

        if active.is_empty() {
            return div().into_any_element();
        }

        div()
            .w_full()
            .flex()
            .flex_col()
            .gap_2()
            .p_4()
            .rounded(theme.radius)
            .bg(theme.secondary.opacity(0.45))
            .border_1()
            .border_color(theme.border)
            .child(
                div()
                    .text_sm()
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(format!("Downloading ({})", active.len())),
            )
            .child(
                div()
                    .w_full()
                    .flex()
                    .flex_col()
                    .gap_3()
                    .children(active.iter().enumerate().map(|(index, item)| {
                        let url = item.url.clone();
                        let percent = item.percent.clamp(0.0, 100.0);
                        let status_text = format!("{} • {:.1}%", item.status, percent);

                        div()
                            .w_full()
                            .flex()
                            .flex_col()
                            .gap_2()
                            .p_3()
                            .rounded(theme.radius)
                            .bg(theme.background)
                            .border_1()
                            .border_color(theme.border)
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .child(
                                        div()
                                            .flex()
                                            .flex_col()
                                            .child(div().text_sm().font_weight(FontWeight::MEDIUM).child(item.title.clone()))
                                            .child(div().text_xs().text_color(theme.muted_foreground).child(item.artist.clone())),
                                    )
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .gap_3()
                                            .child(
                                                div()
                                                    .text_xs()
                                                    .text_color(theme.muted_foreground)
                                                    .child(status_text),
                                            )
                                            .child(
                                                Button::new(("cancel-dl", index))
                                                    .ghost()
                                                    .icon("icons/x.svg")
                                                    .on_click(cx.listener(move |this, _, _, cx| {
                                                        this.downloads.update(cx, |dl, cx| dl.cancel(&url, cx));
                                                    })),
                                            ),
                                    ),
                            )
                            .child(
                                div()
                                    .w_full()
                                    .h(px(4.0))
                                    .bg(theme.muted)
                                    .rounded_full()
                                    .child(
                                        div()
                                            .h_full()
                                            .w(gpui::relative(percent as f32 / 100.0))
                                            .bg(theme.primary)
                                            .rounded_full(),
                                    ),
                            )
                    })),
            )
            .into_any_element()
    }

    fn completed_section(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = *cx.theme();
        let downloads = self.downloads.read(cx);
        let completed = downloads.completed();

        if completed.is_empty() {
            return div().into_any_element();
        }

        div()
            .w_full()
            .flex()
            .flex_col()
            .gap_2()
            .p_4()
            .rounded(theme.radius)
            .bg(theme.secondary.opacity(0.45))
            .border_1()
            .border_color(theme.border)
            .child(
                div()
                    .text_sm()
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(format!("Completed ({})", completed.len())),
            )
            .child(
                div()
                    .w_full()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .children(completed.iter().rev().map(|item| {
                        let is_err = item.error.is_some();
                        let status_label = if let Some(ref err) = item.error {
                            format!("Failed: {err}")
                        } else {
                            "Downloaded".to_string()
                        };

                        div()
                            .w_full()
                            .flex()
                            .items_center()
                            .justify_between()
                            .py_2()
                            .px_3()
                            .rounded(theme.radius)
                            .hover(|s| s.bg(theme.secondary_hover))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .child(div().text_sm().font_weight(FontWeight::MEDIUM).child(item.title.clone()))
                                    .child(div().text_xs().text_color(theme.muted_foreground).child(item.artist.clone())),
                            )
                            .child(
                                div()
                                    .text_xs()
                                    .when(is_err, |this| this.text_color(theme.danger))
                                    .when(!is_err, |this| this.text_color(theme.muted_foreground))
                                    .child(status_label),
                            )
                    })),
            )
            .into_any_element()
    }
}

impl Render for DownloadsView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let inset = cx.theme().metrics.inset;
        let width = cells::content_width(window, Pixels::ZERO, cx);
        if (width - self.width).abs() >= gpui::px(0.5) {
            self.width = width;
        }

        let is_empty = {
            let dl = self.downloads.read(cx);
            dl.active().is_empty() && dl.completed().is_empty()
        };

        let page = Scroller::new("downloads-page", &self.scrollbar)
            .pt(inset)
            .pb(inset)
            .child(
                div()
                    .px(inset)
                    .flex()
                    .flex_col()
                    .gap_6()
                    .child(self.header(cx))
                    .child(self.active_section(cx))
                    .child(self.completed_section(cx))
                    .when(is_empty, |this| {
                        this.child(vacant("No downloads yet. Download tracks for offline listening!", cx))
                    }),
            );

        div().size_full().child(page)
    }
}

impl Tooled for DownloadsView {
    fn toolbar(&self) -> Entity<Toolbar> {
        self.toolbar.clone()
    }

    fn tools(&self, _cx: &App) -> Vec<AnyElement> {
        Vec::new()
    }
}
