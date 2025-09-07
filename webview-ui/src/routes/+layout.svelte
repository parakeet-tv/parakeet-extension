<script lang="ts">
	import '../app.css';
	import '@vscode/codicons/dist/codicon.css';
	import favicon from '$lib/assets/favicon.svg';
	import { appCtx, isDarkTheme } from '$lib/ctx';
	import VscodeTheme from '$lib/vscode-theme.svelte';
	import { onMount } from 'svelte';
	import { authenticated, user } from '$lib/stores';
	import ExtensionAuthGate from '$lib/components/ExtensionAuthGate.svelte';

	let { children } = $props();

	onMount(() => {
		if (appCtx === 'web' || isDarkTheme) {
			// Ensure that dark mode is enabled
			document.body.classList.add('dark');
		}

		// Request initial auth state for extension context
		if (appCtx === 'extension') {
			vscode.postMessage({ command: 'getAuthState' });
		}
	});

	// Set up auth message handling for extension context
	$effect(() => {
		if (appCtx === 'extension') {
			const messageHandler = (event: MessageEvent) => {
				const message = event.data;
				if (message.command === 'authStateChanged') {
					authenticated.set(message.authenticated);
					user.set(message.user);
				}
			};

			window.addEventListener('message', messageHandler);

			// Cleanup
			return () => {
				window.removeEventListener('message', messageHandler);
			};
		}
	});
</script>

<svelte:head>
	<title>Parakeet.tv Extension</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if appCtx === 'extension'}
	<ExtensionAuthGate>
		{@render children?.()}
	</ExtensionAuthGate>
{:else}
	<!-- Add vs code theme to web to emulate the extension -->
	<VscodeTheme>
		<div class="h-screen w-80 max-w-80 overflow-auto bg-[var(--vscode-sideBar-background)] p-2">
			{@render children?.()}
		</div>
	</VscodeTheme>
{/if}
