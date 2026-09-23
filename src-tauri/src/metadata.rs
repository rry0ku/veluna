use lofty::file::{AudioFile, TaggedFileExt};
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::tag::{ItemKey, Tag};
use lofty::picture::{Picture, PictureType, MimeType};
use lofty::config::WriteOptions;
use std::path::Path;
use base64::Engine;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct NativeTrackMeta {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_secs: f64,
    pub duration_str: String,
    pub bitrate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub size_bytes: u64,
    pub has_cover: bool,
    pub path: String,
    pub extension: String,
}

pub fn format_seconds_to_duration(secs: f64) -> String {
    if !secs.is_finite() || secs <= 0.0 {
        return "0:00".to_string();
    }
    let total_secs = secs as u64;
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    if hours > 0 {
        format!("{}:{:02}:{:02}", hours, mins, s)
    } else {
        format!("{}:{:02}", mins, s)
    }
}

pub fn find_directory_cover(path: &Path) -> Option<std::path::PathBuf> {
    let parent = path.parent()?;
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let extensions = ["jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG", "WEBP"];

    // 1. Strict exact match for this specific track's filename stem (e.g. "MySong.mp3" -> "MySong.jpg" / "MySong.png")
    if !stem.is_empty() {
        for ext in &extensions {
            let candidate = parent.join(format!("{}.{}", stem, ext));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    // 2. Check if this is a dedicated album directory (where folder name matches or folder is a subfolder)
    // Only check cover.jpg/folder.jpg if there is an explicit cover/folder image and no conflicting multiple song stems
    let standard_names = ["cover", "folder", "front", "album", "artwork"];
    for name in &standard_names {
        for ext in &["jpg", "jpeg", "png", "webp"] {
            let candidate = parent.join(format!("{}.{}", name, ext));
            if candidate.is_file() {
                // If it's a dedicated album folder (not a general Downloads/Music root), allow it
                let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                if parent_name != "downloads" && parent_name != "download" && parent_name != "music" && parent_name != "desktop" {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

pub fn probe_track_metadata(path: &Path) -> Option<NativeTrackMeta> {
    let metadata = std::fs::metadata(path).ok()?;
    let size_bytes = metadata.len();
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown Track");

    let tagged_file = Probe::open(path).ok().and_then(|p| p.read().ok());

    let mut title = file_stem.to_string();
    let mut artist = String::new();
    let mut album = String::new();
    let mut duration_secs = 0.0;
    let mut bitrate = None;
    let mut sample_rate = None;
    let mut has_cover = false;

    if let Some(ref tf) = tagged_file {
        let properties = tf.properties();
        duration_secs = properties.duration().as_secs_f64();
        bitrate = properties.audio_bitrate();
        sample_rate = properties.sample_rate();

        if let Some(tag) = tf.primary_tag().or_else(|| tf.first_tag()) {
            if let Some(t) = tag.title().filter(|s| !s.trim().is_empty()) {
                title = t.trim().to_string();
            }
            if let Some(a) = tag.artist().filter(|s| !s.trim().is_empty()) {
                artist = a.trim().to_string();
            }
            if let Some(al) = tag.album().filter(|s| !s.trim().is_empty()) {
                album = al.trim().to_string();
            }
        }

        // Check pictures across all tags in the file
        has_cover = tf.tags().iter().any(|t| !t.pictures().is_empty());
    }

    // If no embedded cover, check directory for folder/album cover art
    if !has_cover {
        has_cover = find_directory_cover(path).is_some();
    }

    // Fallback: If title contains "Artist - Title" and artist was empty, parse from filename
    if artist.is_empty() && title.contains(" - ") {
        let parts: Vec<&str> = title.splitn(2, " - ").collect();
        if parts.len() == 2 && !parts[0].trim().is_empty() && !parts[1].trim().is_empty() {
            artist = parts[0].trim().to_string();
            title = parts[1].trim().to_string();
        }
    }

    let duration_str = format_seconds_to_duration(duration_secs);

    Some(NativeTrackMeta {
        title,
        artist,
        album,
        duration_secs,
        duration_str,
        bitrate,
        sample_rate,
        size_bytes,
        has_cover,
        path: path.to_string_lossy().to_string(),
        extension: ext,
    })
}

fn detect_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
        "image/png"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if bytes.starts_with(b"BM") {
        "image/bmp"
    } else {
        "image/jpeg"
    }
}

pub fn extract_cover_art_data_uri(path: &Path) -> Option<String> {
    // 1. Try reading embedded tags via lofty
    if let Ok(probed) = Probe::open(path) {
        if let Ok(tagged_file) = probed.read() {
            // Search all tags for the first available picture
            if let Some(picture) = tagged_file.tags().iter().find_map(|t| t.pictures().first()) {
                let data = picture.data();
                if !data.is_empty() {
                    let mime_str = detect_image_mime(data);
                    let encoded = base64::engine::general_purpose::STANDARD.encode(data);
                    return Some(format!("data:{};base64,{}", mime_str, encoded));
                }
            }
        }
    }

    // 2. If no embedded tag art, check directory for cover/folder/album images
    if let Some(cover_file) = find_directory_cover(path) {
        if let Ok(bytes) = std::fs::read(&cover_file) {
            if !bytes.is_empty() {
                let mime_str = detect_image_mime(&bytes);
                let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
                return Some(format!("data:{};base64,{}", mime_str, encoded));
            }
        }
    }

    None
}

pub fn write_track_tags(
    path: &Path,
    new_title: Option<&str>,
    new_artist: Option<&str>,
    new_album: Option<&str>,
) -> Result<(), String> {
    let mut tagged_file = Probe::open(path)
        .map_err(|e| format!("Failed to open file for tagging: {}", e))?
        .read()
        .map_err(|e| format!("Failed to read tags: {}", e))?;

    let tag_type = tagged_file.primary_tag_type();
    let tag = match tagged_file.tag_mut(tag_type) {
        Some(t) => t,
        None => {
            tagged_file.insert_tag(Tag::new(tag_type));
            tagged_file.tag_mut(tag_type).ok_or("Failed to create tag")?
        }
    };

    if let Some(t) = new_title {
        tag.set_title(t.trim().to_string());
    }
    if let Some(a) = new_artist {
        tag.set_artist(a.trim().to_string());
    }
    if let Some(al) = new_album {
        tag.set_album(al.trim().to_string());
    }

    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Failed to save tags: {}", e))?;
    Ok(())
}

pub fn embed_cover_and_lyrics(
    path: &Path,
    image_bytes: Option<&[u8]>,
    lyrics_text: Option<&str>,
) -> Result<(), String> {
    let mut tagged_file = Probe::open(path)
        .map_err(|e| format!("Failed to open file: {}", e))?
        .read()
        .map_err(|e| format!("Failed to read tags: {}", e))?;

    let tag_type = tagged_file.primary_tag_type();
    let tag = match tagged_file.tag_mut(tag_type) {
        Some(t) => t,
        None => {
            tagged_file.insert_tag(Tag::new(tag_type));
            tagged_file.tag_mut(tag_type).ok_or("Failed to create tag")?
        }
    };

    if let Some(img) = image_bytes {
        if !img.is_empty() {
            tag.remove_picture_type(PictureType::CoverFront);
            let mime_str = detect_image_mime(img);
            let mime = MimeType::from_str(mime_str);
            let picture = Picture::new_unchecked(
                PictureType::CoverFront,
                Some(mime),
                None,
                img.to_vec(),
            );
            tag.push_picture(picture);
        }
    }

    if let Some(lrc) = lyrics_text {
        if !lrc.trim().is_empty() {
            tag.insert_text(ItemKey::Lyrics, lrc.to_string());
        }
    }

    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Failed to save embedded metadata: {}", e))?;
    Ok(())
}
