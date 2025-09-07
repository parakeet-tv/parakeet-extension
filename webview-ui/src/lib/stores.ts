import { writable } from 'svelte/store';

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
