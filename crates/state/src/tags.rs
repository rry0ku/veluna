use std::path::PathBuf;
use std::sync::Arc;

use gpui::{Context, Entity, SharedString, Task};
use music::{MusicApi, Track, TrackTags};

use crate::{Io, Library, Outcome, Session, Target, Toasts, join};

pub enum TagState {
    Loading,
    Ready(Box<TrackTags>),
    Failed(String),
}

pub struct Tags {
    session: Entity<Session>,
    library: Entity<Library>,
    io: Io,
    track: Option<Track>,
    state: TagState,
    saving: bool,
    task: Option<Task<()>>,
}

impl Tags {
    pub fn new(
        session: Entity<Session>,
        library: Entity<Library>,
        io: Io,
        _cx: &mut Context<Self>,
    ) -> Self {
        Self {
            session,
            library,
            io,
            track: None,
            state: TagState::Loading,
            saving: false,
            task: None,
        }
    }

    pub fn track(&self) -> Option<&Track> {
        self.track.as_ref()
    }

    pub fn state(&self) -> &TagState {
        &self.state
    }

    pub fn saving(&self) -> bool {
        self.saving
    }

    pub fn close(&mut self, cx: &mut Context<Self>) {
        self.task = None;
        self.track = None;
        self.saving = false;
        cx.notify();
    }

    pub fn open(&mut self, track: Track, cx: &mut Context<Self>) {
        let Some(id) = track.id.clone() else {
            return;
        };
        let session = self.session.read(cx);
        let picked = match music::is_local_id(&id) {
            true => session.local_client(),
            false => session.client(),
        };
        let Some(client) = picked else {
            return;
        };

        self.track = Some(track);
        self.state = TagState::Loading;
        self.saving = false;
        cx.notify();

        let io = self.io.clone();
        self.task = Some(cx.spawn(async move |this, cx| {
            let read = join(io.spawn(async move { client.track_tags(&id).await })).await;

            this.update(cx, |this, cx| {
                this.state = match read {
                    Ok(tags) => TagState::Ready(Box::new(tags)),
                    Err(error) => {
                        log::warn!("tags: cannot read the tags: {error:#}");
                        TagState::Failed(format!("{error:#}"))
                    }
                };
                cx.notify();
            })
            .ok();
        }));
    }

    pub fn save(&mut self, tags: TrackTags, cx: &mut Context<Self>) {
        let Some(id) = self.track.as_ref().and_then(|track| track.id.clone()) else {
            return;
        };
        let Some(client) = self.client(cx) else {
            return;
        };
        if self.saving {
            return;
        }

        self.saving = true;
        cx.notify();

        let io = self.io.clone();
        let name = tags.title.clone();
        let target = Some(Target::Song(SharedString::from(id.clone())));
        let folder = self.session.read(cx).local_path().map(PathBuf::from);
        let library = self.library.clone();
        self.task = Some(cx.spawn(async move |this, cx| {
            let written =
                join(io.spawn(async move { client.set_track_tags(&id, tags).await })).await;

            this.update(cx, |this, cx| {
                this.saving = false;
                match written {
                    Ok(()) => {
                        this.track = None;
                        if let Some(folder) = folder {
                            library.update(cx, |library, cx| library.rescan_local(folder, cx));
                        }
                        Toasts::linked(Outcome::Done, "toast-tags-saved", name, target, cx);
                    }
                    Err(error) => {
                        log::warn!("tags: cannot save the tags: {error:#}");
                        Toasts::show(Outcome::Failed, "toast-tags-failed", cx);
                    }
                }
                cx.notify();
            })
            .ok();
        }));
    }

    fn client(&self, cx: &Context<Self>) -> Option<Arc<dyn MusicApi>> {
        let id = self.track.as_ref()?.id.as_deref();
        let local = id.is_some_and(music::is_local_id);
        let session = self.session.read(cx);
        match local {
            true => session.local_client(),
            false => session.client(),
        }
    }
}
