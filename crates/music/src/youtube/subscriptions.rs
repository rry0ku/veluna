use anyhow::{Context as _, Result};
use serde_json::json;
use ytmusic::nav::Nav as _;
use ytmusic::{Client, YtMusic};

use crate::SavedArtist;

const LIBRARY_SUBSCRIPTIONS: &str = "FEmusic_library_corpus_artists";

pub async fn saved(api: &YtMusic, limit: u32) -> Result<Vec<SavedArtist>> {
    let response = api
        .execute(
            "browse",
            Client::Music,
            json!({ "browseId": LIBRARY_SUBSCRIPTIONS }),
        )
        .await?;
    let renderers = ["musicTwoRowItemRenderer", "musicResponsiveListItemRenderer"]
        .into_iter()
        .flat_map(|kind| ytmusic::parse::find_renderers(&response, kind));
    let mut artists = renderers.filter_map(saved_artist).collect::<Vec<_>>();
    artists.truncate(limit as usize);
    Ok(artists)
}

fn saved_artist(renderer: &serde_json::Value) -> Option<SavedArtist> {
    let id = renderer
        .str_at(&["navigationEndpoint", "browseEndpoint", "browseId"])
        .or_else(|| {
            renderer.str_at(&[
                "flexColumns",
                "0",
                "musicResponsiveListItemFlexColumnRenderer",
                "text",
                "runs",
                "0",
                "navigationEndpoint",
                "browseEndpoint",
                "browseId",
            ])
        })?
        .to_string();
    id.starts_with("UC").then_some(SavedArtist {
        id,
        name: renderer.run_text(&["title"]).or_else(|| {
            renderer.run_text(&[
                "flexColumns",
                "0",
                "musicResponsiveListItemFlexColumnRenderer",
                "text",
            ])
        })?,
        cover: ytmusic::parse::thumbnails(renderer)
            .last()
            .map(|thumbnail| thumbnail.url.clone()),
        added_at: None,
    })
}

pub async fn set_saved(api: &YtMusic, artist_id: &str, saved: bool) -> Result<()> {
    let artist = api
        .execute("browse", Client::Music, json!({ "browseId": artist_id }))
        .await
        .with_context(|| format!("cannot load artist {artist_id} before changing subscription"))?;
    let channel_id = ytmusic::parse::find_renderer(&artist, "subscribeButtonRenderer")
        .and_then(|button| button.get("channelId"))
        .and_then(|channel_id| channel_id.as_str())
        .context("artist response has no subscription channel")?;
    let endpoint = match saved {
        true => "subscription/subscribe",
        false => "subscription/unsubscribe",
    };
    api.execute(
        endpoint,
        Client::Music,
        json!({ "channelIds": [channel_id] }),
    )
    .await
    .with_context(|| format!("cannot change subscription for artist {artist_id}"))?;
    Ok(())
}
