use std::time::Duration;

use gpui::SharedString;

pub fn clock(value: Duration) -> SharedString {
    let total = value.as_secs();
    let hours = total / 3600;
    let minutes = total % 3600 / 60;
    let seconds = total % 60;
    match hours {
        0 => SharedString::from(format!("{minutes}:{seconds:02}")),
        _ => SharedString::from(format!("{hours}:{minutes:02}:{seconds:02}")),
    }
}
