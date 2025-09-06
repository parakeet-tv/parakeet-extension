import { isVscodeDark } from '$lib/theme';

export type Context = 'extension' | 'web';
export const ctx: Context = typeof vscode !== 'undefined' ? 'extension' : 'web';
export const isDarkTheme = isVscodeDark();
export const isChatMode = typeof __PARAKEET_CHAT_MODE__ !== 'undefined' && __PARAKEET_CHAT_MODE__ === true;