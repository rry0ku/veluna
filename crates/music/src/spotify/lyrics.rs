use anyhow::{Context as _, Result};
use bytes::Bytes;
use http::{Method, Request, header};
use librespot_core::{Session, spclient::CLIENT_TOKEN};
use serde::Deserialize;

use crate::lyrics::lrc;
use crate::{Lyrics, LyricsLine, LyricsWord, Voice};

const ENDPOINT: &str = "https://spclient.wg.spotify.com/color-lyrics/v2/track";
const APP_PLATFORM: &str = "WebPlayer";

#[derive(Deserialize)]
struct Answer {
    lyrics: Option<Sheet>,
}

#[derive(Deserialize)]
struct Sheet {
    #[serde(default, rename = "syncType")]
    sync: String,
    #[serde(default)]
    lines: Vec<Verse>,
}

#[derive(Deserialize)]
struct Verse {
    #[serde(default, rename = "startTimeMs")]
    start: String,
    #[serde(default, rename = "endTimeMs")]
    end: String,
    #[serde(default)]
    words: String,
    #[serde(default)]
    syllables: Vec<Syllable>,
}

#[derive(Deserialize)]
struct Syllable {
    #[serde(default, rename = "startTimeMs")]
    start: String,
    #[serde(default, rename = "endTimeMs")]
    end: String,
    #[serde(default)]
    text: String,
}

pub async fn lyrics(session: &Session, track_id: &str) -> Result<Option<Lyrics>> {
    let token = session
        .login5()
        .auth_token()
        .await
        .context("cannot obtain Spotify access token")?;
    let client_token = session
        .spclient()
        .client_token()
        .await
        .context("cannot obtain Spotify client token")?;
    let request = Request::builder()
        .method(Method::GET)
        .uri(format!(
            "{ENDPOINT}/{track_id}?format=json&vocalRemoval=false&market=from_token"
        ))
        .header(header::ACCEPT, "application/json")
        .header("app-platform", APP_PLATFORM)
        .header(
            header::AUTHORIZATION,
            format!("{} {}", token.token_type, token.access_token),
        )
        .header(CLIENT_TOKEN, client_token)
        .body(Bytes::new())
        .context("cannot build the Spotify lyrics request")?;
    let body = match session.http_client().request_body(request).await {
        Ok(body) => body,
        Err(error) => {
            log::debug!("lyrics: spotify has none for {track_id}: {error}");
            return Ok(None);
        }
    };
    let answer: Answer =
        serde_json::from_slice(&body).context("cannot decode the Spotify lyrics response")?;
    Ok(answer.lyrics.and_then(sheet))
}

fn sheet(sheet: Sheet) -> Option<Lyrics> {
    if sheet.sync == "UNSYNCED" {
        let text = sheet
            .lines
            .iter()
            .map(|verse| verse.words.trim())
            .filter(|words| !words.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        return (!text.trim().is_empty()).then(|| Lyrics::plain(text));
    }

    let mut lines: Vec<LyricsLine> = sheet.lines.iter().filter_map(verse).collect();
    lrc::normalize(&mut lines);
    (!lines.is_empty()).then(|| Lyrics::Synced {
        lines: lines.into(),
    })
}

fn verse(verse: &Verse) -> Option<LyricsLine> {
    let text = verse.words.trim();
    if text.is_empty() || text == "♪" {
        return None;
    }
    let start = stamp(&verse.start)?;
    let words: Vec<LyricsWord> = verse
        .syllables
        .iter()
        .filter_map(|syllable| {
            Some(LyricsWord {
                start: stamp(&syllable.start)?,
                end: stamp(&syllable.end)?,
                text: syllable.text.clone(),
            })
        })
        .collect();
    Some(LyricsLine {
        start,
        end: stamp(&verse.end).filter(|end| *end > start),
        text: text.to_owned(),
        romanized: None,
        words: (!words.is_empty()).then_some(words),
        secondary: Vec::new(),
        voice: Voice::Lead,
    })
}

fn stamp(millis: &str) -> Option<std::time::Duration> {
    millis
        .trim()
        .parse()
        .ok()
        .map(std::time::Duration::from_millis)
}
