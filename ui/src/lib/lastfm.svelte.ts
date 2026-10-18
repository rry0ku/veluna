// Last.fm connection state. One owner, because three places read it: the titlebar button, the
// Scrobbling settings tab (which can connect and disconnect too) and the track menu's "Edit
// scrobble". A copy per component went stale the moment another one changed it, which is the
// lesson `prefs.discordRpc` already taught.
import * as api from '$lib/api';
import { toast } from '$lib/player.svelte';
import { t } from '$lib/i18n.svelte';

export const lastfm = $state({
	connected: false,
	username: null as string | null,
	/** UI-local: set on connect, cleared by the `lastfm-state` event (success, failure, or timeout),
	 *  which the backend always sends. */
	connecting: false
});

/** Load the stored session and follow the backend's answers. Call once; returns the unlisten. */
export function watchLastfm(): () => void {
	api.lastfmStatus()
		.then((s) => {
			lastfm.connected = s.connected;
			lastfm.username = s.username ?? null;
		})
		.catch(() => {});
	const sub = api.onLastfmState((s) => {
		const wasConnecting = lastfm.connecting;
		lastfm.connecting = false;
		lastfm.connected = s.connected;
		lastfm.username = s.username ?? null;
		if (s.error) toast.error(s.error);
		else if (s.connected) toast.success(t('integrations.lastfm_scrobbling_as', { user: s.username ?? '' }));
		else if (!wasConnecting) toast.success(t('integrations.lastfm_disconnected'));
	});
	return () => void sub.then((u) => u());
}

/** Open the browser authorization. The outcome arrives through `watchLastfm`'s listener. */
export async function connectLastfm() {
	lastfm.connecting = true;
	try {
		await api.lastfmConnect();
		toast(t('integrations.lastfm_approve_in_browser'));
	} catch (err) {
		lastfm.connecting = false;
		toast.error(String(err));
	}
}

/** Disconnect, or cancel a connect still waiting on the browser. */
export function disconnectLastfm() {
	api.lastfmDisconnect().catch((e) => toast.error(String(e)));
}
