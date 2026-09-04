use std::cell::Cell as Slot;
use std::rc::Rc;
use std::time::Duration;

use gpui::prelude::*;
use gpui::{
    AnyWindowHandle, App, Context, DragMoveEvent, Empty, EntityId, ListState, MouseButton,
    MouseDownEvent, Pixels, Render, ScrollHandle, SpringConfig, Task, Window, div, point, px,
};

use crate::glide::Glide;
use crate::theme::ActiveTheme as _;

const BAR: Pixels = px(6.);
const REACH: Pixels = px(2.);
const THUMB_INSET: Pixels = px(4.);
const REACHED: Pixels = px(0.5);
const MIN_THUMB: Pixels = px(24.);
const TRACK_INSET: Pixels = px(4.);
const LINGER: Duration = Duration::from_secs(2);
const IDLE: f32 = 0.;
const RESTING: f32 = 0.35;
const ACTIVE: f32 = 0.55;

type HoverGuard = Rc<dyn Fn(bool, AnyWindowHandle, &mut App)>;
type ScrollGuard = Rc<dyn Fn(Pixels, &mut App) -> Option<Pixels>>;

#[derive(Clone)]
enum Target {
    Area(ScrollHandle),
    List(ListState),
}

impl Target {
    fn top(&self) -> Pixels {
        match self {
            Self::Area(scroll) => scroll.bounds().origin.y,
            Self::List(scroll) => scroll.viewport_bounds().origin.y,
        }
    }

    fn viewport(&self) -> Pixels {
        match self {
            Self::Area(scroll) => scroll.bounds().size.height,
            Self::List(scroll) => scroll.viewport_bounds().size.height,
        }
    }

    fn hidden(&self) -> Pixels {
        match self {
            Self::Area(scroll) => scroll.max_offset().y,
            Self::List(scroll) => scroll.max_offset_for_scrollbar().y,
        }
    }

    fn offset(&self) -> Pixels {
        match self {
            Self::Area(scroll) => scrolled(scroll),
            Self::List(scroll) => (-scroll.scroll_px_offset_for_scrollbar().y)
                .clamp(Pixels::ZERO, scroll.max_offset_for_scrollbar().y),
        }
    }

    fn set_offset(&self, offset: Pixels) {
        let point = point(Pixels::ZERO, -offset);
        match self {
            Self::Area(scroll) => scroll.set_offset(point),
            Self::List(scroll) => scroll.set_offset_from_scrollbar(point),
        }
    }

    fn drag_started(&self) {
        if let Self::List(scroll) = self {
            scroll.scrollbar_drag_started();
        }
    }

    fn drag_ended(&self) {
        if let Self::List(scroll) = self {
            scroll.scrollbar_drag_ended();
        }
    }
}

#[derive(Clone)]
struct Grab {
    owner: EntityId,
    start: Slot<Pixels>,
    offset: Slot<Pixels>,
}

impl Render for Grab {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        Empty
    }
}

pub fn scrolled(scroll: &ScrollHandle) -> Pixels {
    (-scroll.offset().y).clamp(Pixels::ZERO, scroll.max_offset().y)
}

pub fn quantize(scroll: &ScrollHandle, window: &Window) {
    let offset = scroll.offset();
    let snapped = crate::metrics::snapped(offset.y, window);
    if snapped != offset.y {
        scroll.set_offset(point(offset.x, snapped));
    }
}

pub struct Scrollbar {
    scroll: ScrollHandle,
    list: Option<ListState>,
    seen: Pixels,
    awake: bool,
    hovered: bool,
    always_visible: bool,
    track_inset: Pixels,
    maximum: Option<Pixels>,
    hover_guard: Option<HoverGuard>,
    scroll_guard: Option<ScrollGuard>,
    linger: Option<Task<()>>,
    glide: Glide,
    following: bool,
    nudges: u64,
}

impl Scrollbar {
    pub fn new(scroll: ScrollHandle) -> Self {
        Self {
            scroll,
            list: None,
            seen: Pixels::ZERO,
            awake: false,
            hovered: false,
            always_visible: false,
            track_inset: Pixels::ZERO,
            maximum: None,
            hover_guard: None,
            scroll_guard: None,
            linger: None,
            glide: Glide::default(),
            following: false,
            nudges: 0,
        }
    }

    pub fn inset() -> Self {
        Self::new(ScrollHandle::new())
            .always_visible()
            .track_inset(TRACK_INSET)
    }

    pub fn list(list: ListState) -> Self {
        let mut scrollbar = Self::new(ScrollHandle::new());
        scrollbar.list = Some(list);
        scrollbar
    }

    pub fn always_visible(mut self) -> Self {
        self.always_visible = true;
        self
    }

    pub fn paced(mut self, pace: f32) -> Self {
        self.glide.set_pace(pace);
        self
    }

    pub fn spring(mut self, spring: SpringConfig) -> Self {
        self.glide.set_spring(spring);
        self
    }

    pub fn watching(mut self, view: EntityId) -> Self {
        self.glide.watch(view);
        self
    }

    pub fn track_inset(mut self, inset: Pixels) -> Self {
        self.track_inset = inset;
        self
    }

    pub fn remember_offset(&mut self, offset: Pixels) {
        self.seen = offset;
    }

    pub fn nudges(&self) -> u64 {
        self.nudges
    }

    /// Records that the reader moved the view themselves. A precise scroll needs
    /// no smoothing, but it is still theirs, and anything following the view has
    /// to know to stop.
    pub fn stirred(&mut self) {
        if self.glide.stop_spring(&self.scroll) {
            self.following = false;
        }
        self.nudges = self.nudges.wrapping_add(1);
    }

    pub fn nudge(&mut self, window: &mut Window) {
        self.following = false;
        self.nudges = self.nudges.wrapping_add(1);
        self.glide.nudge(&self.scroll, window);
    }

    pub fn aim(&mut self, to: Pixels, window: &mut Window) {
        let across = self.scroll.offset().x;
        self.glide.aim(&self.scroll, point(across, to), window);
        self.following = true;
    }

    pub fn place(&mut self, at: Pixels) {
        let across = self.scroll.offset().x;
        self.glide.jump(&self.scroll, point(across, at));
        self.seen = self.scroll.offset().y;
        self.following = true;
    }

    pub fn goal(&self) -> Pixels {
        self.glide.goal(&self.scroll).y
    }

    pub fn presentation(&self) -> gpui::Point<Pixels> {
        self.glide.presentation(&self.scroll)
    }

    pub fn sync(&self) {
        self.glide.sync(&self.scroll);
    }

    pub fn scroll(&self) -> &ScrollHandle {
        &self.scroll
    }

    pub fn on_scroll(
        mut self,
        guard: impl Fn(Pixels, &mut App) -> Option<Pixels> + 'static,
    ) -> Self {
        self.scroll_guard = Some(Rc::new(guard));
        self
    }

    pub fn set_max_offset(&mut self, maximum: Option<Pixels>, cx: &mut Context<Self>) -> bool {
        let maximum = maximum.map(|maximum| maximum.max(Pixels::ZERO));
        if self.maximum == maximum {
            return false;
        }
        self.maximum = maximum;
        cx.notify();
        true
    }

    fn target(&self) -> Target {
        self.list.as_ref().map_or_else(
            || Target::Area(self.scroll.clone()),
            |list| Target::List(list.clone()),
        )
    }

    pub(crate) fn set_hover_guard(
        &mut self,
        guard: impl Fn(bool, AnyWindowHandle, &mut App) + 'static,
    ) {
        self.hover_guard = Some(Rc::new(guard));
    }

    fn wake(&mut self, cx: &mut Context<Self>) {
        self.awake = true;
        cx.notify();
        self.linger = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(LINGER).await;
            this.update(cx, |this, cx| {
                this.awake = false;
                cx.notify();
            })
            .ok();
        }));
    }

    fn moved(&mut self, offset: Pixels, cx: &mut Context<Self>) {
        if self.glide.stop_spring(&self.scroll) {
            self.following = false;
        }
        self.nudges = self.nudges.wrapping_add(1);
        if let Some(maximum) = self
            .scroll_guard
            .as_ref()
            .and_then(|guard| guard(offset, cx))
        {
            self.maximum = Some(maximum.max(Pixels::ZERO));
        }
        self.wake(cx);
    }
}

impl Render for Scrollbar {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let target = self.target();
        let viewport = target.viewport();
        let hidden = self.maximum.unwrap_or_else(|| target.hidden());
        let offset = target.offset().min(hidden);

        if self.following && (self.glide.goal(&self.scroll).y - offset).abs() < REACHED {
            self.following = false;
        }
        if offset != self.seen {
            self.seen = offset;
            if !self.following {
                self.wake(cx);
            }
        }

        if viewport <= Pixels::ZERO || hidden <= Pixels::ZERO {
            return div().into_any_element();
        }

        let theme = *cx.theme();
        let content = viewport + hidden;
        let progress = (offset / hidden).clamp(0., 1.);
        let track = (viewport - self.track_inset * 2.).max(Pixels::ZERO);
        let thumb = (track * (viewport / content)).max(MIN_THUMB).min(track);
        let travel = track - thumb;
        let resting = match self.always_visible || self.awake || self.hovered {
            true => RESTING,
            false => IDLE,
        };

        let jump = target.clone();
        let drag = target.clone();
        let started = target.clone();
        let released = target;
        let owner = cx.entity_id();
        let hover_guard = self.hover_guard.clone();

        div()
            .id("scrollbar")
            .occlude()
            .absolute()
            .top(self.track_inset)
            .right(-REACH)
            .w(BAR + REACH)
            .h(track)
            .on_hover(cx.listener(move |this, hovered: &bool, window, cx| {
                this.hovered = *hovered;
                this.wake(cx);
                if let Some(guard) = hover_guard.as_ref() {
                    guard(*hovered, window.window_handle(), cx);
                }
            }))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                    let local = event.position.y - jump.top() - this.track_inset - thumb / 2.;
                    let fraction = (local / travel).clamp(0., 1.);
                    let offset = hidden * fraction;
                    jump.set_offset(offset);
                    this.moved(offset, cx);
                }),
            )
            .child(
                div()
                    .id("scrollbar-thumb")
                    .absolute()
                    .top(travel * progress)
                    .right(THUMB_INSET + REACH)
                    .w(BAR)
                    .h(thumb)
                    .rounded_full()
                    .bg(theme.muted_foreground.opacity(resting))
                    .hover(move |style| style.bg(theme.muted_foreground.opacity(ACTIVE)))
                    .cursor_pointer()
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |this, _: &MouseDownEvent, _, cx| {
                            started.drag_started();
                            this.wake(cx);
                            cx.stop_propagation();
                        }),
                    )
                    .on_mouse_up(
                        MouseButton::Left,
                        cx.listener({
                            let released = released.clone();
                            move |_, _, _, _| released.drag_ended()
                        }),
                    )
                    .on_mouse_up_out(
                        MouseButton::Left,
                        cx.listener(move |_, _, _, _| released.drag_ended()),
                    )
                    .on_drag(
                        Grab {
                            owner,
                            start: Slot::new(Pixels::ZERO),
                            offset: Slot::new(offset),
                        },
                        |grab, _, window, cx| {
                            grab.start.set(window.mouse_position().y);
                            cx.new(|_| grab.clone())
                        },
                    )
                    .on_drag_move(
                        cx.listener(move |this, event: &DragMoveEvent<Grab>, _, cx| {
                            let (start, base) = {
                                let grab = event.drag(cx);
                                if grab.owner != owner {
                                    return;
                                }
                                (grab.start.get(), grab.offset.get())
                            };
                            let moved = event.event.position.y - start;
                            let scrolled = base + moved * (hidden / travel);
                            let clamped = scrolled.clamp(Pixels::ZERO, hidden);
                            drag.set_offset(clamped);
                            this.moved(clamped, cx);
                        }),
                    ),
            )
            .into_any_element()
    }
}
