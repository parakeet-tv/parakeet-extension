import { writable } from 'svelte/store';

/**
 * Runtime streaming state (not persisted)
 */
export const isStreaming = writable<boolean>(false);

/**
 * WebSocket connection state (not persisted)
 */
export const isConnected = writable<boolean>(false);
