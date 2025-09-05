<script lang="ts">
	import '../app.css';
	import '@vscode/codicons/dist/codicon.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ctx, isDarkTheme } from '$lib/ctx';
	import VscodeTheme from '$lib/vscode-theme.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		if (ctx === 'web' || isDarkTheme) {
			// Ensure that dark mode is enabled on web
			document.body.classList.add('dark');
		}
	});
</script>

<svelte:head>
	<title>Parakeet.tv Extension</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if ctx === 'extension'}
	{@render children?.()}
{:else}
	<!-- Add vs code theme to web to emulate the extension -->
	<VscodeTheme>
		<div class="h-screen w-80 max-w-80 overflow-auto bg-[var(--vscode-sideBar-background)] p-2">
			{@render children?.()}
		</div>
	</VscodeTheme>
{/if}
