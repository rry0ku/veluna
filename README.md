# Veluna

<p align="center">
  <img src="docs/veluna_icon.png" alt="Veluna logo" width="128" />
</p>

<h2 align="center">The desktop music player built for people who want to own their listening experience.</h2>

<p align="center">
Stream anything from YouTube. Download high-quality offline tracks. Manage your local library.<br/>
No subscriptions. No advertisements. No accounts. Zero telemetry.<br/>
Native desktop performance built with Rust and Tauri for Linux and Windows.
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
  <strong><a href="#legal-and-fair-use">Legal and Fair Use</a></strong>
</p>

---

## Why Veluna?

Most modern music apps are bloated web wrappers that consume hundreds of megabytes of RAM, restrict playback features behind monthly paywalls, and collect user telemetry.

Veluna is designed to be the exact opposite: a fast, native desktop application powered by Rust and Tauri that runs with minimal system overhead, respects your privacy, and gives you total control over your library.

| Feature | Veluna | Bloated Electron Apps | Paid Streaming Services |
|---|---|---|---|
| Monthly Subscription | Free forever | Free or Paid tier | $11 to $17 / month |
| Advertisements | None | Banner and audio ads | Audio ads on free plans |
| Mandatory Account | Never | Required | Required |
| Offline Downloads | Yes (MP3, Opus, M4A) | Locked to cache | Locked to proprietary DRM |
| Resource Footprint | Minimal (Rust + Tauri) | High RAM and CPU usage | Heavy web runtime |
| Local Music Library | Built-in with tag editor | None or limited | None |
| Telemetry & Tracking | Zero analytics, 100% local | Continuous background tracking | Activity profiling |

---

## Core Features

### Instant Streaming and Discovery
- Low-latency YouTube Music playback via native mpv audio core.
- Dual-mode search: view official studio tracks and music videos side by side.
- Quick Picks shelf on the Home view for immediate replay of top songs.
- Dynamic genre shelves (Hip-Hop, EDM, Pop, Rock, R&B, Lo-Fi, K-Pop, Phonk, and more) adapted to your preferences.
- Smart autoplay recommendations that queue similar tracks when playback finishes.

### Artists Hub and Discographies
- Dedicated Artists view with search and direct discography navigation.
- High-definition profile artwork and header banners.
- Local follow and unfollow system with persistence.
- Full release catalogs covering top songs, singles, and full studio albums.

### Offline Library and Metadata Editor
- Automatic directory scanner that reads local audio files, tags, and embedded artwork.
- Built-in metadata editor to update Title, Artist, and Album tags directly on local files.
- Waveform preview thumbnails for local tracks.
- Multi-select batch actions (Shift+Click / Ctrl+Click) to queue, play, or delete.
- In-memory instant search across your entire offline catalog.
- Standard M3U playlist import and export.

### High-Speed Audio Downloader
- Single-click downloads from search, playlists, albums, or context menus.
- Supported output formats: MP3, Opus, and M4A.
- Quality presets: High (320kbps+), Medium (~128kbps), and Low.
- Automatic ID3 metadata tagging and album art embedding via ffmpeg and lofty.
- Active Downloads drawer with live speed and completion tracking.

### Playlist Management and Migration
- Custom playlist creation with custom image uploads.
- Import Spotify playlists: upload CSV files from exportify.net for automated YouTube matching.
- Import YouTube playlists: paste any public YouTube or YouTube Music playlist URL.
- Duplicate track detection with one-click cleanup.
- Bulk metadata editor across whole playlists.

### High-Fidelity Audio Control
- Gapless playback transitions and background stream prefetching.
- Customizable crossfade duration (0 to 12 seconds).
- 10-band graphic equalizer with real-time frequency curve adjustments.
- EBU R128 loudness normalization and silence skipping.
- Variable playback speed control (0.5x to 2.0x).
- Background LRU disk cache with custom size limits (500MB to Unlimited).

### Synchronized Lyrics
- Line-by-line scrolling lyrics synchronized to playback with click-to-seek support.
- Full-screen immersive view with dynamic blurred album art backdrop.
- Multi-provider fallback support (lrclib, Musixmatch, NetEase).

### Desktop Integration
- Native Linux MPRIS2 D-Bus interface (org.mpris.MediaPlayer2.veluna) for playerctl, GNOME, KDE, and lockscreen controls.
- Discord Rich Presence: displays active track, artist, elapsed time, and artwork.
- Last.fm Scrobbling: real-time Now Playing status and 50% threshold scrobbler.
- System tray minimization with quick playback menu.
- Global hardware media key bindings.
- Eco / Performance mode: disables blur effects for budget hardware.
- Full JSON configuration backup and restore.

---

## Keyboard Shortcuts

Press `?` in the app or click the top-bar logo to display the shortcuts guide.

| Action | Shortcut |
|---|---|
| Play / Pause | `Space` |
| Seek backward / forward 10s | `←` / `→` |
| Toggle Mute | `M` |
| Focus Global Search | `Ctrl+F` / `Cmd+F` |
| Home View | `Ctrl+1` / `Cmd+1` |
| Artists Hub | `Ctrl+2` / `Cmd+2` |
| Offline Library | `Ctrl+3` / `Cmd+3` |
| Listening Stats | `Ctrl+4` / `Cmd+4` |
| Playback History | `Ctrl+5` / `Cmd+5` |
| Settings Panel | `Ctrl+6` / `Cmd+6` |
| Toggle Play Queue | `Ctrl+7` / `Cmd+7` |
| Playlists Menu | `Ctrl+8` / `Ctrl+P` / `Cmd+P` |
| Playlist Quick Select | `Shift+1` to `Shift+9` |
| Back Navigation Stack | `Alt+←` |
| UI Scale Adjustment | `Ctrl + +` / `Ctrl + -` / `Ctrl + 0` |
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

Download and run the `.exe` setup installer from the [Releases](https://github.com/rry0ku/veluna/releases) page. Runtime dependencies are bundled automatically.

---

## Building from Source

### Prerequisites

- Node.js 18 or higher
- Rust (stable toolchain)
- Tauri CLI v2 (`cargo install tauri-cli --version "^2"`)
- Linux build dependencies: `mpv`, `ffmpeg`, `libasound2-dev`, `libwebkit2gtk-4.1-dev`

### Compilation

```bash
git clone https://github.com/rry0ku/veluna.git
cd veluna
npm install
npm run tauri build
```

To run in development mode:
```bash
npm run tauri dev
```

---

## Tech Stack

| Component | Technology | Role |
|---|---|---|
| Shell | Tauri v2 | Native windowing, IPC bridge, system integration |
| Frontend | React 19 + TypeScript | UI state, virtualized list rendering, Tailwind CSS |
| Audio Backend | mpv via Rust IPC | Low-latency audio pipeline, software EQ, gapless playback |
| Media Resolver | yt-dlp | YouTube Music search, streaming stream extraction, downloading |
| Audio Utilities | ffmpeg / ffprobe | ID3 metadata tagging, format transcoding, waveform generation |
| Linux Integration | zbus | MPRIS2 D-Bus service (org.mpris.MediaPlayer2.veluna) |
| Rich Presence | discord-rich-presence | Active playback status and artwork sync |

---

## Privacy and Data

All application state, playlists, and listening statistics are stored locally on your machine in SQLite and localStorage. Veluna does not collect telemetry, crash logs, or user analytics. Network requests are made strictly to resolve audio streams, retrieve lyrics, embed album artwork, or check for new releases.

---

## Legal and Fair Use

Veluna is a client-side media player. It does not host, cache, or redistribute copyrighted media on external servers. All streaming and download features operate directly on the user's machine through publicly accessible endpoints for personal, non-commercial use.

---

## License

MIT License. Copyright (c) [rry0ku](https://github.com/rry0ku).
