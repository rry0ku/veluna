<script lang="ts">
	import { goto } from '$app/navigation';
	import type { ArtistRun } from '$lib/api';
	import Marquee from './Marquee.svelte';

	let {
		runs,
		text,
		marquee = false,
		class: cls = ''
	}: {
		/** Per-run artist links; when empty the line renders as plain `text`. */
		runs?: ArtistRun[];
		/** The flattened artist line, used as fallback and as the truncation source. */
		text: string;
		/** Scroll the line instead of truncating it, when it doesn't fit (player bar only). */
		marquee?: boolean;
		class?: string;
	} = $props();

	const linked = $derived(runs?.some((r) => r.id) ? runs! : undefined);
</script>

{#snippet line()}
	{#if linked}
		{#each linked as run}
			{#if run.id}
				<button
					class="cursor-pointer text-left hover:text-foreground hover:underline"
					onclick={(e) => {
						e.stopPropagation();
						goto(`/artist/${encodeURIComponent(run.id!)}`);
					}}
				>
					{run.text}
				</button>
			{:else}
				{run.text}
			{/if}
		{/each}
	{:else}
		{text}
	{/if}
{/snippet}

{#if marquee}
	<!-- Its own Marquee, so a long title scrolling above doesn't drag a short artist line with it. -->
	<Marquee {text} class="min-w-0 {cls}">{@render line()}</Marquee>
{:else}
	<span class="min-w-0 truncate {cls}">{@render line()}</span>
{/if}
