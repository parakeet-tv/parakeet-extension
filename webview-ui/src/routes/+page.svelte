<script lang="ts">
	import { onMount } from 'svelte';
	import { stateStore, getState, setState, type State } from '$lib/state';
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

	let state: State = $state(getState());

	function handleTagsChange(tags: string[]) {
		state.userTags = tags;
		setState(state);
	}

	// Listen for messages from the extension
	$effect(() => {
		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			if (message.command === 'tagsGenerated') {
				state.autoTags = message.tags;
				setState(state);
			}
		};

		window.addEventListener('message', messageHandler);
		return () => window.removeEventListener('message', messageHandler);
	});

	onMount(() => {
		if (ctx === 'extension') {
			vscode.postMessage({ command: 'generateTags' });
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
		value={state.streamKey}
		oninput={(e: any) => {
			state.streamKey = e.target.value;
			setState(state);
		}}
	></Input>
</div>

<!-- Stream Settings Section -->
<div class="mb-6 flex flex-col gap-4">
	<h2 class="text-lg font-semibold">Stream Settings</h2>

	<div class="mb-4">
		<Label class="mb-2">What to share:</Label>

		<RadioGroup.Root
			value={state.shareOption}
			onValueChange={(value) => {
				state.shareOption = value as State['shareOption'];
				setState(state);
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
			bind:checked={state.saveVod}
			onCheckedChange={(checked) => {
				state.saveVod = checked;
				setState(state);
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
			value={state.streamTitle}
			oninput={(e: any) => {
				state.streamTitle = e.target.value;
				setState(state);
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
			tags={state.userTags}
			readOnlyTags={state.autoTags}
			placeholder=""
			maxTags={3}
			on:change={(event) => handleTagsChange(event.detail)}
			className="w-full"
		/>
	</div>
	<Button
		onclick={() => {
			vscode.postMessage({ command: 'startStream' });
		}}
		class="w-full">Start Stream</Button
	>
</div>
