import { writable } from 'svelte/store';
import { type ChatUserMsg } from 'parakeet-proto';

/**
 * Runtime streaming state (not persisted)
 */
export const isStreaming = writable<boolean>(false);

/**
 * WebSocket connection state (not persisted)
 */
export const isConnected = writable<boolean>(false);

/**
 * Authentication state (not persisted, synced from extension)
 */
export const authenticated = writable<boolean>(false);

/**
 * User information (not persisted, synced from extension)
 */
export const user = writable<{
	id: string;
	username: string;
	imageUrl: string;
} | null>(null);

/**
 * Chat messages (ephemeral state, not persisted)
 */
export const chatMessages = writable<ChatUserMsg[]>([]);

/**
 * Current message input value (ephemeral state)
 */
export const messageInput = writable<string>('');
