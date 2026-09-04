use std::cmp::Ordering;
use ui::ActiveTheme as _;

use gpui::{AnyElement, App, Entity, SharedString};
use music::SavedArtist;
use state::{Library, LibraryPart, LibraryState, Origin, Playback};
use ui::rank::{ESSENTIAL, HANDY};
use ui::{Cell, ColumnSpec, Menu, Pin, TableSource, Width};

use crate::shared::cells::{self, DATE, NUMBER};
use crate::shared::menus::artist_menu;
use crate::shared::pins::Pinned as _;
use crate::shared::text::{folded, holds};
use crate::shared::tracks::initial;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum ArtistField {
    Index,
    Cover,
    Name,
    AddedAt,
}

const COLUMN: ColumnSpec<ArtistField> = ColumnSpec::filling(ArtistField::Index);

const INDEX: ColumnSpec<ArtistField> = ColumnSpec::numbering(ArtistField::Index, NUMBER);

const COVER: ColumnSpec<ArtistField> = ColumnSpec::artwork(ArtistField::Cover);

const NAME: ColumnSpec<ArtistField> = ColumnSpec {
    field: ArtistField::Name,
    key: "name",
    header: "column-name",
    rank: ESSENTIAL,
    ..COLUMN
};

const ADDED_AT: ColumnSpec<ArtistField> = ColumnSpec {
    field: ArtistField::AddedAt,
    key: "added-at",
    header: "column-date-added",
    width: Width::Fixed(DATE),
    rank: HANDY,
    ..COLUMN
};

pub(super) const COLUMNS: &[ColumnSpec<ArtistField>] = &[INDEX, COVER, NAME, ADDED_AT];

pub(super) struct ArtistSource {
    library: Entity<Library>,
    playback: Entity<Playback>,
    local: bool,
}

impl ArtistSource {
    pub(super) fn shelved(
        library: Entity<Library>,
        playback: Entity<Playback>,
        local: bool,
    ) -> Self {
        Self {
            library,
            playback,
            local,
        }
    }

    fn index_cell(&self, cell: &Cell<ArtistField>, artist: &SavedArtist, cx: &App) -> AnyElement {
        let origin = Origin::artist(artist.id.clone()).named(artist.name.clone());
        let state = self.playback.read(cx).playing_from(&origin);
        let played = origin.clone();
        let press = cells::toggle(&self.playback, state.clone(), move |playback, cx| {
            playback.play_origin(played.clone(), cx)
        });

        cells::index(cell, state, true, None, press, cx)
    }

    pub(super) fn at(&self, row: usize, cx: &App) -> Option<SavedArtist> {
        self.artists(cx).get(row).cloned()
    }

    fn artists<'a>(&self, cx: &'a App) -> &'a [SavedArtist] {
        let library = self.library.read(cx);
        let state = match self.local {
            true => library.local_state(),
            false => library.state(),
        };
        match state {
            LibraryState::Ready { artists, .. } => artists.as_slice(),
            _ => &[],
        }
    }
}

impl TableSource for ArtistSource {
    type Field = ArtistField;

    fn columns(&self) -> &'static [ColumnSpec<ArtistField>] {
        COLUMNS
    }

    fn rows(&self, cx: &App) -> usize {
        self.artists(cx).len()
    }

    fn matches(&self, row: usize, query: &str, cx: &App) -> bool {
        self.at(row, cx)
            .is_some_and(|artist| holds(&artist.name, query))
    }

    fn playing(&self, row: usize, cx: &App) -> bool {
        self.artists(cx).get(row).is_some_and(|artist| {
            let origin = Origin::artist(artist.id.clone());
            self.playback.read(cx).playing_from(&origin).is_some()
        })
    }

    fn is_loading(&self, cx: &App) -> bool {
        match self.local {
            true => self.library.read(cx).local_loading(LibraryPart::Artists),
            false => self.library.read(cx).loading(LibraryPart::Artists),
        }
    }

    fn pin(&self, row: usize, cx: &App) -> Option<Pin> {
        self.artists(cx).get(row)?.pin()
    }

    fn picking(&self) -> bool {
        true
    }

    fn context_menu(&self, rows: &[usize], _visible: &[ArtistField], cx: &App) -> Option<Menu> {
        Some(artist_menu(
            self.at(*rows.first()?, cx)?,
            self.playback.clone(),
            false,
            cx,
        ))
    }

    fn cell(&self, cell: Cell<ArtistField>, cx: &mut App) -> AnyElement {
        let theme = *cx.theme();
        let muted = theme.muted_foreground;

        let Some(artist) = self.artists(cx).get(cell.row) else {
            return cells::blank(&cell);
        };

        if cell.field == ArtistField::Index {
            return self.index_cell(&cell, artist, cx);
        }

        match cell.field {
            ArtistField::Cover => cells::avatar(&cell, artist.cover.clone()),
            ArtistField::Name => cells::dim(&cell, artist.name.clone(), theme.foreground),
            ArtistField::AddedAt => cells::dim(&cell, cells::stamp(artist.added_at), muted),
            ArtistField::Index => cells::blank(&cell),
        }
    }

    fn compare(&self, field: ArtistField, a: usize, b: usize, cx: &App) -> Ordering {
        let artists = self.artists(cx);
        let at = |index: usize| artists.get(index);

        match field {
            ArtistField::Name => folded(
                at(a).map(|artist| artist.name.as_str()).unwrap_or_default(),
                at(b).map(|artist| artist.name.as_str()).unwrap_or_default(),
            ),
            ArtistField::AddedAt => at(a)
                .map(|artist| artist.added_at)
                .cmp(&at(b).map(|artist| artist.added_at)),
            ArtistField::Index | ArtistField::Cover => a.cmp(&b),
        }
    }

    fn group(&self, field: ArtistField, row: usize, cx: &App) -> Option<SharedString> {
        let artist = self.artists(cx).get(row)?;

        match field {
            ArtistField::Name => Some(initial(&artist.name)),
            _ => None,
        }
    }
}
