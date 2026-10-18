<script lang="ts">
	// The Spotify import's "Experimental" mark (#375), styled like the badge on Settings ▸ Themes.
	import { t } from '$lib/i18n.svelte';
</script>

<span
	class="shrink-0 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
	title={t('import.experimental_tooltip')}
>
	{t('import.experimental')}
</span>
