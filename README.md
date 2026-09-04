# Veluna

<p align="center">
  <img src="https://github.com/rry0ku/veluna/blob/main/src-tauri/icons/128x128%402x.png?raw=true" alt="Veluna logo" width="128" />
</p>

<h2 align="center">The desktop music player built for people who want to own their listening experience.</h2>

<p align="center">
Stream anything from YouTube. Download studio-quality offline tracks. Manage your local library.<br/>
No subscriptions. No advertisements. No accounts. Zero telemetry.<br/>
<strong>Engineered on Linux with first-class, native support for both Linux and Windows.</strong>
</p>

<p align="center">
  <a href="https://github.com/rry0ku/veluna/releases"><img src="https://img.shields.io/badge/Download%20for%20Windows%20%26%20Linux-39FF14?style=for-the-badge" alt="Download" /></a>
  <a href="https://discord.com/invite/u7QXUgPcqr"><img src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

<p align="center">
  <img src="screenshots/ss1.png" alt="Veluna Home Dashboard" width="100%" />
</p>

<p align="center">
  <img src="screenshots/ss2.png" alt="Veluna Immersive Full-Screen Synced Lyrics" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/rry0ku/veluna/releases"><img src="https://img.shields.io/badge/platform-Linux%20%7C%20Windows-informational?style=flat-square&logo=linux&logoColor=white" alt="Platform" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-39FF14?style=flat-square" alt="License" /></a>
  <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=white" alt="Tauri" /></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Rust-stable-CE422B?style=flat-square&logo=rust&logoColor=white" alt="Rust" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" /></a>
  <a href="https://github.com/rry0ku/veluna/stargazers"><img src="https://img.shields.io/github/stars/rry0ku/veluna?style=flat-square&color=39FF14" alt="Stars" /></a>
</p>

<p align="center">
  <strong><a href="https://github.com/rry0ku/veluna/releases">Download Releases</a></strong> |
  <strong><a href="#building-from-source">Build from Source</a></strong> |
  <strong><a href="CONTRIBUTING.md">Contribute</a></strong> |
  <strong><a href="https://github.com/rry0ku/veluna/issues">Report an Issue</a></strong> |
  <strong><a href="#legal--fair-use">Legal & Fair Use</a></strong>
</p>

---

## Why Veluna?

Most modern music apps are bloated web wrappers that consume hundreds of megabytes of RAM, lock basic playback features behind monthly paywalls, and track your every move.

Veluna was built from scratch to be the opposite: a lightweight, native desktop application powered by Rust and Tauri that runs fast, respects your computer, and puts you in complete control. Engineered on Linux with first-class, native support for both Linux and Windows.

| Feature | Veluna | Bloated Electron Apps | Paid Streaming Services |
|---|---|---|---|
| **Monthly Subscription** | Free forever | Free or Paid | $11 to $17 / month |
| **Advertisements** | None | Frequent audio and banner ads | None (only on paid tier) |
| **Account Required** | Never | Required | Required |
| **Offline Downloads** | Yes (MP3, FLAC, Opus, M4A) | Locked to cache | Locked to proprietary DRM |
| **Resource Usage** | Lightweight (Rust + Tauri) | Heavy RAM and CPU hog | Heavy Electron client |
| **Local Music Management** | Native with tag editor | None or limited | None |
| **User Privacy** | 100% local, zero telemetry | Continuous data tracking | Heavy analytics and profiling |

---

## Key Features

### Instant Streaming and Smart Discovery
- Direct YouTube Music streaming via a low-latency native backend.
- Dual-category search results: browse official studio tracks and music videos side by side.
- Quick Picks carousel on the Home view for immediate replay of your top songs.
- Auto-generated Genre Shelves (Hip-Hop, EDM, Pop, Rock, R&B, Lo-Fi, K-Pop, Phonk, and more) tailored to your listening taste.
- Autoplay recommendations that keep the music playing when your queue finishes.

### Artists Hub and Full Discographies
- Dedicated Artists Hub with search and direct discography navigation.
- High-definition official profile avatars and header banners.
- Follow and unfollow artists with state saved locally.
- Comprehensive discography pages with popular tracks shelves and album releases.

### Dedicated Playback History
- Dedicated History view placed between Stats and Settings.
- Reverse-chronological timeline of every track played with relative time badges.
- Strict deduplication: replaying a track moves it to the top with an updated timestamp.
- Instant search filter by title, artist, or album.
- Virtualized list rendering maintaining 60 FPS scrolling and minimal memory usage.
- One-click Clear History with a confirmation dialog.

### Offline Library and Metadata Editor
- Recursive local directory scanner with tag enrichment and embedded cover art extraction.
- Built-in metadata editor to update title, artist, and album tags directly on local files.
- Waveform visualization thumbnails for local tracks.
- Multi-select batch actions (Shift+Click and Ctrl+Click) to batch queue, play, or delete.
- In-memory instant search across your entire offline catalog.
- Standard M3U playlist import and export.

### High-Speed Downloads and Quality Presets
- Single-click downloads from search results, playlists, or context menus.
- Multiple formats supported: MP3, Opus, M4A, and FLAC.
- Quality presets: High (320kbps+), Medium (~128kbps), Low.
- Automatic metadata tagging and album art embedding into saved audio files.
- Duplicate detection that skips files already present in your destination folder.
- Downloads Flyout drawer with live speed meters and progress tracking.

### Playlist Powerhouse and Migration Tools
- Create and organize custom playlists with custom cover art uploads.
- Import from Spotify: upload CSV files exported from [exportify.net](https://exportify.net) for automated YouTube matching with live progress feeds.
- Import from YouTube: paste any public YouTube or YouTube Music playlist URL.
- Duplicate track finder with one-click batch removal.
- Bulk metadata editor to update Artist, Album, Genre, and Year across entire playlists.

### High-Fidelity Audio Engine
- Gapless playback transitions and stream prefetching.
- Customizable crossfade duration (0 to 12 seconds).
- 10-band graphic equalizer with real-time frequency band adjustments.
- EBU R128 loudness normalization and automatic silence skipping.
- Variable playback speed control (0.5x to 2.0x).
- Dynamic disk caching with configurable size limits (500MB to Unlimited) and background LRU cleanup.

### Synchronized Lyrics
- Line-by-line synchronized scrolling with click-to-seek support.
- Full-screen immersive mode with dynamic blurred album art ambient backdrop.
- Multi-provider support: lrclib, Musixmatch, and NetEase with automatic fallback.

### Desktop Integration and Privacy
- Discord Rich Presence: displays active track, artist, elapsed time, and artwork on your profile.
- Native Linux MPRIS2 D-Bus service (`org.mpris.MediaPlayer2.veluna`) supporting playerctl, GNOME, KDE, and lockscreen controls.
- System tray minimization with quick media controls.
- Global hardware media key support.
- Performance and Eco Mode: disables heavy blurs and simplifies transitions for budget hardware.
- Backup and Restore: export your complete configuration and library data to a single JSON file.

---

## Keyboard Shortcuts

Press `?` anywhere in the application or click the top-bar logo to display the shortcuts guide.

| Action | Shortcut |
|---|---|
| Play / Pause | `Space` |
| Seek backward / forward 10s | `←` / `→` |
| Mute / Unmute | `M` |
| Home View | `Ctrl+1` / `Cmd+1` |
| Artists Hub | `Ctrl+2` / `Cmd+2` |
| Offline Library | `Ctrl+3` / `Cmd+3` |
| Listening Stats | `Ctrl+4` / `Cmd+4` |
| Playback History | `Ctrl+5` / `Cmd+5` |
| Settings Panel | `Ctrl+6` / `Cmd+6` |
| Toggle Play Queue | `Ctrl+7` / `Cmd+7` |
| Playlists Menu | `Ctrl+8` / `Ctrl+P` / `Cmd+P` |
| Open Playlist 1 to 9 | `Shift+1` to `Shift+9` |
| Back Navigation Stack | `Alt+←` |
| Focus Global Search | `Ctrl+F` / `Cmd+F` |
| Adjust UI Scale | `Ctrl + +` / `Ctrl + -` / `Ctrl + 0` |
| Dismiss Modal / Menu | `Esc` |

---

## Installation

### Linux

**Arch Linux / Manjaro / EndeavourOS**:
```bash
sudo pacman -U ./veluna_<version>-1-x86_64.pkg.tar.zst
```

**Debian / Ubuntu / Linux Mint (.deb)**:
```bash
sudo apt install ./veluna_<version>_amd64.deb
```

**Fedora / RHEL / openSUSE (.rpm)**:
```bash
sudo dnf install ./veluna_<version>.x86_64.rpm
# or for openSUSE:
sudo zypper install ./veluna_<version>.x86_64.rpm
```

### Windows

Download and run the `.exe` setup installer from the [Releases](https://github.com/rry0ku/veluna/releases) page. Required tools are bundled automatically.

---

## Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- [Tauri CLI](https://tauri.app/start/prerequisites/) v2 (`cargo install tauri-cli --version "^2"`)

### Clone and Compile
```bash
git clone https://github.com/rry0ku/veluna.git
cd veluna
npm install
npm run tauri build
```

Run in development mode:
```bash
npm run tauri dev
```

---

## Project Structure

```
veluna/
├── src/
│   ├── components/
│   │   ├── layout/            # TopBar, Sidebar, PlayerBar, QueuePanel, DownloadsFlyout, ContextMenu
│   │   ├── views/             # HomeView, ArtistsView, ArtistView, HistoryView, PlaylistsView, StatsView, LyricsView
│   │   ├── BatchActionBar.tsx # Multi-select floating toolbar
│   │   ├── DownloadsPanel.tsx # Offline local library manager and tag editor
│   │   ├── Modals.tsx         # Spotify CSV, YouTube, and M3U playlist import dialogs
│   │   ├── OnboardingModal.tsx# Initial setup and preference selection wizard
│   │   ├── SettingsPanel.tsx  # Audio, appearance, network, storage, and backup settings
│   │   ├── TrackRow.tsx       # Track row component with hover actions
│   │   └── VirtualTrackList.tsx # Windowed virtualizer for high performance on budget hardware
│   ├── hooks/                 # Audio player, queue, search, playlists, stats, lyrics, theme hooks
│   ├── services/              # SQLite and IndexedDB storage clients
│   ├── types.ts               # Core TypeScript type definitions
│   ├── utils.ts               # Utility helpers, metadata parsers, and validators
│   └── App.tsx                # Main view router and keyboard shortcut listeners
├── src-tauri/
│   ├── src/
│   │   ├── cache.rs           # Audio cache management and LRU cleaner
│   │   ├── db.rs              # Native SQLite persistence and analytics storage
│   │   ├── downloader.rs      # Multi-format download pipeline and tag embedder
│   │   ├── metadata.rs        # Audio tag extraction and waveform generator
│   │   ├── tray.rs            # System tray icon and menu controls
│   │   └── main.rs            # Rust audio engine, YouTube Music scraper, and Discord RPC
│   ├── Cargo.toml             # Rust dependencies
│   └── tauri.conf.json        # Tauri v2 native configuration
└── packaging/                 # Linux packaging scripts (PKGBUILD, desktop file)
```

---

## Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React 19 + TypeScript | UI state, component tree, virtualized list rendering |
| Shell | Tauri v2 | Native desktop windowing, OS integration, secure IPC bridge |
| Audio Backend | Rust (rodio / symphonia) | Low-latency audio decoding, software EQ, gapless playback |
| Media Extractor | yt-dlp | YouTube Music search, streaming stream extraction, downloading |
| Audio Tools | ffprobe / ffmpeg | Audio tag extraction, waveform peak generation, format transcoding |
| Linux Integration | zbus | MPRIS2 D-Bus service (`org.mpris.MediaPlayer2.veluna`) |
| Discord Presence | discord-rich-presence | Active playback status and interactive links |

---

## Data and Privacy

All application data is stored locally on your machine (`localStorage` and SQLite). Veluna collects zero telemetry, crash logs, or analytics. Network requests are made strictly to resolve audio streams, retrieve lyrics, embed album artwork, or check for releases.

---

## Legal and Fair Use

Veluna is a local playback client. It does not host, cache, or redistribute copyrighted media on external servers. All streaming and download features operate directly on the user's machine through publicly accessible endpoints for personal, non-commercial use.

---

## License

MIT License. Copyright (c) [rry0ku](https://github.com/rry0ku).

---

*Built with Rust, React, and a native desktop player that respects your system resources.*
