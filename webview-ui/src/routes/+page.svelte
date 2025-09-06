<script lang="ts">
	import { isChatMode } from '$lib/ctx';
	import MainPanelView from '$lib/components/MainPanelView.svelte';
	import ChatPanelView from '$lib/components/ChatPanelView.svelte';
</script>

{#if isChatMode}
	<ChatPanelView />
{:else}
	<MainPanelView />
{/if}