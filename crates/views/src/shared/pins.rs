use music::{Album, Playlist, SavedArtist, Track};
use state::Hit;
use ui::{Pin, PinKind};

pub(crate) trait Pinned {
    fn pin(&self) -> Option<Pin>;
}

impl Pinned for Track {
    fn pin(&self) -> Option<Pin> {
        let id = self.id.clone()?;

        Some(Pin::new(PinKind::Song, id, self.name.clone()).cover(self.cover.clone()))
    }
}

impl Pinned for Album {
    fn pin(&self) -> Option<Pin> {
        let cover = self.cover_large.clone().or_else(|| self.cover.clone());

        Some(Pin::new(PinKind::Album, self.id.clone(), self.name.clone()).cover(cover))
    }
}

impl Pinned for Playlist {
    fn pin(&self) -> Option<Pin> {
        Some(
            Pin::new(PinKind::Playlist, self.id.clone(), self.name.clone())
                .cover(self.cover.clone()),
        )
    }
}

impl Pinned for SavedArtist {
    fn pin(&self) -> Option<Pin> {
        Some(
            Pin::new(PinKind::Artist, self.id.clone(), self.name.clone()).cover(self.cover.clone()),
        )
    }
}

impl Pinned for Hit {
    fn pin(&self) -> Option<Pin> {
        let (kind, id, name, cover) = match self {
            Self::Song(track) => return track.pin(),
            Self::Artist(artist) => (
                PinKind::Artist,
                artist.id.clone()?,
                artist.name.clone(),
                artist.cover.clone(),
            ),
            Self::Album(album) => (
                PinKind::Album,
                album.id.clone(),
                album.name.clone(),
                album.cover.clone(),
            ),
            Self::Playlist(playlist) => (
                PinKind::Playlist,
                playlist.id.clone(),
                playlist.name.clone(),
                playlist.cover.clone(),
            ),
        };

        Some(Pin::new(kind, id, name).cover(cover))
    }
}
