use std::collections::HashMap;

use gpui::{Context, Entity, Task};

use crate::{Io, Playback, Session, SessionEvent, join};

pub struct Cover {
    session: Entity<Session>,
    playback: Entity<Playback>,
    album: Option<String>,
    large: Option<String>,
    cache: HashMap<String, String>,
    io: Io,
    task: Option<Task<()>>,
}

impl Cover {
    pub fn new(
        session: Entity<Session>,
        playback: Entity<Playback>,
        io: Io,
        cx: &mut Context<Self>,
    ) -> Self {
        cx.observe(&playback, |this, _, cx| this.follow(cx))
            .detach();
        cx.subscribe(&session, |this, _, event, cx| match event {
            SessionEvent::SignedOut => this.forget(cx),
            SessionEvent::SignedIn | SessionEvent::Reconnected | SessionEvent::LocalChanged => {}
        })
        .detach();

        Self {
            session,
            playback,
            album: None,
            large: None,
            cache: HashMap::new(),
            io,
            task: None,
        }
    }

    pub fn large(&self) -> Option<&str> {
        self.large.as_deref()
    }

    fn forget(&mut self, cx: &mut Context<Self>) {
        self.task = None;
        self.album = None;
        self.large = None;
        self.cache.clear();
        cx.notify();
    }

    fn follow(&mut self, cx: &mut Context<Self>) {
        let album = self
            .playback
            .read(cx)
            .track()
            .and_then(|track| track.album_id.clone());
        if album == self.album {
            return;
        }
        self.task = None;
        self.album = album.clone();
        self.large = album.as_ref().and_then(|id| self.cache.get(id)).cloned();
        cx.notify();

        let Some(id) = album else {
            return;
        };
        if self.large.is_some() {
            return;
        }
        self.load(id, cx);
    }

    fn load(&mut self, id: String, cx: &mut Context<Self>) {
        let session = self.session.read(cx);
        let client = match music::is_local_id(&id) {
            true => session.local_client(),
            false => session.client(),
        };
        let Some(client) = client else {
            return;
        };

        let io = self.io.clone();
        let wanted = id.clone();
        self.task = Some(cx.spawn(async move |this, cx| {
            let found = join(io.spawn(async move { client.album(&wanted).await })).await;

            this.update(cx, |this, cx| {
                this.task = None;
                match found {
                    Ok(detail) => {
                        let Some(large) = detail.album.cover_large else {
                            return;
                        };
                        this.cache.insert(id.clone(), large.clone());
                        if this.album.as_deref() == Some(id.as_str()) {
                            this.large = Some(large);
                            cx.notify();
                        }
                    }
                    Err(error) => log::warn!("cover: cannot load {id}: {error:#}"),
                }
            })
            .ok();
        }));
    }
}
