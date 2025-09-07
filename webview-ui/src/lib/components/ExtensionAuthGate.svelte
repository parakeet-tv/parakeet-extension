<script lang="ts">
	import { authenticated, user } from '$lib/stores';
	import { Button } from '$lib/components/ui/button';
	import favicon from '$lib/assets/favicon.svg';
	import { authUrl } from '$lib/ctx';

	let { children } = $props();
</script>

{#if $authenticated && $user}
	{@render children?.()}
{:else}
	<div
		class="flex h-screen w-full flex-col items-center justify-center gap-2 text-balance p-2 text-center"
	>
		<img src={favicon} alt="Parakeet.tv" class="size-16" />
		<div>
			Please login with <a class="text-primary underline" href="https://parakeet.tv" target="_blank"
				>Parakeet.tv</a
			> to continue.
		</div>
		<Button class="w-full max-w-60 mt-8 text-primary-foreground!" href={authUrl} target="_blank">
			Log in
		</Button>
	</div>
{/if}
