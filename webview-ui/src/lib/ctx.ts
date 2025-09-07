import { isVscodeDark } from '$lib/theme';
import { ExtensionMode } from './types';

export type Context = 'extension' | 'web';
export const appCtx: Context = typeof vscode !== 'undefined' ? 'extension' : 'web';
export const isDarkTheme = isVscodeDark();
export const isChatMode =
	typeof __PARAKEET_CHAT_MODE__ !== 'undefined' && __PARAKEET_CHAT_MODE__ === true;
const extensionMode =
	typeof __PARAKEET_EXTENSION_MODE__ !== 'undefined' ? __PARAKEET_EXTENSION_MODE__ : undefined;
export const isDev = extensionMode === ExtensionMode.Development;
export const isProd = extensionMode === ExtensionMode.Production;
export const isTest = extensionMode === ExtensionMode.Test;

export const authUrl = isDev ? 'http://localhost:5173/extension/auth' : 'https://parakeet.tv/extension/auth';