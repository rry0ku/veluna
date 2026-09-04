use std::path::Path;

use anyhow::{Context as _, Result};
use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::prelude::{Accessor, ItemKey};
use lofty::probe::Probe;
use lofty::tag::Tag;
use lofty::tag::items::Timestamp;

use crate::TrackTags;

pub fn read(path: &Path) -> Result<TrackTags> {
    let tagged = Probe::open(path)
        .with_context(|| format!("cannot open {}", path.display()))?
        .read()
        .with_context(|| format!("cannot read the tags in {}", path.display()))?;
    let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else {
        return Ok(TrackTags::default());
    };

    Ok(TrackTags {
        title: text(tag.title()),
        artist: text(tag.artist()),
        album: text(tag.album()),
        album_artist: held(tag, ItemKey::AlbumArtist),
        track_number: number(tag.track()),
        track_total: number(tag.track_total()),
        disc_number: number(tag.disk()),
        disc_total: number(tag.disk_total()),
        year: tag
            .date()
            .filter(|date| date.year > 0)
            .map(|date| date.year.to_string())
            .unwrap_or_default(),
        genre: text(tag.genre()),
        composer: held(tag, ItemKey::Composer),
        publisher: held(tag, ItemKey::Publisher),
        isrc: held(tag, ItemKey::Isrc),
        comment: text(tag.comment()),
        lyrics: held(tag, ItemKey::Lyrics),
    })
}

pub fn write(path: &Path, tags: &TrackTags) -> Result<()> {
    update(path, |tag| {
        set(tag, ItemKey::TrackTitle, &tags.title);
        set(tag, ItemKey::TrackArtist, &tags.artist);
        set(tag, ItemKey::AlbumTitle, &tags.album);
        set(tag, ItemKey::AlbumArtist, &tags.album_artist);
        set(tag, ItemKey::Genre, &tags.genre);
        set(tag, ItemKey::Composer, &tags.composer);
        set(tag, ItemKey::Publisher, &tags.publisher);
        set(tag, ItemKey::Isrc, &tags.isrc);
        set(tag, ItemKey::Comment, &tags.comment);
        set(tag, ItemKey::Lyrics, &tags.lyrics);

        counted(tag, ItemKey::TrackNumber, &tags.track_number);
        counted(tag, ItemKey::TrackTotal, &tags.track_total);
        counted(tag, ItemKey::DiscNumber, &tags.disc_number);
        counted(tag, ItemKey::DiscTotal, &tags.disc_total);
        set_year(tag, &tags.year);
    })
}

pub fn write_year(path: &Path, value: &str) -> Result<()> {
    update(path, |tag| set_year(tag, value))
}

fn update(path: &Path, change: impl FnOnce(&mut Tag)) -> Result<()> {
    let mut tagged = Probe::open(path)
        .with_context(|| format!("cannot open {}", path.display()))?
        .read()
        .with_context(|| format!("cannot read the tags in {}", path.display()))?;
    if tagged.primary_tag().is_none() && tagged.first_tag().is_none() {
        let kind = tagged.primary_tag_type();
        tagged.insert_tag(Tag::new(kind));
    }
    let held = tagged.primary_tag_mut().is_some();
    let tag = match held {
        true => tagged.primary_tag_mut(),
        false => tagged.first_tag_mut(),
    };
    let Some(tag) = tag else {
        anyhow::bail!("{} cannot hold tags", path.display());
    };
    change(tag);

    tagged
        .save_to_path(path, WriteOptions::default())
        .with_context(|| format!("cannot save the tags in {}", path.display()))?;
    Ok(())
}

fn set_year(tag: &mut Tag, value: &str) {
    match year(value) {
        Some(year) => tag.set_date(Timestamp {
            year,
            month: None,
            day: None,
            hour: None,
            minute: None,
            second: None,
        }),
        None => tag.remove_date(),
    }
}

fn text(value: Option<std::borrow::Cow<'_, str>>) -> String {
    value
        .map(|value| value.trim().to_owned())
        .unwrap_or_default()
}

fn held(tag: &Tag, key: ItemKey) -> String {
    tag.get_string(key).map(str::to_owned).unwrap_or_default()
}

fn number(value: Option<u32>) -> String {
    value
        .filter(|value| *value > 0)
        .map(|value| value.to_string())
        .unwrap_or_default()
}

fn year(value: &str) -> Option<u16> {
    value.trim().parse().ok().filter(|year| *year > 0)
}

fn set(tag: &mut Tag, key: ItemKey, value: &str) {
    let value = value.trim();
    match value.is_empty() {
        true => {
            tag.remove_key(key);
        }
        false => {
            tag.insert_text(key, value.to_owned());
        }
    }
}

fn counted(tag: &mut Tag, key: ItemKey, value: &str) {
    match value.trim().parse::<u32>().ok().filter(|value| *value > 0) {
        Some(value) => set(tag, key, &value.to_string()),
        None => set(tag, key, ""),
    }
}
