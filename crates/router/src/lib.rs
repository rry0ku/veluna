mod link;
mod navigation;
mod uri;

pub use link::Link;
pub use navigation::{Navigation, NavigationEvent};
pub use uri::destination;

use gpui::{App, AppContext as _, Entity, Global, SharedString};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LibraryTab {
    Songs,
    Albums,
    Playlists,
    Artists,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LocalTab {
    Songs,
    Favorites,
    Albums,
    Artists,
    Playlists,
}

impl LocalTab {
    pub const ALL: [Self; 5] = [
        Self::Favorites,
        Self::Songs,
        Self::Albums,
        Self::Artists,
        Self::Playlists,
    ];

    pub fn key(self) -> &'static str {
        match self {
            Self::Songs => "nav-songs",
            Self::Favorites => "nav-favorites",
            Self::Albums => "nav-albums",
            Self::Artists => "nav-artists",
            Self::Playlists => "nav-playlists",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NavEntry {
    Home,
    Search,
    Library,
    History,
    Local,
    Stats,
    Downloads,
}

impl NavEntry {
    pub const ALL: [Self; 7] = [
        Self::Home,
        Self::Search,
        Self::Library,
        Self::History,
        Self::Local,
        Self::Stats,
        Self::Downloads,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::Search => "search",
            Self::Library => "library",
            Self::History => "history",
            Self::Local => "local",
            Self::Stats => "stats",
            Self::Downloads => "downloads",
        }
    }

    pub fn key(self) -> &'static str {
        match self {
            Self::Home => "nav-home",
            Self::Search => "nav-search",
            Self::Library => "nav-library",
            Self::History => "nav-history",
            Self::Local => "nav-local",
            Self::Stats => "nav-stats",
            Self::Downloads => "nav-downloads",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Screen {
    Home,
    Search,
    History,
    Songs,
    Albums,
    Playlists,
    Artists,
    Imported,
    Stats,
    Downloads,
}

impl Screen {
    pub const ALL: [Self; 10] = [
        Self::Home,
        Self::Search,
        Self::Songs,
        Self::Albums,
        Self::Artists,
        Self::Playlists,
        Self::Imported,
        Self::History,
        Self::Stats,
        Self::Downloads,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::Search => "search",
            Self::History => "history",
            Self::Songs => "songs",
            Self::Albums => "albums",
            Self::Playlists => "playlists",
            Self::Artists => "artists",
            Self::Imported => "imported",
            Self::Stats => "stats",
            Self::Downloads => "downloads",
        }
    }

    pub fn key(self) -> &'static str {
        match self {
            Self::Home => "nav-home",
            Self::Search => "nav-search",
            Self::History => "nav-history",
            Self::Songs => "nav-favorites",
            Self::Albums => "nav-albums",
            Self::Playlists => "nav-playlists",
            Self::Artists => "nav-artists",
            Self::Imported => "nav-local",
            Self::Stats => "nav-stats",
            Self::Downloads => "nav-downloads",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|screen| screen.id() == id)
    }

    pub fn destination(self) -> Destination {
        match self {
            Self::Home => Destination::Home,
            Self::Search => Destination::Search,
            Self::History => Destination::History,
            Self::Songs => Destination::Library(LibraryTab::Songs),
            Self::Albums => Destination::Library(LibraryTab::Albums),
            Self::Playlists => Destination::Library(LibraryTab::Playlists),
            Self::Artists => Destination::Library(LibraryTab::Artists),
            Self::Imported => Destination::Local(LocalTab::Songs),
            Self::Stats => Destination::Stats,
            Self::Downloads => Destination::Downloads,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SettingsTab {
    General,
    Appearance,
    Playback,
    Downloads,
    Integrations,
    Privacy,
    About,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Destination {
    Home,
    History,
    Stats,
    Downloads,
    Library(LibraryTab),
    Local(LocalTab),
    Album(SharedString),
    Song(SharedString),
    Playlist(SharedString),
    Artist(SharedString),
    User(SharedString),
    Genre(SharedString),
    Search,
    Settings(SettingsTab),
    Fullscreen,
}

impl From<&ui::Pin> for Destination {
    fn from(pin: &ui::Pin) -> Self {
        let id = SharedString::from(pin.id.clone());
        match pin.kind {
            ui::PinKind::Album => Destination::Album(id),
            ui::PinKind::Artist => Destination::Artist(id),
            ui::PinKind::Playlist => Destination::Playlist(id),
            ui::PinKind::Song => Destination::Song(id),
        }
    }
}

impl Destination {
    pub fn same_section(&self, other: &Destination) -> bool {
        match (self, other) {
            (Destination::Library(_), Destination::Library(_))
            | (Destination::Local(_), Destination::Local(_))
            | (Destination::Settings(_), Destination::Settings(_)) => true,
            _ => self == other,
        }
    }
}

#[derive(Clone)]
struct Router(Entity<Navigation>);

impl Global for Router {}

pub fn init(start: Destination, cx: &mut App) {
    let navigation = cx.new(|_| Navigation::new(start));
    cx.set_global(Router(navigation));
}

pub fn trail(cx: &App) -> Entity<Navigation> {
    cx.global::<Router>().0.clone()
}

pub fn navigate(destination: Destination, cx: &mut App) {
    trail(cx).update(cx, |navigation, cx| navigation.go(destination, cx));
}

pub fn back(cx: &mut App) {
    trail(cx).update(cx, |navigation, cx| navigation.back(cx));
}

pub fn forward(cx: &mut App) {
    trail(cx).update(cx, |navigation, cx| navigation.forward(cx));
}
