<script lang="ts">
	import { onMount } from 'svelte';
	import { stateStore, getState, setState, type State } from '$lib/state';
	import { isStreaming, isConnected } from '$lib/stores';
	import favicon from '$lib/assets/favicon.svg';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import Textarea from '$lib/components/ui/textarea/textarea.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Switch } from '$lib/components/ui/switch/index';
	import * as Tooltip from '$lib/components/ui/tooltip/index';
	import { TagsInput } from '$lib/components/ui/tags-input/index';
	import { ctx } from '$lib/ctx';
	import { InfoIcon } from '@lucide/svelte';

	let savedState: State = $state(getState());
	let viewerCount = $state(0);

	function handleTagsChange(tags: string[]) {
		savedState.userTags = tags;
		setState(savedState);
	}

	// Listen for messages from the extension
	$effect(() => {
		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			if (message.command === 'tagsGenerated') {
				savedState.autoTags = message.tags;
				setState(savedState);
			} else if (message.command === 'streamingStateChanged') {
				isStreaming.set(message.isStreaming);
				isConnected.set(message.isConnected);
				viewerCount = message.viewerCount;
			}
		};

		window.addEventListener('message', messageHandler);
		return () => window.removeEventListener('message', messageHandler);
	});

	onMount(() => {
		if (ctx === 'extension') {
			vscode.postMessage({ command: 'generateTags' });
			vscode.postMessage({ command: 'getStreamingState' });
		}
	});
</script>

<a
	class="mb-4 flex items-center gap-2 text-center font-mono"
	href="https://parakeet.tv"
	target="_blank"
>
	<img src={favicon} alt="Parakeet.tv" class="h-6 w-6" /> Parakeet.tv
</a>



<!-- Stream Key Section -->
<div class="mb-6">
	<h2 class="mb-2 text-lg font-semibold">Stream Key</h2>
	<Input
		placeholder="Enter your stream key"
		type="password"
		autocomplete="off"
		autosave="stream-key"
		value={savedState.streamKey}
		oninput={(e: any) => {
			savedState.streamKey = e.target.value;
			setState(savedState);
		}}
	></Input>
</div>

<!-- Stream Settings Section -->
<div class="mb-6 flex flex-col gap-4">
	<h2 class="text-lg font-semibold">Stream Settings</h2>

	<div class="mb-4">
		<Label class="mb-2">What to share:</Label>

		<RadioGroup.Root
			value={savedState.shareOption}
			onValueChange={(value) => {
				savedState.shareOption = value as State['shareOption'];
				setState(savedState);
			}}
		>
			<div class="flex items-center space-x-2">
				<RadioGroup.Item value="current-file" id="current-file" />
				<Label for="current-file" class="flex items-center gap-1"
					>Current file only
					<Tooltip.Provider>
						<Tooltip.Root>
							<Tooltip.Trigger>
								<InfoIcon class="size-4" />
							</Tooltip.Trigger>
							<Tooltip.Content class="max-w-60">
								<p>
									Only your current file will be shared. Viewers will be able to see the entire file
									that you have open, but will not be able to see any other files or your directory
									structure. Files ignored by git will not be shared.
								</p>
							</Tooltip.Content>
						</Tooltip.Root>
					</Tooltip.Provider></Label
				>
			</div>
			<div class="flex items-center space-x-2">
				<RadioGroup.Item value="directory" id="directory" />
				<Label for="directory"
					>Full directory structure
					<Tooltip.Provider>
						<Tooltip.Root>
							<Tooltip.Trigger>
								<InfoIcon class="size-4" />
							</Tooltip.Trigger>
							<Tooltip.Content class="max-w-60">
								<p>
									Only your current file will be shared. Viewers will be able to see the entire
									directory structure of your project, but will not be able to view other files.
									Files ignored by git will not be shared.
								</p>
							</Tooltip.Content>
						</Tooltip.Root>
					</Tooltip.Provider></Label
				>
			</div>
			<div class="flex items-center space-x-2">
				<RadioGroup.Item value="everything" id="everything" />
				<Label for="everything"
					>Everything
					<Tooltip.Provider>
						<Tooltip.Root>
							<Tooltip.Trigger>
								<InfoIcon class="size-4" />
							</Tooltip.Trigger>
							<Tooltip.Content class="max-w-60">
								<p>
									All files in your project will be shared. Viewers will be able to browse and view
									everything in your project, even if you do not have them open. Files ignored by
									git will not be shared.
								</p>
							</Tooltip.Content>
						</Tooltip.Root>
					</Tooltip.Provider></Label
				>
			</div>
		</RadioGroup.Root>
	</div>

	<div class="flex flex-row items-center gap-2">
		<Switch
			bind:checked={savedState.saveVod}
			onCheckedChange={(checked) => {
				savedState.saveVod = checked;
				setState(savedState);
			}}
		/>
		<Label
			>Save VOD<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<InfoIcon class="size-4" />
					</Tooltip.Trigger>
					<Tooltip.Content class="max-w-60">
						<p>
							Your livestream will be recorded and available as a video-on-demand (VOD) on
							Parakeet.tv.
						</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider></Label
		>
	</div>

	<div class="mb-4">
		<Label class="mb-2">Stream title</Label>
		<Textarea
			placeholder="Enter stream title"
			value={savedState.streamTitle}
			oninput={(e: any) => {
				savedState.streamTitle = e.target.value;
				setState(savedState);
			}}
			class="w-full"
		></Textarea>
	</div>

	<div class="mb-4">
		<Label class="mb-2 flex items-center gap-1 font-medium"
			>Tags<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<InfoIcon class="size-4" />
					</Tooltip.Trigger>
					<Tooltip.Content class="max-w-60">
						<p>
							Tags help viewers find your content on Parakeet.tv. Some of these are auto-generated
							based on your project, but you can add your own.
						</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider></Label
		>
		<TagsInput
			tags={savedState.userTags}
			readOnlyTags={savedState.autoTags}
			placeholder=""
			maxTags={3}
			on:change={(event) => handleTagsChange(event.detail)}
			className="w-full"
		/>
	</div>
	<div class="flex gap-2 flex-col">
		<Button
			onclick={() => {
				if ($isStreaming) {
					vscode.postMessage({ command: 'stopStream' });
				} else {
					vscode.postMessage({ command: 'startStream' });
				}
			}}
			variant={$isStreaming ? "outline" : "default"}
			class="flex-1"
		>
			{$isStreaming ? 'Stop Stream' : 'Start Stream'}
		</Button>
		{#if $isStreaming}
			<div class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-2">
				<div class="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
				Now LIVE on Parakeet.tv
				<br />
				Viewers: {viewerCount}
			</div>
		{/if}
	</div>
</div>
