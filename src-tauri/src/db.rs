use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

static DB_WRITE_CONN: std::sync::OnceLock<Mutex<Connection>> = std::sync::OnceLock::new();
static DB_READ_CONN: std::sync::OnceLock<Mutex<Connection>> = std::sync::OnceLock::new();

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DbTrack {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub duration: String,
    pub url: String,
    pub cover: String,
    pub media_type: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DbPlaylist {
    pub id: String,
    pub name: String,
    pub description: String,
    pub custom_cover: Option<String>,
    pub tracks: Vec<DbTrack>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DbListeningEvent {
    pub url: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub played_at: String,
    pub secs: i64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DbTrackStat {
    pub url: String,
    pub title: String,
    pub artist: String,
    pub play_count: i64,
    pub total_secs: i64,
    pub first_seen: String,
    pub last_played: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DbSearchResult {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub path: String,
}

fn get_db_path(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(app_dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&app_dir);
        return app_dir.join("veluna.db");
    }
    
    // Fallback: standard config directory
    if let Some(user_dir) = dirs_fallback() {
        let dir = user_dir.join(".config").join("veluna");
        let _ = std::fs::create_dir_all(&dir);
        return dir.join("veluna.db");
    }

    PathBuf::from("veluna.db")
}

fn dirs_fallback() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA").ok().map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

pub fn init_db(app: &tauri::AppHandle) -> Result<(), String> {
    let db_path = get_db_path(app);
    let write_conn = Connection::open(&db_path).map_err(|e| format!("Failed to open SQLite DB: {}", e))?;
    let _ = write_conn.busy_timeout(std::time::Duration::from_millis(5000));

    // Performance and integrity pragmas
    write_conn.execute_batch(
        "
        PRAGMA busy_timeout = 5000;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            custom_cover TEXT,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            track_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            duration TEXT NOT NULL,
            url TEXT NOT NULL,
            cover TEXT NOT NULL,
            media_type TEXT,
            PRIMARY KEY (playlist_id, position),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
        );

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
        );

        CREATE TABLE IF NOT EXISTS lyrics_cache (
            cache_key TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            lrc_json TEXT NOT NULL,
            cached_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS library_fts USING fts5(
            title,
            artist,
            album,
            path
        );
        "
    ).map_err(|e| format!("Failed to initialize DB schema: {}", e))?;

    let read_conn = Connection::open(&db_path).map_err(|e| format!("Failed to open read SQLite DB: {}", e))?;
    let _ = read_conn.busy_timeout(std::time::Duration::from_millis(5000));
    read_conn.execute_batch(
        "
        PRAGMA busy_timeout = 5000;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        "
    ).map_err(|e| format!("Failed to configure read DB connection: {}", e))?;

    let _ = DB_WRITE_CONN.set(Mutex::new(write_conn));
    let _ = DB_READ_CONN.set(Mutex::new(read_conn));
    Ok(())
}

fn with_db<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&Connection) -> Result<R, rusqlite::Error>,
{
    let conn_mutex = DB_READ_CONN.get().ok_or("Database not initialized")?;
    let conn = conn_mutex.lock().map_err(|e| format!("DB lock error: {}", e))?;
    f(&conn).map_err(|e| format!("Database error: {}", e))
}

fn with_db_mut<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut Connection) -> Result<R, rusqlite::Error>,
{
    let conn_mutex = DB_WRITE_CONN.get().ok_or("Database not initialized")?;
    let mut conn = conn_mutex.lock().map_err(|e| format!("DB lock error: {}", e))?;
    f(&mut conn).map_err(|e| format!("Database error: {}", e))
}

pub fn save_playlist(p: DbPlaylist) -> Result<(), String> {
    with_db_mut(|conn| {
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO playlists (id, name, description, custom_cover, updated_at)
             VALUES (?1, ?2, ?3, ?4, strftime('%s', 'now'))
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                custom_cover = excluded.custom_cover,
                updated_at = strftime('%s', 'now')",
            params![p.id, p.name, p.description, p.custom_cover],
        )?;

        tx.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?1", params![p.id])?;

        {
            let mut stmt = tx.prepare(
                "INSERT INTO playlist_tracks (playlist_id, position, track_id, title, artist, duration, url, cover, media_type)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
            )?;
            for (idx, t) in p.tracks.iter().enumerate() {
                stmt.execute(params![
                    p.id,
                    idx as i64,
                    t.id,
                    t.title,
                    t.artist,
                    t.duration,
                    t.url,
                    t.cover,
                    t.media_type
                ])?;
            }
        }

        tx.commit()?;
        Ok(())
    })
}

pub fn get_all_playlists() -> Result<Vec<DbPlaylist>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT id, name, description, custom_cover FROM playlists ORDER BY updated_at DESC")?;
        let playlist_rows: Vec<(String, String, String, Option<String>)> = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?.collect::<Result<Vec<_>, _>>()?;

        let mut playlists = Vec::new();
        for (id, name, description, custom_cover) in playlist_rows {
            let mut track_stmt = conn.prepare(
                "SELECT track_id, title, artist, duration, url, cover, media_type
                 FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position ASC"
            )?;
            let tracks = track_stmt.query_map(params![id], |row| {
                Ok(DbTrack {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    duration: row.get(3)?,
                    url: row.get(4)?,
                    cover: row.get(5)?,
                    media_type: row.get(6)?,
                })
            })?.collect::<Result<Vec<_>, _>>()?;

            playlists.push(DbPlaylist {
                id,
                name,
                description,
                custom_cover,
                tracks,
            });
        }
        Ok(playlists)
    })
}

pub fn delete_playlist(id: &str) -> Result<(), String> {
    with_db_mut(|conn| {
        conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
        Ok(())
    })
}

pub fn record_play_event(url: &str, title: &str, artist: &str, secs: i64) -> Result<(), String> {
    let now = chrono_now_iso();
    with_db_mut(|conn| {
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO listening_history (url, title, artist, played_at, secs) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![url, title, artist, now, secs],
        )?;

        tx.execute(
            "INSERT INTO track_stats (url, title, artist, play_count, total_secs, first_seen, last_played)
             VALUES (?1, ?2, ?3, 1, ?4, ?5, ?5)
             ON CONFLICT(url) DO UPDATE SET
                play_count = play_count + 1,
                total_secs = total_secs + excluded.total_secs,
                title = CASE WHEN excluded.title != '' THEN excluded.title ELSE track_stats.title END,
                artist = CASE WHEN excluded.artist != '' THEN excluded.artist ELSE track_stats.artist END,
                last_played = excluded.last_played",
            params![url, title, artist, secs, now],
        )?;

        tx.commit()?;
        Ok(())
    })
}

pub fn get_listening_stats() -> Result<Vec<DbTrackStat>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT url, title, artist, play_count, total_secs, first_seen, last_played
             FROM track_stats ORDER BY play_count DESC LIMIT 200"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(DbTrackStat {
                url: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                play_count: row.get(3)?,
                total_secs: row.get(4)?,
                first_seen: row.get(5)?,
                last_played: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
    })
}

pub fn get_listening_history(limit: usize) -> Result<Vec<DbListeningEvent>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT url, title, artist, played_at, secs FROM listening_history ORDER BY id DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok(DbListeningEvent {
                url: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                played_at: row.get(3)?,
                secs: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
    })
}

pub fn clear_listening_stats() -> Result<(), String> {
    with_db_mut(|conn| {
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM listening_history", [])?;
        tx.execute("DELETE FROM track_stats", [])?;
        tx.commit()?;
        Ok(())
    })
}

pub fn make_lyrics_key(title: &str, artist: &str) -> String {
    format!("{}::{}", title.trim().to_lowercase(), artist.trim().to_lowercase())
}

pub fn get_cached_lyrics(title: &str, artist: &str) -> Result<Option<String>, String> {
    let key = make_lyrics_key(title, artist);
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT lrc_json FROM lyrics_cache WHERE cache_key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    })
}

pub fn cache_lyrics(title: &str, artist: &str, lrc_json: &str) -> Result<(), String> {
    let key = make_lyrics_key(title, artist);
    with_db_mut(|conn| {
        conn.execute(
            "INSERT INTO lyrics_cache (cache_key, title, artist, lrc_json, cached_at)
             VALUES (?1, ?2, ?3, ?4, strftime('%s', 'now'))
             ON CONFLICT(cache_key) DO UPDATE SET
                lrc_json = excluded.lrc_json,
                cached_at = strftime('%s', 'now')",
            params![key, title.trim(), artist.trim(), lrc_json],
        )?;
        Ok(())
    })
}

pub fn search_library_fts(query: &str) -> Result<Vec<DbSearchResult>, String> {
    let sanitized: String = query
        .chars()
        .map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' })
        .collect();

    let tokens: Vec<&str> = sanitized.split_whitespace().collect();
    if tokens.is_empty() {
        return Ok(Vec::new());
    }

    let fts_query = tokens
        .iter()
        .map(|tok| format!("\"{}\"*", tok.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ");

    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT title, artist, album, path FROM library_fts WHERE library_fts MATCH ?1 LIMIT 50"
        )?;
        let rows = stmt.query_map(params![fts_query], |row| {
            Ok(DbSearchResult {
                title: row.get(0)?,
                artist: row.get(1)?,
                album: row.get(2)?,
                path: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
    })
}

pub fn index_local_track_fts(title: &str, artist: &str, album: &str, path: &str) -> Result<(), String> {
    with_db_mut(|conn| {
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM library_fts WHERE path = ?1", params![path])?;
        tx.execute(
            "INSERT INTO library_fts (title, artist, album, path) VALUES (?1, ?2, ?3, ?4)",
            params![title, artist, album, path],
        )?;
        tx.commit()?;
        Ok(())
    })
}

fn chrono_now_iso() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}", now)
}
