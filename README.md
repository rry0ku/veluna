# Veluna

<p align="center">
  <img src="docs/veluna_icon.png" alt="Veluna logo" width="128" />
</p>

<h2 align="center">The desktop music player built for people who want to own their listening experience.</h2>

<p align="center">
Stream anything from YouTube. Download high-quality offline tracks. Manage your local library.<br/>
No subscriptions. No advertisements. Zero telemetry. 100% private.<br/>
Native desktop performance built with Rust and Tauri for Windows, macOS, and Linux.
</p>

<p align="center">
  <a href="https://github.com/rry0ku/veluna/releases"><img src="https://img.shields.io/badge/Download%20for%20Windows%2C%20macOS%20%26%20Linux-ea580c?style=for-the-badge" alt="Download" /></a>
  <a href="https://discord.com/invite/u7QXUgPcqr"><img src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

<p align="center">
  <img src="screenshots/ss1.png" alt="Veluna Home Dashboard" width="100%" />
</p>

<p align="center">
  <img src="screenshots/ss2.png" alt="Veluna Immersive Full-Screen Synced Lyrics" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/rry0ku/veluna/releases"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-informational?style=flat-square&logo=apple&logoColor=white" alt="Platform" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-ea580c?style=flat-square" alt="License" /></a>
  <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=white" alt="Tauri" /></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Rust-stable-CE422B?style=flat-square&logo=rust&logoColor=white" alt="Rust" /></a>
  <a href="https://svelte.dev"><img src="https://img.shields.io/badge/Svelte-5-FF3E00?style=flat-square&logo=svelte&logoColor=white" alt="Svelte" /></a>
  <a href="https://github.com/rry0ku/veluna/stargazers"><img src="https://img.shields.io/github/stars/rry0ku/veluna?style=flat-square&color=ea580c" alt="Stars" /></a>
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

Veluna is a fast, lightweight desktop music player built with Rust, Tauri, and Svelte 5. It connects you directly to millions of tracks with zero ads, high-speed offline downloads, synchronized lyrics, and complete local library management. Everything is stored locally on your machine with zero telemetry, giving you full ownership over your listening experience.

---

## Core Features

### Instant Streaming and Discovery
- Low-latency YouTube Music playback powered by a native mpv audio pipeline.
- Dual-mode search: discover official audio tracks and music videos side by side.
- Quick Picks shelf on the Home view for instant access to your favorite and frequent songs.
- Dynamic genre shelves (Hip-Hop, EDM, Pop, Rock, R&B, Lo-Fi, K-Pop, and more).
- Smart autoplay recommendations that automatically queue similar tracks when playback finishes.

### Synchronized Lyrics and Theater Mode
- Real-time scrolling lyrics synchronized to audio playback with click-to-seek navigation.
- Immersive full-screen theater mode with dynamic blurred album art backdrop.
- Romanization and multi-provider fallback support (lrclib, Musixmatch, NetEase).

### High-Speed Audio Downloader
- Single-click offline downloads from search results, playlists, albums, or context menus.
- Supported output formats: MP3, Opus, and M4A.
- Quality presets: High (320kbps+), Medium (~128kbps), and Low.
- Automatic ID3 metadata tagging and embedded album cover art via ffmpeg and lofty.
- Active Downloads drawer with live speed and progress tracking.

### Offline Library and Metadata Editor
- Automatic directory scanner that reads local audio files, tags, and embedded artwork.
- Built-in metadata editor to update Title, Artist, Album, and Track tags directly on local files.
- Waveform preview scrubbers for local audio tracks.
- Multi-select batch actions (Shift+Click / Ctrl+Click) to queue, play, or remove.
- In-memory instant search across your entire offline catalog.
- Standard M3U playlist import and export.

### Artists Hub and Discographies
- Dedicated Artists view with search and direct discography navigation.
- High-definition profile artwork and artist banners.
- Local follow system to keep track of your favorite artists.
- Full release catalogs covering top songs, singles, and full studio albums.

### Playlist Management and Migration
- Custom playlist creation with custom image uploads and drag-and-drop reordering.
- Import Spotify playlists: upload CSV files from exportify.net for automated YouTube matching.
- Import YouTube playlists: paste any public YouTube or YouTube Music playlist URL.
- Duplicate track detection with one-click cleanup.

### High-Fidelity Audio Control
- Gapless playback transitions and background stream prefetching.
- Customizable crossfade duration (0 to 12 seconds).
- 10-band graphic equalizer with real-time frequency curve adjustments and presets.
- EBU R128 loudness normalization and silence skipping.
- Variable playback speed control (0.5x to 2.0x).
- Background LRU disk cache with custom size limits (500MB to Unlimited).

### Listening Stats and Playback History
- Comprehensive listening history with timestamps and repeat counters.
- Interactive listening analytics powered by LayerChart: daily listening trends, top artists, and top tracks.

### Desktop Integration and Customization
- Native Linux MPRIS2 D-Bus interface (org.mpris.MediaPlayer2.veluna) for playerctl, GNOME, KDE, and lockscreen controls.
- Discord Rich Presence: displays active track, artist, elapsed time, and artwork.
- Last.fm and ListenBrainz scrobbling support with real-time Now Playing status.
- System tray minimization with quick playback menu.
- Global hardware media key bindings.
- Custom theming engine: warm orange accent palette, dynamic album-art background tinting, and dark/light modes.
- Full JSON configuration backup and restore.

---

## Installation

Download ready-to-run release binaries for your operating system from the **[Releases](https://github.com/rry0ku/veluna/releases)** page.

### Linux

Veluna offers native packages for major distributions as well as a standalone AppImage:

**Universal AppImage (Any Linux distribution)**:
Standalone, self-contained binary with built-in updater. No root access required:
```bash
chmod +x veluna_<version>_amd64.AppImage
./veluna_<version>_amd64.AppImage
```

**Arch Linux / Manjaro / EndeavourOS (`.pkg.tar.zst`)**:
Native pacman package with desktop shortcut and icon integration:
```bash
sudo pacman -U ./veluna_<version>-1-x86_64.pkg.tar.zst
```

**Debian / Ubuntu / Linux Mint (`.deb`)**:
```bash
sudo apt install ./veluna_<version>_amd64.deb
```

**Fedora / RHEL / openSUSE (`.rpm`)**:
```bash
# Fedora / RHEL:
sudo dnf install ./veluna_<version>.x86_64.rpm

# openSUSE:
sudo zypper install ./veluna_<version>.x86_64.rpm
```

### Windows

Veluna provides an interactive NSIS setup installer as well as a standalone MSI package:

- **NSIS Setup Installer (`.exe`)**:
  Recommended for desktop users. Download `veluna_<version>_x64-setup.exe` and run the installer. It configures Start Menu shortcuts, desktop icons, and automated self-updates.
- **Windows Installer (`.msi`)**:
  Recommended for enterprise or system-wide managed deployments. Double-click the `.msi` file or install via command line:
  ```powershell
  msiexec /i veluna_<version>_x64_en-US.msi
  ```

### macOS

Veluna supports Apple Silicon (M1/M2/M3/M4) devices running macOS 11.0 or higher:

1. Download the `veluna_<version>_aarch64.dmg` disk image from [Releases](https://github.com/rry0ku/veluna/releases).
2. Double-click the DMG to open it, and drag **Veluna** into your **Applications** folder.
3. Launch Veluna from Spotlight or Launchpad.

> [!NOTE]
> If macOS Gatekeeper displays an unverified developer prompt on first launch, right-click (or Control-click) `Veluna.app`, select **Open**, and confirm by clicking **Open** in the dialog (or run `xattr -d com.apple.quarantine /Applications/Veluna.app` in Terminal).

---

## Building from Source

### Prerequisites

Before building Veluna, ensure you have the following installed on your system:

- **Node.js** (v18 or higher) and **npm**
- **Rust** (stable toolchain):
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Tauri CLI v2**:
  ```bash
  cargo install tauri-cli --version "^2"
  ```

#### Platform Dependencies

- **Debian / Ubuntu / Linux Mint**:
  ```bash
  sudo apt install libmpv-dev libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libssl-dev libdbus-1-dev libayatana-appindicator3-dev ffmpeg
  ```
- **Arch Linux / Manjaro**:
  ```bash
  sudo pacman -S mpv webkit2gtk-4.1 gtk3 librsvg openssl dbus libayatana-appindicator ffmpeg
  ```
- **Fedora / RHEL**:
  ```bash
  sudo dnf install mpv-libs-devel webkit2gtk4.1-devel gtk3-devel librsvg2-devel openssl-devel dbus-devel libappindicator-gtk3-devel ffmpeg
  ```
- **macOS**:
  ```bash
  brew install mpv ffmpeg
  ```

---

### Step-by-Step Instructions

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rry0ku/veluna.git
   cd veluna
   ```

2. **Install frontend dependencies**:
   ```bash
   cd ui
   npm install
   cd ..
   ```

3. **Fetch the FFmpeg audio sidecar**:
   ```bash
   node scripts/setup-ffmpeg.mjs
   ```

4. **Start in development mode (`cargo tauri dev`)**:
   ```bash
   cargo tauri dev
   ```
   This automatically compiles the Rust backend, starts the Vite frontend dev server with hot module replacement (HMR), and launches the native desktop window.

5. **Build release bundles (`cargo tauri build`)**:
   ```bash
   cargo tauri build
   ```
   Production packages (AppImage, deb, rpm, exe, or dmg depending on your OS) will be generated in `target/release/bundle/`.

---

## Tech Stack

### Architecture Overview

Veluna is architected as a modular workspace powered by a high-performance Rust backend and a modern Svelte 5 reactive frontend, unified through Tauri v2.

| Layer | Technology | Details & Purpose |
|---|---|---|
| **Application Shell** | Tauri v2 (Rust + WRY + TAO) | Native cross-platform windowing, zero-overhead IPC bridge, system tray, protocol assets, and self-updater |
| **Frontend Framework** | Svelte 5 + SvelteKit 2 | High-performance reactive state powered by Svelte runes (`$state`, `$derived`, `$effect`), static adapter |
| **Language & Tooling** | TypeScript + Vite 8 | Strict type safety, fast HMR development, and optimized production bundling |
| **Styling & Animation** | Tailwind CSS v4 + tw-animate-css | Modern CSS engine, zero-runtime utilities, theme variables, and GPU-accelerated transitions |
| **UI Primitives** | Bits UI + shadcn-svelte | Headless, accessible UI component primitives (modals, dropdowns, popovers, sliders, tabs) |
| **Data Visualizations** | LayerChart + D3 | Reactive data visualization engine powering interactive listening statistics, history graphs, and listening trends |
| **Iconography** | HugeIcons (`@hugeicons/svelte`) | Crisp, lightweight interface icons |
| **Audio Core** | `libmpv2` / `libmpv-sys` (in-process C FFI) | Low-latency native audio playback, 10-band software EQ, gapless transitions, EBU R128 loudness normalization |
| **Stream Extraction** | Custom `innertube` crate (Rust) | Native YouTube Music client built on `reqwest` (with `rustls-tls`, gzip, and brotli compression) |
| **BotGuard & PoToken** | `rustypipe-botguard` (V8 / Deno Core) | Minimal-DOM JavaScript runtime for cipher parsing and Proof-of-Origin token generation to prevent 403 stream throttling |
| **Stream Proxy** | Hyper (HTTP/1.1 Loopback Server) | High-throughput local loopback HTTP server for streaming music videos and audio to WebKitGTK and WebView2 |
| **Local Database** | SQLite (`rusqlite` bundled) | Fast, zero-dependency embedded relational database storing offline libraries, playlists, listening stats, and history |
| **Audio Metadata** | Lofty 0.22 | Fast in-process audio tag reader and writer supporting ID3v2, Vorbis Comments, and MP4 tags without external CLI processes |
| **Audio Transcoding** | FFmpeg / FFprobe | High-quality audio encoding (MP3, Opus, M4A) and audio waveform preview generation |
| **Romanization Engine** | Lindera (IPADIC) + WanaKana + Pinyin | In-memory Japanese morphological tokenizer and Pinyin transliterator for synchronized lyrics and song metadata |
| **Desktop Media Controls** | Souvlaki + Zbus 5 | Cross-platform hardware media key bindings and native Linux MPRIS2 D-Bus interface (`org.mpris.MediaPlayer2.veluna`) |
| **Windows Integration** | Win32 API (`windows` crate) | Windows Taskbar thumbnail toolbar, HWND window styling, and System Media Transport Controls (SMTC) |
| **Desktop Notifications** | `notify-rust` + `objc2` | Native desktop track-change notifications across Linux (D-Bus), Windows (WinRT), and macOS |
| **Discord Rich Presence** | `discord-rich-presence` | Real-time Now Playing status, elapsed track time, and album artwork synchronization over local IPC socket |
| **Scrobbling** | Last.fm & ListenBrainz APIs | Automated scrobbling and real-time Now Playing tracking via signed API payloads |
| **Social Listening** | `listen-protocol` crate (WebSocket) | Real-time synchronized playback and group listening over secure WebSockets (`tokio-tungstenite`) |

---

## Privacy and Data

All application state, playlists, and listening statistics are stored locally on your machine in SQLite and localStorage. Veluna does not collect telemetry, crash logs, or user analytics. Network requests are made strictly to resolve audio streams, retrieve lyrics, embed album artwork, or check for new releases.

---

## Legal and Fair Use

Veluna is a client-side media player. It does not host, cache, or redistribute copyrighted media on external servers. All streaming and download features operate directly on the user's machine through publicly accessible endpoints for personal, non-commercial use.

---

## License

GNU General Public License v3.0. Copyright (c) 2026 [rry0ku](https://github.com/rry0ku).
