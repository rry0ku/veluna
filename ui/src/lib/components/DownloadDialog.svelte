<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Cancel01Icon,
		Download01Icon,
		Folder01Icon,
		Tick02Icon,
		MusicNote01Icon
	} from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { thumb } from '$lib/thumb';
	import { t } from '$lib/i18n.svelte';
	import { downloadManager, QUALITY_OPTIONS } from '$lib/download.svelte';

	const track = $derived(downloadManager.dialogTrack);

	async function submit() {
		if (!track) return;
		const targetTrack = track;
		const quality = downloadManager.selectedQuality;
		downloadManager.closeDialog();
		await downloadManager.downloadTrack(targetTrack, quality);
	}
</script>

{#if downloadManager.dialogOpen && track}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) downloadManager.closeDialog();
		}}
	>
		<!-- Modal Content -->
		<div
			class="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl"
			transition:scale={{ duration: 180, start: 0.96, easing: cubicOut }}
			role="dialog"
			aria-modal="true"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b px-5 py-4">
				<div class="flex items-center gap-2">
					<HugeiconsIcon icon={Download01Icon} class="h-5 w-5 text-primary" />
					<h2 class="text-base font-semibold">{t('download.title')}</h2>
				</div>
				<button
					class="rounded-full p-1 text-muted-foreground hover:bg-accent/20 hover:text-foreground"
					onclick={() => downloadManager.closeDialog()}
					aria-label={t('common.close')}
				>
					<HugeiconsIcon icon={Cancel01Icon} class="h-4 w-4" />
				</button>
			</div>

			<!-- Track Overview -->
			<div class="flex items-center gap-3 bg-muted/30 px-5 py-3">
				{#if track.thumbnail}
					<img
						src={thumb(track.thumbnail, 96)}
						alt=""
						class="h-12 w-12 shrink-0 rounded-lg object-cover shadow-sm"
					/>
				{:else}
					<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
						<HugeiconsIcon icon={MusicNote01Icon} class="h-6 w-6" />
					</div>
				{/if}
				<div class="min-w-0 flex-1">
					<p class="truncate font-medium text-sm text-foreground">{track.title}</p>
					<p class="truncate text-xs text-muted-foreground">{track.artists}</p>
					{#if track.album}
						<p class="truncate text-[11px] text-muted-foreground/70">{track.album}</p>
					{/if}
				</div>
			</div>

			<!-- Quality Selector Body -->
			<div class="max-h-[300px] overflow-y-auto px-5 py-3">
				<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{t('download.select_quality')}
				</p>
				<div class="flex flex-col gap-2">
					{#each QUALITY_OPTIONS as opt (opt.id)}
						{@const isSelected = downloadManager.selectedQuality === opt.id}
						<button
							type="button"
							class="flex cursor-pointer items-start justify-between rounded-xl border p-3 text-left transition {isSelected
								? 'border-primary bg-primary/5 ring-1 ring-primary'
								: 'border-border/60 bg-card hover:bg-accent/10'}"
							onclick={() => (downloadManager.selectedQuality = opt.id)}
						>
							<div class="min-w-0 pr-3">
								<div class="flex items-center gap-2">
									<span class="font-medium text-sm text-foreground">{opt.title}</span>
									<span
										class="rounded px-1.5 py-0.5 text-[10px] font-semibold {isSelected
											? 'bg-primary text-primary-foreground'
											: 'bg-muted text-muted-foreground'}"
									>
										{opt.badge}
									</span>
								</div>
								<p class="mt-1 text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
							</div>
							<div
								class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition mt-0.5 {isSelected
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-muted-foreground/30'}"
							>
								{#if isSelected}
									<HugeiconsIcon icon={Tick02Icon} class="h-3.5 w-3.5" />
								{/if}
							</div>
						</button>
					{/each}
				</div>
			</div>

			<!-- Destination & Preferences Footer -->
			<div class="flex flex-col gap-3 border-t bg-card/60 px-5 py-3.5 text-xs">
				<!-- Folder picker row -->
				<div class="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-2.5">
					<div class="flex min-w-0 items-center gap-2.5">
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
							<HugeiconsIcon icon={Folder01Icon} class="h-4 w-4" />
						</div>
						<div class="min-w-0">
							<p class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
								{t('download.save_location')}
							</p>
							{#if downloadManager.downloadDir}
								<p class="truncate font-mono text-xs text-foreground" title={downloadManager.downloadDir}>
									{downloadManager.downloadDir}
								</p>
							{:else}
								<p class="text-xs italic text-muted-foreground">
									{t('download.no_folder_selected')}
								</p>
							{/if}
						</div>
					</div>

					<div class="flex shrink-0 items-center gap-1.5">
						{#if downloadManager.downloadDir}
							<Button
								variant="ghost"
								size="sm"
								class="h-7 px-2 text-xs"
								onclick={() => downloadManager.openFolder()}
							>
								{t('download.open_folder')}
							</Button>
						{/if}
						<Button
							variant="outline"
							size="sm"
							class="h-7 px-2.5 text-xs gap-1.5"
							onclick={() => downloadManager.pickFolder()}
						>
							<HugeiconsIcon icon={Folder01Icon} class="h-3.5 w-3.5" />
							{downloadManager.downloadDir ? t('download.change_folder') : t('download.choose_folder')}
						</Button>
					</div>
				</div>

				<!-- Checkbox & action row -->
				<div class="flex flex-wrap items-center justify-between gap-3 pt-1">
					<label class="flex cursor-pointer items-center gap-2 select-none text-xs text-muted-foreground hover:text-foreground transition-colors">
						<Checkbox
							bind:checked={downloadManager.rememberChoice}
						/>
						<span>{t('download.remember_choice')}</span>
					</label>

					<div class="flex items-center gap-2 self-end">
						<Button variant="ghost" size="sm" onclick={() => downloadManager.closeDialog()}>
							{t('common.cancel')}
						</Button>
						<Button size="sm" class="gap-1.5" onclick={submit}>
							<HugeiconsIcon icon={Download01Icon} class="h-4 w-4" />
							{t('download.start')}
						</Button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
