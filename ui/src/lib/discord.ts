/**
 * The Discord Rich Presence card layout, as the settings tab edits it and `DiscordCard.svelte`
 * previews it.
 *
 * This is the TypeScript half of `src-tauri/src/discord.rs`: the same field names, the same string
 * values, the same defaults, and the same rules for which slot resolves to what. It is persisted as
 * one JSON blob in the `discord_rpc_config` setting rather than a settings row per knob, so adding
 * an option means a field here, a field there, and a control in the tab.
 *
 * The two copies of `cardText`/`cardLink` have to agree or the preview lies about what the user's
 * friends will see. Change one, change the other.
 */

export interface DiscordConfig {
	/** Which slot Discord repeats after "Listening to": `app` | `line1` | `line2`. */
	status_line: string;
	/** Replaces the registered application name in that slot. Empty keeps "Veluna". */
	app_name: string;
	/** The card's first (bold) line: `title` | `artist` | `album`. */
	line1: string;
	/** The second line: `title` | `artist` | `album` | `artist_album` | `off`. */
	line2: string;
	/** Show the artwork. Also gates `line3`, which Discord only renders as part of the assets block. */
	cover: boolean;
	/** The card's third line (`assets.large_text`): `album` | `title` | `artist` | `off`. Discord
	 *  draws it under line 2 and reuses it as the artwork's hover text. */
	line3: string;
	link_line1: boolean;
	link_line2: boolean;
	link_cover: boolean;
	/** Ignored while paused: Discord has no paused state, so a bar left up keeps running and lies. */
	timestamps: boolean;
	/** The Veluna badge in the artwork's corner. Needs `cover`: on its own `small_image` is not a
	 *  badge, it becomes the card's image. */
	badge: boolean;
	/** Keep the card up while paused. The backend also requires playback to have started once this
	 *  session, so the queue restored at launch never posts one. */
	show_paused: boolean;
	/** Say only that music is playing. Overrides every other field, which is why the tab hides the
	 *  rest of the controls when it is on. */
	hide_details: boolean;
	/** In card order: `listen` | `album` | `artist` | `app` | `off`. */
	button1: string;
	button2: string;
}

/** Must match `impl Default for RpcConfig` — the card Veluna showed before the tab existed, plus
 *  the badge, which is on by default. */
export const DISCORD_DEFAULTS: DiscordConfig = {
	status_line: 'line2',
	app_name: '',
	line1: 'title',
	line2: 'artist',
	cover: true,
	line3: 'album',
	link_line1: false,
	link_line2: false,
	link_cover: false,
	timestamps: true,
	badge: true,
	show_paused: false,
	hide_details: false,
	button1: 'listen',
	button2: 'app'
};

/** Anything unparseable is the default card, exactly as Rust's `RpcConfig::parse` treats it. */
export function parseDiscordConfig(json: string | undefined): DiscordConfig {
	try {
		return { ...DISCORD_DEFAULTS, ...(JSON.parse(json ?? '') as Partial<DiscordConfig>) };
	} catch {
		return { ...DISCORD_DEFAULTS };
	}
}

/** What the preview has to know about a track. A subset of `SongItem` plus the local-file flag. */
export interface PreviewTrack {
	videoId: string;
	title: string;
	artists: string;
	artistId?: string;
	album?: string;
	albumId?: string;
	thumbnail?: string;
	local?: boolean;
}

/**
 * The text a slot resolves to, or `null` when the track carries nothing for it — an album-less
 * single with line 2 set to "Album" drops the line rather than showing a blank one. Mirrors
 * `text_for` in `discord.rs`.
 */
export function cardText(slot: string, t: PreviewTrack): string | null {
	const artist = t.artists?.trim() ? t.artists : null;
	const album = t.album?.trim() ? t.album : null;
	switch (slot) {
		case 'title':
			return t.title?.trim() ? t.title : null;
		case 'artist':
			return artist;
		case 'album':
			return album;
		case 'artist_album':
			return artist && album ? `${artist} — ${album}` : (artist ?? album);
		default:
			return null;
	}
}

const SONG_URL = 'https://music.youtube.com/watch?v=';
const ARTIST_URL = 'https://music.youtube.com/channel/';
const ALBUM_URL = 'https://music.youtube.com/browse/';

/**
 * Where a slot points when the user makes it clickable: the link follows the content, so a line
 * showing the album opens the album. `null` for a local file (no page to open, and its id is a path
 * on this machine) or when YouTube didn't link that entity. Mirrors `link_for` in `discord.rs`.
 */
export function cardLink(slot: string, t: PreviewTrack): string | null {
	if (t.local) return null;
	switch (slot) {
		case 'title':
			return t.videoId ? SONG_URL + t.videoId : null;
		case 'artist':
		case 'artist_album':
			return t.artistId ? ARTIST_URL + t.artistId : null;
		case 'album':
			return t.albumId ? ALBUM_URL + t.albumId : null;
		default:
			return null;
	}
}

/**
 * The button labels exactly as `button_for` sends them. Untranslated on purpose: these strings go
 * over the wire to Discord in English, so a translated preview would show the user something their
 * friends never see. The dropdown that *chooses* a button is translated; this is the card.
 */
export const BUTTON_LABELS: Record<string, string> = {
	listen: 'Listen on YouTube Music',
	album: 'View album',
	artist: 'View artist',
	app: 'Get Veluna'
};
