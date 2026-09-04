use gpui::prelude::*;
use gpui::{App, Context, Entity, FocusHandle, Global, Render, SharedString, Window, div};
use i18n::t;
use music::{Track, TrackTags};
use state::{Io, Veluna, TagState, Tags};
use ui::{ActiveTheme as _, Button, Dismiss, FORM_CONTEXT, Input, Modal, Submit, TabBar, Text};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Sheet {
    Song,
    Album,
    Details,
}

impl Sheet {
    const ALL: [Self; 3] = [Self::Song, Self::Album, Self::Details];

    fn key(self) -> &'static str {
        match self {
            Sheet::Song => "tags-sheet-song",
            Sheet::Album => "tags-sheet-album",
            Sheet::Details => "tags-sheet-details",
        }
    }

    fn fields(self) -> &'static [&'static [Field]] {
        match self {
            Sheet::Song => &[
                &[Field::Title],
                &[Field::Artist],
                &[Field::TrackNumber, Field::TrackTotal],
                &[Field::DiscNumber, Field::DiscTotal],
            ],
            Sheet::Album => &[
                &[Field::Album],
                &[Field::AlbumArtist],
                &[Field::Year, Field::Genre],
            ],
            Sheet::Details => &[
                &[Field::Composer],
                &[Field::Publisher],
                &[Field::Isrc],
                &[Field::Comment],
            ],
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Field {
    Title,
    Artist,
    TrackNumber,
    TrackTotal,
    DiscNumber,
    DiscTotal,
    Album,
    AlbumArtist,
    Year,
    Genre,
    Composer,
    Publisher,
    Isrc,
    Comment,
}

impl Field {
    const ALL: [Self; 14] = [
        Self::Title,
        Self::Artist,
        Self::TrackNumber,
        Self::TrackTotal,
        Self::DiscNumber,
        Self::DiscTotal,
        Self::Album,
        Self::AlbumArtist,
        Self::Year,
        Self::Genre,
        Self::Composer,
        Self::Publisher,
        Self::Isrc,
        Self::Comment,
    ];

    fn slot(self) -> usize {
        Self::ALL
            .iter()
            .position(|field| *field == self)
            .unwrap_or_default()
    }

    fn key(self) -> &'static str {
        match self {
            Field::Title => "tags-title",
            Field::Artist => "tags-artist",
            Field::TrackNumber => "tags-track",
            Field::TrackTotal => "tags-track-total",
            Field::DiscNumber => "tags-disc",
            Field::DiscTotal => "tags-disc-total",
            Field::Album => "tags-album",
            Field::AlbumArtist => "tags-album-artist",
            Field::Year => "tags-year",
            Field::Genre => "tags-genre",
            Field::Composer => "tags-composer",
            Field::Publisher => "tags-publisher",
            Field::Isrc => "tags-isrc",
            Field::Comment => "tags-comment",
        }
    }

    fn read(self, tags: &TrackTags) -> &str {
        match self {
            Field::Title => &tags.title,
            Field::Artist => &tags.artist,
            Field::TrackNumber => &tags.track_number,
            Field::TrackTotal => &tags.track_total,
            Field::DiscNumber => &tags.disc_number,
            Field::DiscTotal => &tags.disc_total,
            Field::Album => &tags.album,
            Field::AlbumArtist => &tags.album_artist,
            Field::Year => &tags.year,
            Field::Genre => &tags.genre,
            Field::Composer => &tags.composer,
            Field::Publisher => &tags.publisher,
            Field::Isrc => &tags.isrc,
            Field::Comment => &tags.comment,
        }
    }

    fn write(self, tags: &mut TrackTags, value: String) {
        let held = match self {
            Field::Title => &mut tags.title,
            Field::Artist => &mut tags.artist,
            Field::TrackNumber => &mut tags.track_number,
            Field::TrackTotal => &mut tags.track_total,
            Field::DiscNumber => &mut tags.disc_number,
            Field::DiscTotal => &mut tags.disc_total,
            Field::Album => &mut tags.album,
            Field::AlbumArtist => &mut tags.album_artist,
            Field::Year => &mut tags.year,
            Field::Genre => &mut tags.genre,
            Field::Composer => &mut tags.composer,
            Field::Publisher => &mut tags.publisher,
            Field::Isrc => &mut tags.isrc,
            Field::Comment => &mut tags.comment,
        };
        *held = value;
    }
}

pub(crate) struct TagEditor {
    tags: Entity<Tags>,
    inputs: Vec<Entity<Input>>,
    sheet: Sheet,
    filled: bool,
    focus: FocusHandle,
    restore: Option<FocusHandle>,
}

struct Installed(Entity<TagEditor>);

impl Global for Installed {}

impl TagEditor {
    pub fn entity(cx: &mut App) -> Entity<Self> {
        if cx.try_global::<Installed>().is_none() {
            let veluna = Veluna::global(cx);
            let session = veluna.session.clone();
            let library = veluna.library.clone();
            let editor = cx.new(|cx| {
                let io = Io::global(cx);
                let tags = cx.new(|cx| Tags::new(session, library, io, cx));
                cx.observe(&tags, |_, _, cx| cx.notify()).detach();
                let inputs = Field::ALL
                    .map(|field| cx.new(|cx| Input::new(field.key(), cx)))
                    .to_vec();

                Self {
                    tags,
                    inputs,
                    sheet: Sheet::Song,
                    filled: false,
                    focus: cx.focus_handle(),
                    restore: None,
                }
            });
            cx.set_global(Installed(editor));
        }
        cx.global::<Installed>().0.clone()
    }

    pub fn open(track: Track, window: &mut Window, cx: &mut App) {
        let editor = Self::entity(cx);
        editor.update(cx, |this, cx| this.show(track, window, cx));
    }

    fn show(&mut self, track: Track, window: &mut Window, cx: &mut Context<Self>) {
        self.restore = window.focused(cx);
        self.sheet = Sheet::Song;
        self.filled = false;
        window.focus(&self.focus, cx);
        self.tags.update(cx, |tags, cx| tags.open(track, cx));
        cx.notify();
    }

    fn close(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.tags.update(cx, |tags, cx| tags.close(cx));
        if let Some(focus) = self.restore.take() {
            window.focus(&focus, cx);
        }
        cx.notify();
    }

    fn fill(&mut self, tags: &TrackTags, cx: &mut Context<Self>) {
        for field in Field::ALL {
            let value = field.read(tags).to_owned();
            self.inputs[field.slot()].update(cx, |input, cx| input.set_text(value, cx));
        }
        self.filled = true;
    }

    fn apply(&mut self, cx: &mut Context<Self>) {
        let TagState::Ready(held) = self.tags.read(cx).state() else {
            return;
        };
        let mut edited = held.as_ref().clone();
        for field in Field::ALL {
            let value = self.inputs[field.slot()].read(cx).text().trim().to_owned();
            field.write(&mut edited, value);
        }
        self.tags.update(cx, |tags, cx| tags.save(edited, cx));
        cx.notify();
    }

    fn sheets(&self, cx: &Context<Self>) -> impl IntoElement {
        div().flex().child(self.bar(cx))
    }

    fn bar(&self, cx: &Context<Self>) -> TabBar {
        TabBar::new().items(Sheet::ALL.map(|sheet| {
            Button::new(sheet.key())
                .label(i18n::lookup(sheet.key(), None))
                .small()
                .ghost()
                .selected(self.sheet == sheet)
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.sheet = sheet;
                    Modal::rewind("tag-editor", cx);
                    cx.notify();
                }))
        }))
    }

    fn rows(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = *cx.theme();

        div()
            .flex()
            .flex_col()
            .gap_3()
            .children(self.sheet.fields().iter().map(|row| {
                div().flex().gap_3().children(row.iter().map(|field| {
                    div()
                        .flex()
                        .flex_col()
                        .flex_1()
                        .min_w_0()
                        .gap_1()
                        .child(
                            div()
                                .text_size(theme.text(Text::Small))
                                .text_color(theme.muted_foreground)
                                .child(i18n::lookup(field.key(), None)),
                        )
                        .child(self.inputs[field.slot()].clone())
                }))
            }))
    }
}

impl Render for TagEditor {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let tags = self.tags.read(cx);
        let Some(track) = tags.track().cloned() else {
            if let Some(focus) = self.restore.take() {
                window.focus(&focus, cx);
            }
            return div().into_any_element();
        };
        let theme = *cx.theme();
        let saving = tags.saving();
        let ready = matches!(tags.state(), TagState::Ready(_));
        let trouble = match tags.state() {
            TagState::Failed(reason) => Some(reason.clone()),
            _ => None,
        };
        let pending = match (ready, self.filled) {
            (true, false) => match tags.state() {
                TagState::Ready(tags) => Some(tags.as_ref().clone()),
                _ => None,
            },
            _ => None,
        };
        if let Some(pending) = pending {
            self.fill(&pending, cx);
        }

        div()
            .absolute()
            .inset_0()
            .key_context(FORM_CONTEXT)
            .track_focus(&self.focus)
            .on_action(cx.listener(|this, _: &Dismiss, window, cx| {
                cx.stop_propagation();
                this.close(window, cx);
            }))
            .on_action(cx.listener(|this, _: &Submit, _, cx| {
                cx.stop_propagation();
                this.apply(cx);
            }))
            .child(
                Modal::new("tag-editor", t!("tags-edit-title"))
                    .w(theme.metrics.cover * 3.2)
                    .h(theme.metrics.cover * 3.6)
                    .detail(SharedString::from(track.name.clone()))
                    .when(ready, |modal| {
                        modal.child(self.sheets(cx)).child(self.rows(cx))
                    })
                    .when_some(trouble, |modal, trouble| {
                        modal.child(
                            div()
                                .text_size(theme.text(Text::Small))
                                .text_color(theme.danger)
                                .child(SharedString::from(trouble)),
                        )
                    })
                    .action(
                        Button::new("cancel-tag-edit")
                            .ghost()
                            .label(t!("common-cancel"))
                            .on_click(cx.listener(|this, _, window, cx| this.close(window, cx))),
                    )
                    .action(
                        Button::new("save-tag-edit")
                            .primary()
                            .label(t!("common-save"))
                            .disabled(!ready || saving)
                            .on_click(cx.listener(|this, _, _, cx| this.apply(cx))),
                    )
                    .on_dismiss(cx.listener(|this, _, window, cx| this.close(window, cx))),
            )
            .into_any_element()
    }
}
