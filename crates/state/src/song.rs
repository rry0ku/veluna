use std::collections::HashMap;
use std::sync::Arc;

use gpui::{Context, Entity, Task};
use music::{AlbumDetail, ArtistProfile, Track};
use tokio::task::AbortHandle;

use crate::catalog::SongPage;
use crate::{Io, Session, SessionEvent, join};

pub struct SongDetail {
    id: Option<String>,
    page: Option<Arc<SongPage>>,
    loading: bool,
    error: Option<String>,
    session: Entity<Session>,
    io: Io,
    task: Option<Task<()>>,
    request: Option<AbortHandle>,
}

impl SongDetail {
    pub fn new(session: Entity<Session>, io: Io, cx: &mut Context<Self>) -> Self {
        cx.subscribe(&session, |this, _, event, cx| match event {
            SessionEvent::SignedIn => {
                if let Some(id) = this.id.clone().filter(|id| !music::is_local_id(id)) {
                    this.clear();
                    this.open(&id, cx);
                }
            }
            SessionEvent::SignedOut => {
                this.clear();
                cx.notify();
            }
            SessionEvent::Reconnected => {}
            SessionEvent::LocalChanged => {
                if let Some(id) = this.id.clone().filter(|id| music::is_local_id(id)) {
                    this.clear();
                    this.open(&id, cx);
                }
            }
        })
        .detach();
        Self {
            id: None,
            page: None,
            loading: false,
            error: None,
            session,
            io,
            task: None,
            request: None,
        }
    }

    pub fn track(&self) -> Option<&Track> {
        self.page.as_ref().map(|page| &page.track)
    }
    pub fn album(&self) -> Option<&AlbumDetail> {
        self.page.as_ref()?.album.as_deref()
    }
    pub fn artist(&self) -> Option<&ArtistProfile> {
        self.page.as_ref()?.artist.as_deref()
    }
    pub fn portraits(&self) -> &HashMap<String, String> {
        self.page
            .as_ref()
            .map(|page| &page.portraits)
            .unwrap_or_else(|| empty_portraits())
    }
    pub fn playcount(&self) -> Option<u64> {
        self.page.as_ref().and_then(|page| page.playcount)
    }
    pub fn is_loading(&self) -> bool {
        self.loading
    }
    pub fn error(&self) -> Option<&str> {
        self.error.as_deref()
    }

    pub fn open(&mut self, id: &str, cx: &mut Context<Self>) {
        if self.id.as_deref() == Some(id) && (self.loading || self.page.is_some()) {
            return;
        }
        self.clear();
        self.id = Some(id.to_owned());
        let Some(catalog) = self.session.read(cx).catalog(id) else {
            cx.notify();
            return;
        };
        if let Some(page) = catalog.peek_song(id) {
            self.page = Some(page);
            cx.notify();
            return;
        }

        self.loading = true;
        cx.notify();
        let id = id.to_owned();
        let request = self.io.spawn({
            let id = id.clone();
            async move { catalog.song(&id).await }
        });
        self.request = Some(request.abort_handle());
        self.task = Some(cx.spawn(async move |this, cx| {
            let loaded = join(request).await;
            this.update(cx, |this, cx| {
                if this.id.as_deref() != Some(id.as_str()) {
                    return;
                }
                this.loading = false;
                this.request = None;
                match loaded {
                    Ok(page) => this.page = Some(page),
                    Err(error) => this.error = Some(format!("{error:#}")),
                }
                cx.notify();
            })
            .ok();
        }));
    }

    fn clear(&mut self) {
        self.task = None;
        if let Some(request) = self.request.take() {
            request.abort();
        }
        self.id = None;
        self.page = None;
        self.loading = false;
        self.error = None;
    }
}

fn empty_portraits() -> &'static HashMap<String, String> {
    static EMPTY: std::sync::OnceLock<HashMap<String, String>> = std::sync::OnceLock::new();
    EMPTY.get_or_init(HashMap::new)
}
