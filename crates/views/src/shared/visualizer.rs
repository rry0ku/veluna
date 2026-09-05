use std::cell::RefCell;
use std::rc::Rc;

use gpui::{App, EntityId, Window};
use music::Spectrum;

const EASE: f32 = 0.35;

#[derive(Default)]
struct State {
    shown: Vec<f32>,
    armed: bool,
    visible: bool,
    spectrum: Option<Spectrum>,
}

#[derive(Clone, Default)]
pub struct VisualizerDrive {
    state: Rc<RefCell<State>>,
}

impl VisualizerDrive {
    pub fn levels(&self) -> Vec<f32> {
        self.state.borrow().shown.clone()
    }

    pub fn show(&self, watch: EntityId, spectrum: Spectrum, window: &mut Window) {
        let mut state = self.state.borrow_mut();
        state.visible = true;
        state.spectrum = Some(spectrum);
        if state.armed {
            return;
        }
        state.armed = true;
        drop(state);

        let drive = self.clone();
        window.on_next_frame(move |window, cx| drive.step(watch, window, cx));
    }

    pub fn hide(&self) {
        let mut state = self.state.borrow_mut();
        state.visible = false;
        state.spectrum = None;
    }

    fn step(&self, watch: EntityId, window: &mut Window, cx: &mut App) {
        {
            let mut state = self.state.borrow_mut();
            if !state.visible {
                state.armed = false;
                return;
            }

            let Some(spectrum) = state.spectrum.clone() else {
                state.armed = false;
                return;
            };

            let target = spectrum.bands();
            if state.shown.len() != target.len() {
                state.shown = target.clone();
            }
            for (shown, target) in state.shown.iter_mut().zip(&target) {
                *shown += (target - *shown) * EASE;
            }
        }

        cx.notify(watch);
        let drive = self.clone();
        window.on_next_frame(move |window, cx| drive.step(watch, window, cx));
    }
}
