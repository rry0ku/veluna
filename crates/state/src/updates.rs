use anyhow::{Context as _, Result};
use gpui::{Context, Entity, Task};
use serde::Deserialize;

use crate::{AppSettings, Io, Outcome, Toasts, join};

const LATEST: &str = "https://api.github.com/repos/rry0ku/veluna/releases/latest";
const RUNNING: &str = env!("CARGO_PKG_VERSION");
const AGENT: &str = concat!(
    "veluna/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/rry0ku/veluna)"
);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Release {
    pub version: String,
    pub page: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UpdateState {
    Quiet,
    Offered(Release),
}

pub struct Updates {
    state: UpdateState,
    settings: Entity<AppSettings>,
    http: reqwest::Client,
    io: Io,
    checking: bool,
    task: Option<Task<()>>,
}

impl Updates {
    pub fn new(settings: Entity<AppSettings>, io: Io, cx: &mut Context<Self>) -> Self {
        let mut updates = Self {
            state: UpdateState::Quiet,
            settings,
            http: reqwest::Client::new(),
            io,
            checking: false,
            task: None,
        };
        updates.check_on_startup(cx);
        updates
    }

    pub fn state(&self) -> &UpdateState {
        &self.state
    }

    pub fn offered(&self) -> Option<&Release> {
        match &self.state {
            UpdateState::Offered(release) => Some(release),
            _ => None,
        }
    }

    pub fn is_checking(&self) -> bool {
        self.checking
    }

    pub fn dismiss(&mut self, cx: &mut Context<Self>) {
        self.task = None;
        self.state = UpdateState::Quiet;
        cx.notify();
    }

    pub fn check_on_startup(&mut self, cx: &mut Context<Self>) {
        self.query(false, cx);
    }

    pub fn check_now(&mut self, cx: &mut Context<Self>) {
        self.query(true, cx);
    }

    fn query(&mut self, manual: bool, cx: &mut Context<Self>) {
        if !manual && !self.settings.read(cx).check_updates() {
            return;
        }
        if self.checking {
            return;
        }
        self.checking = true;
        cx.notify();

        let http = self.http.clone();
        let io = self.io.clone();
        self.task = Some(cx.spawn(async move |this, cx| {
            let found = join(io.spawn(async move { latest(&http).await })).await;
            this.update(cx, |this, cx| {
                this.checking = false;
                this.task = None;
                match found {
                    Ok(Some(release)) => {
                        let version = release.version.clone();
                        this.state = UpdateState::Offered(release);
                        if manual {
                            Toasts::about(
                                Outcome::Done,
                                "toast-update-available",
                                version,
                                cx,
                            );
                        }
                    }
                    Ok(None) => {
                        if manual {
                            Toasts::show(Outcome::Done, "toast-update-up-to-date", cx);
                        }
                    }
                    Err(error) => {
                        log::warn!("updates: cannot ask github: {error:#}");
                        if manual {
                            Toasts::show(Outcome::Failed, "toast-update-failed", cx);
                        }
                    }
                }
                cx.notify();
            })
            .ok();
        }));
    }
}

#[derive(Deserialize)]
struct Published {
    tag_name: String,
    html_url: String,
}

async fn latest(http: &reqwest::Client) -> Result<Option<Release>> {
    let published: Published = http
        .get(LATEST)
        .header("User-Agent", AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .context("cannot reach github")?
        .error_for_status()
        .context("github refused the release request")?
        .json()
        .await
        .context("cannot read the github release")?;

    let offered_version = published.tag_name.trim_start_matches('v').trim();
    let running_version = RUNNING.trim_start_matches('v').trim();
    if !newer(offered_version, running_version) {
        return Ok(None);
    }

    Ok(Some(Release {
        version: format!("v{}", offered_version),
        page: published.html_url,
    }))
}

fn newer(offered: &str, running: &str) -> bool {
    let offered = offered.trim_start_matches('v').trim();
    let running = running.trim_start_matches('v').trim();
    match (numbered(offered), numbered(running)) {
        (Some(o), Some(r)) => o != r,
        _ => offered != running,
    }
}

fn numbered(version: &str) -> Option<(u64, u64, u64)> {
    let core = version.trim().split(['-', '+']).next()?;
    let mut parts = core.split('.').map(|part| part.parse::<u64>().ok());
    Some((parts.next()??, parts.next()??, parts.next()??))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_newer_version() {
        assert!(newer("0.1.7", "0.1.6"));
        assert!(newer("0.2.0", "0.1.6"));
        assert!(newer("1.0.0", "0.1.6"));
        assert!(!newer("0.1.6", "0.1.6"));
        assert!(newer("0.1.5", "0.1.6"));
    }

    #[test]
    fn parses_version_numbers() {
        assert_eq!(numbered("0.1.6"), Some((0, 1, 6)));
        assert_eq!(numbered("1.2.3-beta.1"), Some((1, 2, 3)));
        assert_eq!(numbered("invalid"), None);
    }
}
