use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context as _, Result};
use gpui::{Context, Entity};
use music::Track;
use rusqlite::{Connection, params};

use crate::{Io, Playback, Session, SessionEvent};

#[derive(Clone, Debug)]
pub struct TopTrack {
    pub title: String,
    pub artist: String,
    pub play_count: u64,
    pub total_secs: u64,
    pub last_played: String,
}

#[derive(Clone, Debug)]
pub struct TopArtist {
    pub name: String,
    pub play_count: u64,
    pub total_secs: u64,
}

#[derive(Clone, Debug)]
pub struct DailyStat {
    pub date: String,
    pub play_count: u64,
    pub total_secs: u64,
}

#[derive(Clone, Debug)]
pub struct PlayHistoryEntry {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub played_at: String,
    pub secs: u64,
}

pub struct Stats {
    db_path: PathBuf,
    playback: Entity<Playback>,
    io: Io,
    tracked_track: Option<Track>,
    tracked_duration: Duration,
    total_plays: u64,
    total_seconds: u64,
    top_tracks: Vec<TopTrack>,
    top_artists: Vec<TopArtist>,
    daily_activity: Vec<DailyStat>,
}

impl Stats {
    pub fn new(
        session: Entity<Session>,
        playback: Entity<Playback>,
        io: Io,
        cx: &mut Context<Self>,
    ) -> Self {
        let db_path = dirs::config_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("veluna")
            .join("stats.sqlite3");

        init_db(&db_path).ok();

        cx.observe(&playback, |this, _, cx| this.on_playback_update(cx))
            .detach();

        cx.subscribe(&session, |this, _, event, cx| match event {
            SessionEvent::SignedIn | SessionEvent::Reconnected => this.refresh(cx),
            SessionEvent::SignedOut | SessionEvent::LocalChanged => {}
        })
        .detach();

        let mut stats = Self {
            db_path,
            playback,
            io,
            tracked_track: None,
            tracked_duration: Duration::ZERO,
            total_plays: 0,
            total_seconds: 0,
            top_tracks: Vec::new(),
            top_artists: Vec::new(),
            daily_activity: Vec::new(),
        };

        stats.refresh_sync();
        stats
    }

    pub fn total_plays(&self) -> u64 {
        self.total_plays
    }

    pub fn total_seconds(&self) -> u64 {
        self.total_seconds
    }

    pub fn top_tracks(&self) -> &[TopTrack] {
        &self.top_tracks
    }

    pub fn top_artists(&self) -> &[TopArtist] {
        &self.top_artists
    }

    pub fn daily_activity(&self) -> &[DailyStat] {
        &self.daily_activity
    }

    pub fn refresh(&mut self, cx: &mut Context<Self>) {
        self.refresh_sync();
        cx.notify();
    }

    fn refresh_sync(&mut self) {
        if let Ok(conn) = Connection::open(&self.db_path) {
            // Total plays and seconds
            let totals: rusqlite::Result<(u64, u64)> = conn.query_row(
                "SELECT COALESCE(SUM(play_count), 0), COALESCE(SUM(total_secs), 0) FROM track_stats",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            );
            if let Ok((plays, secs)) = totals {
                self.total_plays = plays;
                self.total_seconds = secs;
            }

            // Top Tracks
            if let Ok(mut stmt) = conn.prepare(
                "SELECT title, artist, play_count, total_secs, last_played
                 FROM track_stats ORDER BY play_count DESC, total_secs DESC LIMIT 10",
            ) {
                if let Ok(rows) = stmt.query_map([], |row| {
                    Ok(TopTrack {
                        title: row.get(0)?,
                        artist: row.get(1)?,
                        play_count: row.get(2)?,
                        total_secs: row.get(3)?,
                        last_played: row.get(4)?,
                    })
                }) {
                    self.top_tracks = rows.flatten().collect();
                }
            }

            // Top Artists
            if let Ok(mut stmt) = conn.prepare(
                "SELECT artist, SUM(play_count) as total_plays, SUM(total_secs) as total_time
                 FROM track_stats WHERE artist != '' GROUP BY artist ORDER BY total_plays DESC LIMIT 10",
            ) {
                if let Ok(rows) = stmt.query_map([], |row| {
                    Ok(TopArtist {
                        name: row.get(0)?,
                        play_count: row.get(1)?,
                        total_secs: row.get(2)?,
                    })
                }) {
                    self.top_artists = rows.flatten().collect();
                }
            }

            // Daily activity (last 7 days)
            if let Ok(mut stmt) = conn.prepare(
                "SELECT SUBSTR(played_at, 1, 10) as day, COUNT(*) as plays, SUM(secs) as time
                 FROM listening_history
                 GROUP BY day ORDER BY day DESC LIMIT 7",
            ) {
                if let Ok(rows) = stmt.query_map([], |row| {
                    Ok(DailyStat {
                        date: row.get(0)?,
                        play_count: row.get(1)?,
                        total_secs: row.get(2)?,
                    })
                }) {
                    let mut daily: Vec<DailyStat> = rows.flatten().collect();
                    daily.reverse();
                    self.daily_activity = daily;
                }
            }
        }
    }

    fn on_playback_update(&mut self, cx: &mut Context<Self>) {
        let playback = self.playback.read(cx);
        let current_track = playback.track().cloned();
        let pos = playback.position();

        // Check if track transitioned
        if let Some(ref current) = current_track {
            if let Some(ref tracked) = self.tracked_track {
                if tracked.name != current.name || tracked.artists != current.artists {
                    // Record previous track play
                    let played_secs = self.tracked_duration.as_secs();
                    if played_secs >= 10 {
                        self.record_play(tracked, played_secs);
                        self.refresh(cx);
                    }
                    self.tracked_track = Some(current.clone());
                    self.tracked_duration = pos;
                } else {
                    self.tracked_duration = self.tracked_duration.max(pos);
                }
            } else {
                self.tracked_track = Some(current.clone());
                self.tracked_duration = pos;
            }
        } else if let Some(ref tracked) = self.tracked_track.take() {
            let played_secs = self.tracked_duration.as_secs();
            if played_secs >= 10 {
                self.record_play(tracked, played_secs);
                self.refresh(cx);
            }
            self.tracked_duration = Duration::ZERO;
        }
    }

    fn record_play(&self, track: &Track, secs: u64) {
        let db_path = self.db_path.clone();
        let title = track.name.clone();
        let artist = track.artists.clone();
        let url = track.id.clone().unwrap_or_else(|| format!("{}:{}", title, artist));

        self.io.spawn(async move {
            if let Ok(conn) = Connection::open(&db_path) {
                let now = jiff::Zoned::now().strftime("%Y-%m-%d %H:%M:%S").to_string();
                let _ = conn.execute(
                    "INSERT INTO listening_history (url, title, artist, played_at, secs) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![url, title, artist, now, secs],
                );
                let _ = conn.execute(
                    "INSERT INTO track_stats (url, title, artist, play_count, total_secs, first_seen, last_played)
                     VALUES (?1, ?2, ?3, 1, ?4, ?5, ?5)
                     ON CONFLICT(url) DO UPDATE SET
                        play_count = play_count + 1,
                        total_secs = total_secs + excluded.total_secs,
                        last_played = excluded.last_played",
                    params![url, title, artist, secs, now],
                );
            }
        });
    }
}

fn init_db(path: &PathBuf) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("cannot create stats directory")?;
    }
    let conn = Connection::open(path).context("cannot open stats database")?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS listening_history (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             url TEXT NOT NULL,
             title TEXT NOT NULL DEFAULT '',
             artist TEXT NOT NULL DEFAULT '',
             played_at TEXT NOT NULL,
             secs INTEGER NOT NULL DEFAULT 0
         );
         CREATE TABLE IF NOT EXISTS track_stats (
             url TEXT PRIMARY KEY,
             title TEXT NOT NULL,
             artist TEXT NOT NULL,
             play_count INTEGER NOT NULL DEFAULT 0,
             total_secs INTEGER NOT NULL DEFAULT 0,
             first_seen TEXT NOT NULL,
             last_played TEXT NOT NULL
         );",
    )
    .context("cannot initialize stats tables")?;
    Ok(())
}
