<script lang="ts">
	import SendIcon from '@lucide/svelte/icons/send';
	import {
		chatMessages,
		messageInput,
		authenticated,
		user,
	} from '$lib/stores';
	import { type ChatUserMsg } from 'parakeet-proto';
	import { appCtx } from '$lib/ctx';

	// Maximum message length and chat history
	const MAX_MESSAGE_LENGTH = 200;
	const MAX_MESSAGES = 200;

	// Generate a consistent color for each user based on their ID
	function getUserColor(userId: string): string {
		const colors = [
			'#ef4444', // red-500
			'#f97316', // orange-500
			'#eab308', // yellow-500
			'#22c55e', // green-500
			'#06b6d4', // cyan-500
			'#3b82f6', // blue-500
			'#8b5cf6', // violet-500
			'#ec4899', // pink-500
			'#f59e0b', // amber-500
			'#10b981', // emerald-500
			'#6366f1', // indigo-500
			'#8b5cf6' // purple-500
		];

		// Simple hash function to pick a color consistently
		let hash = 0;
		for (let i = 0; i < userId.length; i++) {
			const char = userId.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}

		return colors[Math.abs(hash) % colors.length];
	}

	// Add a new message to the chat
	function addMessage(msg: ChatUserMsg) {
		const chatMessage: ChatUserMsg = {
			id: msg.id || crypto.randomUUID(),
			sentAt: msg.sentAt || Date.now(),
			user: {
				id: msg.user?.id || 'unknown',
				username: msg.user?.username || 'Anonymous',
				displayName: msg.user?.displayName || msg.user?.username || 'Anonymous',
				color: msg.user?.color || getUserColor(msg.user?.id || 'unknown'),
				badgeIds: msg.user?.badgeIds || []
			},
			content: msg.content || ''
		};

		chatMessages.update((messages) => {
			const newMessages = [...messages, chatMessage];
			// Limit messages to MAX_MESSAGES
			if (newMessages.length > MAX_MESSAGES) {
				return newMessages.slice(-MAX_MESSAGES);
			}
			return newMessages;
		});
	}

	// Send a chat message
	function sendMessage() {
		if (!$authenticated || !$user || !$messageInput.trim()) return;

		const trimmedMessage = $messageInput.trim();
		if (trimmedMessage.length > MAX_MESSAGE_LENGTH) return;

		const chatMsg = {
			id: crypto.randomUUID(),
			sentAt: Date.now(),
			user: {
				id: $user.id,
				username: $user.username || 'Anonymous',
				displayName: $user.username || 'Anonymous',
				color: getUserColor($user.id),
				badgeIds: []
			},
			content: trimmedMessage
		};

		// Add message immediately to local state
		addMessage(chatMsg);

		// Send to extension
		if (appCtx === 'extension') {
			vscode.postMessage({
				command: 'sendChatMessage',
				message: chatMsg
			});
		}

		// Clear input
		messageInput.set('');
	}

	// Handle key press in input
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			sendMessage();
		}
	}

	// Handle chat input click for non-authenticated users
	function handleInputClick() {
		if (!$authenticated && appCtx === 'extension') {
			// Request authentication through extension
			vscode.postMessage({ command: 'requestAuth' });
		}
	}

	// Listen for messages from the extension
	$effect(() => {
		if (appCtx !== 'extension') return;

		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			if (message.command === 'chatMessage') {
				// Don't add messages we just sent (they're already in the list)
				const isDuplicate = $chatMessages.some(
					(m) =>
						m.id === message.message.id &&
						m.user.id === message.message.user?.id &&
						Math.abs(m.sentAt - (message.message.sentAt || 0)) < 1000 // Within 1 second
				);

				if (!isDuplicate) {
					addMessage(message.message);
				}
			}
		};

		window.addEventListener('message', messageHandler);
		return () => window.removeEventListener('message', messageHandler);
	});

	// Format timestamp
	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="flex h-full max-h-full flex-col overflow-hidden text-xs">
	<!-- Messages Container -->
	<div class="mt-auto flex max-h-full flex-1 flex-col justify-end overflow-y-auto p-1">
		{#if $chatMessages.length === 0}
			<div class="text-muted-foreground">
				{$authenticated ? 'Chat messages will appear here...' : 'Sign in to join the chat!'}
			</div>
		{:else}
			<div class="flex flex-col space-y-0.5">
				{#each $chatMessages as message (message.id)}
					<p class="break-words">
						<span class="font-medium" style="color: {message.user.color}"
							>{message.user.displayName || message.user.username}</span
						><span>:</span>
						<span class="text-foreground ml-0.5 break-words">
							{message.content}
						</span>
					</p>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Message Input -->
	<div class="p-1">
		<div class="relative">
			<input
				bind:value={$messageInput}
				type="text"
				placeholder={'Type a message...'}
				maxlength={MAX_MESSAGE_LENGTH}
				disabled={!$authenticated}
				class="border-border bg-input focus:ring-ring w-full rounded-md border px-2 py-1 pr-12 focus:outline-none focus:ring-2 disabled:cursor-pointer disabled:opacity-50"
				onkeypress={handleKeyPress}
				onclick={handleInputClick}
			/>
			<button
				onclick={sendMessage}
				disabled={!$messageInput.trim() || $messageInput.trim().length > MAX_MESSAGE_LENGTH}
				class="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2 p-1 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<SendIcon size={16} />
			</button>
		</div>
	</div>
</div>
