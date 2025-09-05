<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Badge } from '../badge/index';
	import { cn } from '$lib/utils';

	export let tags: string[] = [];
	export let readOnlyTags: string[] = [];
	export let placeholder = 'Add tags...';
	export let maxTags: number | undefined = undefined;
	export let className = '';

	const dispatch = createEventDispatcher<{
		change: string[];
	}>();

	let inputValue = '';
	let inputElement: HTMLInputElement;
	let containerElement: HTMLDivElement;

	/**
	 * Adds a new tag if the value is valid and not already in the list
	 */
	function addTag(value: string) {
		const trimmedValue = value.trim();
		const allTags = [...readOnlyTags, ...tags];
		if (trimmedValue && !allTags.includes(trimmedValue)) {
			if (maxTags === undefined || tags.length < maxTags) {
				tags = [...tags, trimmedValue];
				dispatch('change', tags);
			}
		}
		inputValue = '';
	}

	/**
	 * Removes a tag at the specified index
	 */
	function removeTag(index: number) {
		tags = tags.filter((_, i) => i !== index);
		dispatch('change', tags);
	}

	/**
	 * Handles keyboard events for tag input
	 */
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			if (inputValue.trim()) {
				addTag(inputValue);
			}
		} else if (event.key === 'Backspace' && inputValue === '' && tags.length > 0) {
			// Remove the last tag if input is empty and backspace is pressed
			removeTag(tags.length - 1);
		}
	}

	/**
	 * Focuses the input when the container is clicked
	 */
	function focusInput() {
		inputElement?.focus();
	}

	/**
	 * Handles input changes
	 */
	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		inputValue = target.value;
	}
</script>

<div
	bind:this={containerElement}
	class={cn(
		'border-input placeholder:text-muted-foreground focus-within:border-ring focus-within:ring-ring/50 shadow-xs flex min-h-9 w-full min-w-0 select-none flex-wrap items-center gap-1 rounded-md border bg-transparent px-3 py-1 text-base outline-none transition-[color,box-shadow] focus-within:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
		className
	)}
	role="button"
	tabindex="-1"
	onclick={focusInput}
	onkeydown={focusInput}
>
	{#each readOnlyTags as tag}
		<Badge class="cursor-default" variant="secondary">
			{tag}
		</Badge>
	{/each}

	{#each tags as tag, index}
		<Badge
			variant="secondary"
			class="cursor-pointer transition-colors hover:opacity-90"
			onclick={(e) => {
				e.stopPropagation();
				removeTag(index);
			}}
		>
			{tag}
			<span class="ml-0.5 text-xs opacity-60">×</span>
		</Badge>
	{/each}

	<input
		bind:this={inputElement}
		bind:value={inputValue}
		{placeholder}
		class="min-w-[100px] flex-1 bg-transparent text-sm outline-none"
		onkeydown={handleKeydown}
		oninput={handleInput}
		disabled={maxTags !== undefined && tags.length >= maxTags}
	/>
</div>
