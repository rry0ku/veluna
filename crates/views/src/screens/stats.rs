use std::time::Duration;

use gpui::prelude::*;
use gpui::{
    AnyElement, App, Context, Entity, FontWeight, Pixels, Render, ScrollHandle,
    Window, div, px,
};
use state::{Playback, Veluna, Stats};
use ui::{ActiveTheme as _, Button, Fact, InfoCard, Scrollbar, Scroller, clock};

use crate::chrome::{Toolbar, Tooled};
use crate::shared::cells;
use crate::shared::hero::{HeroMetaStrip, PageHero};

pub(crate) struct StatsView {
    stats: Entity<Stats>,
    _playback: Entity<Playback>,
    scrollbar: Entity<Scrollbar>,
    toolbar: Entity<Toolbar>,
    width: Pixels,
}

impl StatsView {
    pub(crate) fn new(
        playback: Entity<Playback>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let stats = Veluna::global(cx).stats.clone();
        let width = cells::content_width(window, Pixels::ZERO, cx);
        let id = cx.entity_id();
        let scrollbar = cx.new(|_| Scrollbar::new(ScrollHandle::new()).watching(id));
        let toolbar = cx.new(Toolbar::new);

        cx.observe(&stats, |_, _, cx| {
            cx.notify();
        })
        .detach();

        Self {
            stats,
            _playback: playback,
            scrollbar,
            toolbar,
            width,
        }
    }

    pub(crate) fn refresh(&mut self, cx: &mut Context<Self>) {
        self.stats.update(cx, |stats, cx| stats.refresh(cx));
    }

    fn header(&self, cx: &mut Context<Self>) -> AnyElement {
        let (total_plays, total_secs) = {
            let stats = self.stats.read(cx);
            (stats.total_plays(), stats.total_seconds())
        };

        let hours = total_secs / 3600;
        let mins = (total_secs % 3600) / 60;
        let time_str = if hours > 0 {
            format!("{hours}h {mins}m")
        } else {
            format!("{mins}m")
        };

        let strip = HeroMetaStrip::new()
            .text(format!("{total_plays} plays"))
            .text(time_str);

        PageHero::new("stats-hero", "Listening Analytics")
            .fallback("icons/sliders-horizontal.svg")
            .accent()
            .eyebrow("Stats")
            .meta(strip)
            .actions(
                div().flex().items_center().child(
                    Button::new("refresh-stats")
                        .outline()
                        .icon("icons/refresh-cw.svg")
                        .label("Refresh")
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.refresh(cx);
                        })),
                ),
            )
            .into_any_element()
    }

    fn summary_cards(&self, cx: &Context<Self>) -> impl IntoElement {
        let stats = self.stats.read(cx);
        let total_plays = stats.total_plays();
        let total_secs = stats.total_seconds();
        let top_artist = stats.top_artists().first().map(|a| a.name.as_str()).unwrap_or("None");

        let hours = total_secs / 3600;
        let mins = (total_secs % 3600) / 60;
        let time_formatted = format!("{hours}h {mins}m");

        let days_count = stats.daily_activity().len().max(1) as u64;
        let daily_avg = total_plays / days_count;

        div()
            .w_full()
            .grid()
            .grid_cols(2)
            .gap_4()
            .child(
                InfoCard::new("All-time Metrics")
                    .child(Fact::new("Total Listening Time", time_formatted))
                    .child(Fact::new("Total Streams", total_plays.to_string())),
            )
            .child(
                InfoCard::new("Habits & Highlights")
                    .child(Fact::new("Top Artist", top_artist))
                    .child(Fact::new("Daily Average", format!("{daily_avg} tracks"))),
            )
    }

    fn daily_chart(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = *cx.theme();
        let stats = self.stats.read(cx);
        let activity = stats.daily_activity();

        if activity.is_empty() {
            return div().into_any_element();
        }

        let max_secs = activity.iter().map(|d| d.total_secs).max().unwrap_or(1).max(1) as f32;

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
                    .flex()
                    .justify_between()
                    .items_center()
                    .child(div().text_sm().font_weight(FontWeight::SEMIBOLD).child("Daily Activity (Last 14 Days)"))
                    .child(div().text_xs().text_color(theme.muted_foreground).child("Listening time")),
            )
            .child(
                div()
                    .w_full()
                    .h(px(90.0))
                    .flex()
                    .items_end()
                    .gap_2()
                    .pt_2()
                    .children(activity.iter().take(14).map(|day| {
                        let height_pct = ((day.total_secs as f32 / max_secs) * 100.0).clamp(6.0, 100.0);
                        let date_short = day.date.split('-').skip(1).collect::<Vec<_>>().join("/");

                        div()
                            .flex_1()
                            .flex()
                            .flex_col()
                            .items_center()
                            .gap_1()
                            .h_full()
                            .justify_end()
                            .child(
                                div()
                                    .w_full()
                                    .h(gpui::relative(height_pct / 100.0))
                                    .bg(theme.primary)
                                    .rounded_t_sm(),
                            )
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(theme.muted_foreground)
                                    .child(date_short),
                            )
                    })),
            )
            .into_any_element()
    }

    fn top_tracks_section(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = *cx.theme();
        let stats = self.stats.read(cx);
        let tracks = stats.top_tracks();

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
                    .child("Top Tracks"),
            )
            .child(
                div()
                    .w_full()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .children(tracks.iter().enumerate().map(|(idx, track)| {
                        let rank = idx + 1;
                        let duration = Duration::from_secs(track.total_secs);
                        let time_str = clock(duration);

                        div()
                            .w_full()
                            .flex()
                            .items_center()
                            .justify_between()
                            .py_1p5()
                            .px_2()
                            .rounded(theme.radius)
                            .hover(|s| s.bg(theme.secondary_hover))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap_3()
                                    .child(
                                        div()
                                            .w(px(20.0))
                                            .text_xs()
                                            .font_weight(FontWeight::BOLD)
                                            .text_color(theme.muted_foreground)
                                            .child(format!("{rank}")),
                                    )
                                    .child(
                                        div()
                                            .flex()
                                            .flex_col()
                                            .child(div().text_sm().font_weight(FontWeight::MEDIUM).child(track.title.clone()))
                                            .child(div().text_xs().text_color(theme.muted_foreground).child(track.artist.clone())),
                                    ),
                            )
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap_4()
                                    .child(
                                        div()
                                            .text_xs()
                                            .text_color(theme.muted_foreground)
                                            .child(format!("{} plays", track.play_count)),
                                    )
                                    .child(
                                        div()
                                            .text_xs()
                                            .font_weight(FontWeight::MEDIUM)
                                            .child(time_str),
                                    ),
                            )
                    })),
            )
    }

    fn top_artists_section(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = *cx.theme();
        let stats = self.stats.read(cx);
        let artists = stats.top_artists();

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
                    .child("Top Artists"),
            )
            .child(
                div()
                    .w_full()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .children(artists.iter().enumerate().map(|(idx, artist)| {
                        let rank = idx + 1;
                        let duration = Duration::from_secs(artist.total_secs);
                        let time_str = clock(duration);

                        div()
                            .w_full()
                            .flex()
                            .items_center()
                            .justify_between()
                            .py_1p5()
                            .px_2()
                            .rounded(theme.radius)
                            .hover(|s| s.bg(theme.secondary_hover))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap_3()
                                    .child(
                                        div()
                                            .w(px(20.0))
                                            .text_xs()
                                            .font_weight(FontWeight::BOLD)
                                            .text_color(theme.muted_foreground)
                                            .child(format!("{rank}")),
                                    )
                                    .child(div().text_sm().font_weight(FontWeight::MEDIUM).child(artist.name.clone())),
                            )
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap_4()
                                    .child(
                                        div()
                                            .text_xs()
                                            .text_color(theme.muted_foreground)
                                            .child(format!("{} plays", artist.play_count)),
                                    )
                                    .child(
                                        div()
                                            .text_xs()
                                            .font_weight(FontWeight::MEDIUM)
                                            .child(time_str),
                                    ),
                            )
                    })),
            )
    }
}

impl Render for StatsView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let inset = cx.theme().metrics.inset;
        let width = cells::content_width(window, Pixels::ZERO, cx);
        if (width - self.width).abs() >= gpui::px(0.5) {
            self.width = width;
        }

        let page = Scroller::new("stats-page", &self.scrollbar)
            .pt(inset)
            .pb(inset)
            .child(
                div()
                    .px(inset)
                    .flex()
                    .flex_col()
                    .gap_6()
                    .child(self.header(cx))
                    .child(self.summary_cards(cx))
                    .child(self.daily_chart(cx))
                    .child(
                        div()
                            .w_full()
                            .grid()
                            .grid_cols(2)
                            .gap_4()
                            .child(self.top_tracks_section(cx))
                            .child(self.top_artists_section(cx)),
                    ),
            );

        div().size_full().child(page)
    }
}

impl Tooled for StatsView {
    fn toolbar(&self) -> Entity<Toolbar> {
        self.toolbar.clone()
    }

    fn tools(&self, _cx: &App) -> Vec<AnyElement> {
        Vec::new()
    }
}
