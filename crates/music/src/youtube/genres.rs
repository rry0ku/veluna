use anyhow::Result;
use serde_json::{Value, json};
use ytmusic::nav::Nav as _;
use ytmusic::{Client, YtMusic, parse};

use crate::youtube::wire;
use crate::{Genre, GenreDetail, GenreItem, GenreSection, HomeFeed, Track};

const HOME: &str = "FEmusic_home";
const LISTEN_AGAIN: &str = "Listen again";
const QUICK_PICKS: &str = "Quick picks";
const QUICK_PICKS_LIMIT: usize = 15;
const CATEGORIES: &str = "FEmusic_moods_and_genres";
const CATEGORY: &str = "FEmusic_moods_and_genres_category";
const THUMB: u32 = 120;

pub(crate) async fn home(api: &YtMusic) -> Result<HomeFeed> {
    let answer = api
        .execute("browse", Client::Music, json!({ "browseId": HOME }))
        .await?;
    let listen_again = tracks(&answer, LISTEN_AGAIN);
    let quick_picks = match continuation(&answer) {
        Some(token) => match api
            .execute("browse", Client::Music, json!({ "continuation": token }))
            .await
        {
            Ok(continued) => tracks(&continued, QUICK_PICKS)
                .into_iter()
                .take(QUICK_PICKS_LIMIT)
                .collect(),
            Err(error) => {
                log::warn!("youtube: cannot load Quick picks: {error:#}");
                Vec::new()
            }
        },
        None => Vec::new(),
    };
    Ok(HomeFeed {
        listen_again,
        quick_picks: Some(quick_picks),
        sections: sections(&answer),
    })
}

pub(crate) async fn genres(api: &YtMusic) -> Result<Vec<Genre>> {
    let answer = api
        .execute("browse", Client::Music, json!({ "browseId": CATEGORIES }))
        .await?;

    Ok(parse::find_renderers(&answer, "gridRenderer")
        .into_iter()
        .flat_map(|grid| grid.items(&["items"]))
        .filter_map(card)
        .collect())
}

pub(crate) async fn genre(api: &YtMusic, params: &str) -> Result<GenreDetail> {
    let answer = api
        .execute(
            "browse",
            Client::Music,
            json!({ "browseId": CATEGORY, "params": params }),
        )
        .await?;

    Ok(GenreDetail {
        name: answer
            .run_text(&["header", "musicHeaderRenderer", "title"])
            .unwrap_or_default(),
        sections: parse::find_renderers(&answer, "musicCarouselShelfRenderer")
            .into_iter()
            .filter_map(section)
            .collect(),
    })
}

fn section(shelf: &Value) -> Option<GenreSection> {
    let title = shelf_title(shelf).unwrap_or_default();
    let items: Vec<GenreItem> = shelf.items(&["contents"]).iter().filter_map(item).collect();

    (!items.is_empty()).then_some(GenreSection { title, items })
}

fn sections(answer: &Value) -> Vec<GenreSection> {
    parse::find_renderers(answer, "musicCarouselShelfRenderer")
        .into_iter()
        .filter(|shelf| {
            !matches!(
                shelf_title(shelf).as_deref(),
                Some(LISTEN_AGAIN | QUICK_PICKS)
            )
        })
        .filter_map(section)
        .collect()
}

fn tracks(answer: &Value, wanted: &str) -> Vec<Track> {
    let shelf = parse::find_renderers(answer, "musicCarouselShelfRenderer")
        .into_iter()
        .find(|shelf| shelf_title(shelf).as_deref() == Some(wanted));
    let Some(shelf) = shelf else {
        return Vec::new();
    };

    shelf
        .items(&["contents"])
        .iter()
        .filter_map(|item| parse::list_item_track(item).or_else(|| track(item)))
        .enumerate()
        .map(|(index, track)| wire::track(track, index as u32))
        .collect()
}

fn shelf_title(shelf: &Value) -> Option<String> {
    shelf.run_text(&["header", "musicCarouselShelfBasicHeaderRenderer", "title"])
}

fn track(item: &Value) -> Option<ytmusic::Track> {
    let renderer = item.at(&["musicTwoRowItemRenderer"])?;
    let page = renderer.str_at(&[
        "navigationEndpoint",
        "browseEndpoint",
        "browseEndpointContextSupportedConfigs",
        "browseEndpointContextMusicConfig",
        "pageType",
    ]);
    if matches!(
        page,
        Some("MUSIC_PAGE_TYPE_ALBUM" | "MUSIC_PAGE_TYPE_PLAYLIST")
    ) {
        return None;
    }

    let endpoint = renderer.at(&[
        "thumbnailOverlay",
        "musicItemThumbnailOverlayRenderer",
        "content",
        "musicPlayButtonRenderer",
        "playNavigationEndpoint",
        "watchEndpoint",
    ])?;
    let video_id = endpoint.str_at(&["videoId"])?.to_owned();
    let artists = parse::artist_runs(renderer.runs(&["subtitle"]));
    let kind = match endpoint.str_at(&[
        "watchEndpointMusicSupportedConfigs",
        "watchEndpointMusicConfig",
        "musicVideoType",
    ]) {
        Some("MUSIC_VIDEO_TYPE_ATV") => ytmusic::TrackKind::Song,
        _ => ytmusic::TrackKind::Video,
    };

    Some(ytmusic::Track {
        video_id: Some(video_id),
        title: renderer.run_text(&["title"])?,
        artists,
        album: None,
        duration: None,
        thumbnails: parse::thumbnails(renderer),
        explicit: parse::explicit(renderer),
        available: true,
        kind,
        set_video_id: None,
        liked: None,
        views: None,
    })
}

fn continuation(answer: &Value) -> Option<&str> {
    answer.str_at(&[
        "contents",
        "singleColumnBrowseResultsRenderer",
        "tabs",
        "0",
        "tabRenderer",
        "content",
        "sectionListRenderer",
        "continuations",
        "0",
        "nextContinuationData",
        "continuation",
    ])
}

fn item(node: &Value) -> Option<GenreItem> {
    if let Some(source) = parse::two_row_playlist(node) {
        let thumb = thumb(&source.thumbnails);
        let mut playlist = wire::playlist(source, false, true);
        playlist.cover = thumb;
        return Some(GenreItem::Playlist(playlist));
    }

    let source = parse::two_row_album(node)?;
    let thumb = thumb(&source.thumbnails);
    let mut album = wire::album(source);
    album.cover = thumb;

    Some(GenreItem::Album(album))
}

fn thumb(thumbnails: &[ytmusic::Thumbnail]) -> Option<String> {
    thumbnails
        .iter()
        .find(|thumb| thumb.width >= THUMB)
        .or_else(|| thumbnails.last())
        .map(|thumb| thumb.url.clone())
}

fn card(item: &Value) -> Option<Genre> {
    let button = item.get("musicNavigationButtonRenderer")?;

    Some(Genre {
        id: button
            .str_at(&["clickCommand", "browseEndpoint", "params"])?
            .to_owned(),
        name: button.run_text(&["buttonText"])?,
        cover: None,
    })
}
