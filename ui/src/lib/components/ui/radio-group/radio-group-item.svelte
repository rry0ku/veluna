<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<RadioGroupPrimitive.ItemProps> = $props();
</script>

<RadioGroupPrimitive.Item
	bind:ref
	data-slot="radio-group-item"
	class={cn(
		"border-input text-primary focus-visible:border-ring focus-visible:ring-ring/50 aspect-square size-4 shrink-0 cursor-pointer rounded-full border shadow-xs outline-none transition focus-visible:ring-[3px] data-checked:border-primary data-disabled:cursor-not-allowed data-disabled:opacity-50",
		className
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		<!-- The dot is the control itself, not an icon: a div, the way switch.svelte draws its thumb.
		     shadcn ships a lucide circle here; this project uses HugeIcons and neither set owns this. -->
		<div class="flex items-center justify-center">
			{#if checked}
				<div class="size-2 rounded-full bg-primary"></div>
			{/if}
		</div>
	{/snippet}
</RadioGroupPrimitive.Item>
