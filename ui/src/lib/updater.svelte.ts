// Auto-update handler via Tauri's updater plugin.
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { toast } from './player.svelte';
import { t } from './i18n.svelte';
import { friendlyNetError } from './neterr';
import { getSettings } from './api';

import { openExternal } from './api';

const RELEASES_URL = 'https://github.com/rry0ku/veluna/releases/latest';

/** How often the quiet check repeats while the app stays open. */
export const QUIET_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const updateState = $state({
	available: null as { version: string; rollback: boolean } | null,
	canInstall: false,
	checking: false,
	installing: false
});

let pending: Update | null = null;

async function look(): Promise<boolean> {
	return false;
}

/** The line announcing an available version. A rollback worded as "Version 0.8.2 is available!"
 *  to someone on 1.0.0 reads as a bug, so it says what is actually happening. */
export function availableMessage(a: { version: string; rollback: boolean }): string {
	return t(a.rollback ? 'settings.about.rollback_available' : 'settings.about.update_available', {
		version: a.version
	});
}

/** On app open, and every `QUIET_INTERVAL_MS` after: show the update banner if one exists, stay
 *  silent otherwise. Repeating matters because ✕ hides to tray by default, so the webview mounts
 *  once and can stay up for days: a mount-only check never sees a release published while the app
 *  is running. With `update_banner` off the check is skipped entirely (no banner, no request),
 *  leaving Settings > About > Check for updates as the only way to find one. */
export async function checkForUpdatesQuiet() {
	try {
		if (updateState.available) return; // one is already on screen; don't re-fetch behind it
		if ((await getSettings()).update_banner === 'false') return;
		await look();
	} catch (e) {
		console.error('update check failed', e); // no endpoint / offline — don't nag on launch
	}
}

/** After the update channel changes: drop what the old channel offered and ask the new one. */
export async function recheckForUpdates() {
	pending = null;
	updateState.available = null;
	await checkForUpdatesQuiet();
}

/** From Settings: return the outcome so the modal can show it inline (a toast renders behind the
 *  dialog). `error` picks the Alert variant. */
export async function checkForUpdatesInteractive(): Promise<{ message: string; error: boolean }> {
	updateState.checking = true;
	try {
		if (await look()) return { message: availableMessage(updateState.available!), error: false };
		return { message: t('settings.about.up_to_date'), error: false };
	} catch (e) {
		// Rendered inline in the dialog rather than as a toast, so it misses the toast's own
		// network wording and has to ask for it here.
		const detail = friendlyNetError(String(e), t('errors.unreachable'));
		return { message: t('settings.about.update_check_failed', { error: detail }), error: true };
	} finally {
		updateState.checking = false;
	}
}

/** Send a packaged build to the releases page. Their package manager does the actual updating; all
 *  the app can do is say a new version exists and get out of the way. */
export function openDownloadPage() {
	openExternal(RELEASES_URL).catch((e: unknown) => toast.error(t('toasts.browser_failed', { error: String(e) })));
}

/** Download + install the pending update, then relaunch into the new version. */
export async function installUpdate() {
	if (!pending) return;
	updateState.installing = true;
	try {
		// Re-read the manifest first. A banner can sit on screen for hours, and an installer replaced
		// in place since then no longer matches the signature it was offered with, so the plugin
		// refuses it (#436, 1.2.0's Windows swap). `look` swaps `pending` for the current one.
		if (!(await look())) {
			updateState.available = null;
			updateState.installing = false;
			return;
		}
		// The manifest went unusable and `look` fell back to the releases API: the banner now offers
		// the download page instead, and there is nothing signed to install.
		if (!updateState.canInstall) {
			updateState.installing = false;
			return;
		}
		await pending.downloadAndInstall();
		await relaunch();
	} catch (e) {
		toast.error(t('toasts.update_failed', { error: String(e) }));
		updateState.installing = false;
	}
}
