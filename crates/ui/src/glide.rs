use std::cell::RefCell;
use std::rc::Rc;
use std::time::{Duration, Instant};

use gpui::{
    App, EntityId, Pixels, Point, ScrollHandle, SpringConfig, SpringState, Window, point, px,
};

use crate::snapped;

const EASE: f32 = 0.12;
const HERTZ: f32 = 180.;
const STALL: Duration = Duration::from_millis(64);
const REST: Pixels = px(0.5);
const SPRING_REST: Pixels = px(0.05);

#[derive(Default)]
struct Drift {
    shown: Point<Pixels>,
    target: Point<Pixels>,
    velocity: Point<f32>,
    gliding: bool,
    springing: bool,
    armed: bool,
    eased: Option<f32>,
    beat: Option<Instant>,
}

#[derive(Clone)]
pub struct Glide {
    drift: Rc<RefCell<Drift>>,
    pace: f32,
    spring: Option<SpringConfig>,
    watched: Option<EntityId>,
}

impl Default for Glide {
    fn default() -> Self {
        Self::paced(EASE)
    }
}

impl Glide {
    pub fn paced(pace: f32) -> Self {
        Self {
            drift: Rc::default(),
            pace,
            spring: None,
            watched: None,
        }
    }

    pub fn set_pace(&mut self, pace: f32) {
        self.pace = pace;
    }

    pub fn set_spring(&mut self, spring: SpringConfig) {
        self.spring = Some(spring);
    }

    pub fn watch(&mut self, view: EntityId) {
        self.watched = Some(view);
    }

    pub fn sync(&self, scroll: &ScrollHandle) {
        let mut drift = self.drift.borrow_mut();
        if !drift.gliding {
            drift.shown = scroll.offset();
            drift.velocity = Point::default();
        }
    }

    pub fn nudge(&self, scroll: &ScrollHandle, window: &mut Window) {
        {
            let mut drift = self.drift.borrow_mut();
            let landed = scroll.offset();
            let step = landed - drift.shown;
            let from = match drift.gliding {
                true => drift.target,
                false => drift.shown,
            };

            drift.target = held(from + step, scroll);
            drift.gliding = true;
            drift.springing = false;
            drift.velocity = Point::default();
            drift.eased = None;
            scroll.set_offset(drift.shown);
        }
        self.schedule_frame(scroll, window);
    }

    pub fn aim(&self, scroll: &ScrollHandle, to: Point<Pixels>, window: &mut Window) {
        {
            let mut drift = self.drift.borrow_mut();
            if !drift.gliding {
                drift.shown = scroll.offset();
            }
            drift.target = held(to, scroll);
            drift.gliding = true;
            let springing = self.spring.is_some();
            if drift.springing != springing {
                drift.velocity = Point::default();
            }
            drift.springing = springing;
            drift.eased = Some(self.pace);
        }
        self.schedule_frame(scroll, window);
    }

    pub fn jump(&self, scroll: &ScrollHandle, to: Point<Pixels>) {
        let landed = {
            let mut drift = self.drift.borrow_mut();
            drift.target = held(to, scroll);
            drift.shown = drift.target;
            drift.gliding = false;
            drift.springing = false;
            drift.velocity = Point::default();
            drift.beat = None;
            drift.eased = None;
            drift.shown
        };
        scroll.set_offset(landed);
    }

    pub fn stop_spring(&self, scroll: &ScrollHandle) -> bool {
        let mut drift = self.drift.borrow_mut();
        if !drift.springing {
            return false;
        }
        drift.shown = scroll.offset();
        drift.target = drift.shown;
        drift.velocity = Point::default();
        drift.gliding = false;
        drift.springing = false;
        drift.beat = None;
        drift.eased = None;
        true
    }

    pub fn goal(&self, scroll: &ScrollHandle) -> Point<Pixels> {
        let drift = self.drift.borrow();

        match drift.gliding {
            true => drift.target,
            false => scroll.offset(),
        }
    }

    pub fn presentation(&self, scroll: &ScrollHandle) -> Point<Pixels> {
        let drift = self.drift.borrow();

        match drift.gliding && drift.springing {
            true => drift.shown - scroll.offset(),
            false => Point::default(),
        }
    }

    fn schedule_frame(&self, scroll: &ScrollHandle, window: &mut Window) {
        {
            let mut drift = self.drift.borrow_mut();
            if drift.armed {
                return;
            }
            drift.armed = true;
        }

        let glide = self.clone();
        let scroll = scroll.clone();
        window.on_next_frame(move |window, cx| glide.step(&scroll, window, cx));
    }

    fn step(&self, scroll: &ScrollHandle, window: &mut Window, cx: &mut App) {
        let landed = {
            let mut drift = self.drift.borrow_mut();
            drift.armed = false;
            if !drift.gliding {
                return;
            }

            let now = Instant::now();
            let elapsed = drift
                .beat
                .replace(now)
                .map(|beat| now.duration_since(beat).min(STALL))
                .unwrap_or(Duration::from_secs_f32(1. / HERTZ));
            let target = held(drift.target, scroll);
            let springing = drift.springing;
            let settled = if springing {
                let spring = self.spring.expect("a springing glide has a spring");
                let x = spring.step(
                    SpringState {
                        position: drift.shown.x.as_f32(),
                        velocity: drift.velocity.x,
                    },
                    target.x.as_f32(),
                    elapsed.as_secs_f32(),
                );
                let y = spring.step(
                    SpringState {
                        position: drift.shown.y.as_f32(),
                        velocity: drift.velocity.y,
                    },
                    target.y.as_f32(),
                    elapsed.as_secs_f32(),
                );
                drift.shown = point(px(x.position), px(y.position));
                drift.velocity = point(x.velocity, y.velocity);
                spring.is_settled(x, target.x.as_f32(), SPRING_REST.as_f32())
                    && spring.is_settled(y, target.y.as_f32(), SPRING_REST.as_f32())
            } else {
                let pace = drift.eased.unwrap_or(EASE);
                let ease = 1. - (1. - pace).powf(elapsed.as_secs_f32() * HERTZ);
                let step = target - drift.shown;
                drift.shown += point(step.x * ease, step.y * ease);
                step.x.abs() < REST && step.y.abs() < REST
            };
            match settled {
                true => {
                    drift.shown = target;
                    drift.gliding = false;
                    drift.springing = false;
                    drift.velocity = Point::default();
                    drift.beat = None;
                    drift.eased = None;
                    target
                }
                // layout walks the pixel grid
                false => match springing {
                    true => grid(held(drift.shown, scroll), window),
                    false => held(drift.shown, scroll),
                },
            }
        };

        scroll.set_offset(landed);
        match self.watched {
            Some(view) => cx.notify(view),
            None => window.refresh(),
        }
        self.schedule_frame(scroll, window);
    }
}

fn grid(at: Point<Pixels>, window: &Window) -> Point<Pixels> {
    point(snapped(at.x, window), snapped(at.y, window))
}

fn held(at: Point<Pixels>, scroll: &ScrollHandle) -> Point<Pixels> {
    let reach = scroll.max_offset();

    point(
        at.x.clamp(-reach.x.max(Pixels::ZERO), Pixels::ZERO),
        at.y.clamp(-reach.y.max(Pixels::ZERO), Pixels::ZERO),
    )
}
