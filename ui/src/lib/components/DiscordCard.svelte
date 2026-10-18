<script lang="ts">
	// A faithful mock of Discord's "Listening to…" activity card, driven by the same config object
	// `src-tauri/src/discord.rs` builds the real payload from. It is the whole point of the Discord
	// settings tab: the options below it are abstract ("line 2 shows the album") until you can see
	// what your friends will read.
	//
	// The colors are Discord's, hardcoded rather than taken from the theme tokens. This is a picture
	// of another application, so following the user's Veluna theme would make it *less* accurate,
	// not more. Same reasoning for the English strings marked below: Discord renders "Listening to"
	// in the *viewer's* language, and the button labels are ours, sent over the wire in English.
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { MoreHorizontalIcon, MusicNote01Icon } from '@hugeicons/core-free-icons';
	import { t } from '$lib/i18n.svelte';
	import { thumb } from '$lib/thumb';
	// The bundled logo, not `appIcon.src`: the badge Rust sends is a fixed URL to the repo's own
	// icon, so a user who replaced their app icon (#173) must not see that reflected here.
	import velunaLogo from '$lib/assets/favicon.svg';
	import type { DiscordConfig, PreviewTrack } from '$lib/discord';
	import { cardText, cardLink, BUTTON_LABELS } from '$lib/discord';

	let {
		cfg,
		track,
		enabled,
		paused = false,
		position = 0,
		duration = 0
	}: {
		cfg: DiscordConfig;
		track: PreviewTrack;
		enabled: boolean;
		paused?: boolean;
		position?: number;
		duration?: number;
	} = $props();

	/** Discord's own wording, deliberately untranslated — see the note at the top. */
	const LISTENING_TO = 'Listening to';

	const appName = $derived(cfg.app_name.trim() || 'Veluna');
	// The profile card's header is *always* the application name. `status_display_type` only moves
	// the one-line status Discord writes under your name in the member list, which is why that gets
	// its own mock below rather than being folded into this header.
	const line1 = $derived(cardText(cfg.line1, track) ?? track.title);
	const line2 = $derived(cardText(cfg.line2, track));
	// Under "hide details" there is nothing left but the app name, in both places.
	const statusText = $derived(
		cfg.hide_details
			? appName
			: cfg.status_line === 'line1'
				? line1
				: cfg.status_line === 'line2'
					? (line2 ?? appName)
					: appName
	);
	// Is this card actually on the profile right now? When it is not, the preview still draws it —
	// you are editing a layout, and taking it away mid-edit loses the thing you are working on — but
	// dimmed, with a line underneath saying why.
	const offAir = $derived(!enabled || (paused && !cfg.show_paused));
	// Discord has no paused state, so the backend drops the timeline rather than leaving a bar that
	// keeps advancing. That only applies to a card that is up: an off-air one is showing what it
	// *would* look like, and it would look like playback.
	const showBar = $derived(cfg.timestamps && !(paused && cfg.show_paused));
	// `large_text` is a third *line* on the card, not only the artwork's tooltip — which is exactly
	// what the first cut of this preview got wrong.
	const line3 = $derived(cfg.cover ? cardText(cfg.line3, track) : null);
	// A part is only drawn as a link when the switch is on *and* this track actually has something
	// to point at: an autoplayed track with no linked artist can't have a clickable artist line, and
	// showing one here would promise a link Discord never receives.
	// Line 1 falls back to the title when its slot is empty, so the link follows the fallback —
	// the same rule as `push_card` in discord.rs.
	const line1Slot = $derived(cardText(cfg.line1, track) === null ? 'title' : cfg.line1);
	const link1 = $derived(cfg.link_line1 && !!cardLink(line1Slot, track));
	const link2 = $derived(cfg.link_line2 && !!cardLink(cfg.line2, track));
	const linkCover = $derived(
		cfg.link_cover && !!(cardLink('album', track) ?? cardLink('title', track))
	);
	const buttons = $derived(
		[cfg.button1, cfg.button2].filter(
			(k) => k !== 'off' && (k === 'app' || !!cardLink(k === 'listen' ? 'title' : k, track))
		)
	);

	const art = $derived(thumb(track.thumbnail, 128));
	const badge = $derived(cfg.cover && cfg.badge);
	const pct = $derived(duration > 0 ? Math.min(100, (position / duration) * 100) : 0);

	function clock(secs: number) {
		const s = Math.max(0, Math.floor(secs));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}
</script>

<h4 class="mb-1.5 text-[11px] font-medium text-muted-foreground">
	{t('settings.discord.preview_card')}
</h4>
<div class={offAir ? 'opacity-45 transition-opacity' : 'transition-opacity'}>
<!-- Fixed width-ish: Discord's popout is ~300px and the card reads wrong stretched to the modal. -->
<div
	class="w-full max-w-[22rem] rounded-lg bg-[#232428] px-3 py-2.5 text-left shadow-lg ring-1 ring-black/40 select-none"
>
	<div class="mb-2 flex items-center gap-2">
		<span class="min-w-0 flex-1 truncate text-[12px] leading-4 font-semibold text-[#b5bac1]">
			{LISTENING_TO}
			{appName}
		</span>
		<HugeiconsIcon icon={MoreHorizontalIcon} size={16} class="shrink-0 text-[#b5bac1]" />
	</div>

	{#if !cfg.hide_details}
	<div class="flex gap-3">
		{#if cfg.cover}
			<div
				class="relative size-[60px] shrink-0 rounded bg-[#1e1f22] {linkCover
					? 'cursor-pointer ring-1 ring-[#b5bac1]/50'
					: ''}"
				title={line3 ?? undefined}
			>
				{#if art}
					<img src={art} alt="" class="size-full rounded object-cover" draggable="false" />
				{:else}
					<div
						class="flex size-full items-center justify-center rounded bg-gradient-to-br from-[#5865f2]/50 to-[#eb459e]/40"
					>
						<HugeiconsIcon icon={MusicNote01Icon} size={22} class="text-white/70" />
					</div>
				{/if}
				{#if badge}
					<!-- Discord draws `small_image` as a circle clipped to the artwork's bottom-right. -->
					<img
						src={velunaLogo}
						alt=""
						class="absolute -right-1 -bottom-1 size-[22px] rounded-full ring-2 ring-[#232428]"
						draggable="false"
					/>
				{/if}
			</div>
		{/if}

		<div class="flex min-w-0 flex-1 flex-col justify-center gap-[1px]">
			<div
				class="truncate text-[14px] leading-[18px] font-semibold text-[#f2f3f5] {link1
					? 'cursor-pointer underline decoration-dotted underline-offset-[3px] hover:decoration-solid'
					: ''}"
			>
				{line1}
			</div>
			{#if line2}
				<div
					class="truncate text-[13px] leading-[17px] text-[#dbdee1] {link2
						? 'cursor-pointer underline decoration-dotted underline-offset-[3px] hover:decoration-solid'
						: ''}"
				>
					{line2}
				</div>
			{/if}
			{#if line3}
				<div class="truncate text-[13px] leading-[17px] text-[#b5bac1]">{line3}</div>
			{/if}
			{#if showBar}
				<div class="mt-1.5 flex items-center gap-2">
					<span class="shrink-0 font-mono text-[11px] leading-none text-[#b5bac1]">
						{clock(position)}
					</span>
					<div class="h-[4px] flex-1 overflow-hidden rounded-full bg-white/15">
						<div class="h-full rounded-full bg-[#dbdee1]" style:width="{pct}%"></div>
					</div>
					<span class="shrink-0 font-mono text-[11px] leading-none text-[#b5bac1]">
						{clock(duration)}
					</span>
				</div>
			{/if}
		</div>
	</div>

	{/if}

	{#if buttons.length && !cfg.hide_details}
		<div class="mt-2.5 flex flex-col gap-1.5">
			<!-- Unkeyed: both slots can hold the same choice, and two identical keys throw. -->
			{#each buttons as kind}
				<div
					class="cursor-pointer rounded-[3px] bg-[#4e5058] px-3 py-1.5 text-center text-[13px] leading-4 font-medium text-white transition-colors hover:bg-[#6d6f78]"
				>
					{BUTTON_LABELS[kind]}
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- The member-list row: the only place `status_display_type` is visible, and the reason the Status
     setting looked broken when the card header (always the app name) was showing it instead. -->
<h4 class="mt-4 mb-1.5 text-[11px] font-medium text-muted-foreground">
	{t('settings.discord.preview_status')}
</h4>
<div
	class="flex w-full max-w-[22rem] items-center gap-2 rounded-lg bg-[#2b2d31] px-2 py-1.5 ring-1 ring-black/40 select-none"
>
	<div
		class="size-8 shrink-0 rounded-full bg-gradient-to-br from-[#5865f2] to-[#eb459e] ring-2 ring-[#2b2d31]"
	></div>
	<div class="min-w-0 flex-1">
		<div class="truncate text-[15px] leading-[18px] font-medium text-[#dbdee1]">
			{t('settings.discord.preview_you')}
		</div>
		<div class="flex items-center gap-1 text-[12px] leading-4 text-[#b5bac1]">
			<HugeiconsIcon icon={MusicNote01Icon} size={11} class="shrink-0" />
			<span class="truncate">{statusText}</span>
		</div>
		</div>
	</div>
</div>

{#if offAir}
	<p class="mt-2.5 max-w-[22rem] text-xs leading-relaxed text-muted-foreground">
		{enabled ? t('settings.discord.preview_paused') : t('settings.discord.off_notice')}
	</p>
{/if}
