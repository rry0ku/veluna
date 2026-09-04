pub(crate) mod fullscreen;
pub(crate) mod workspace;

use gpui::{AnyView, App};

use crate::chrome::TitleBarOptions;

pub(crate) trait Shell {
    fn title_bar(&self, content: Option<AnyView>, cx: &App) -> TitleBarOptions;
}
