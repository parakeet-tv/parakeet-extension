import { get, writable } from 'svelte/store';
import z from 'zod';
import { appCtx } from './ctx';

const settingsStateSchema = z.object({
	streamKey: z.string().default(''),
	shareOption: z.enum(['current-file', 'directory', 'everything']).default('current-file'),
	streamTitle: z.string().default(''),
	streamDescription: z.string().default(''),
	saveVod: z.boolean().default(false),
	userTags: z.array(z.string()).default([]),
	autoTags: z.array(z.string()).default([])
});

export type SettingsState = z.infer<typeof settingsStateSchema>;

export const stateStore = writable<SettingsState>();

export const setSettingsState = (state: SettingsState) => {
	stateStore.set(state);
    setInternalSettingsState(state);
};

export const getSettingsState = () => {
	const existingState = get(stateStore);
	if (existingState) {
		return existingState;
	}

    const savedState = getInternalSettingsState();
    const parsedState = settingsStateSchema.parse(savedState || {});
    stateStore.set(parsedState);

	return parsedState;
};

const getInternalSettingsState = () => {
	if (appCtx === 'extension') {
		return vscode.getState();
	}

	const localState = localStorage.getItem('state');
	if (!localState) {
		return {};
	}

	return JSON.parse(localState);
}

const setInternalSettingsState = (state: SettingsState) => {
	if (appCtx === 'extension') {
		vscode.setState(state);
	} else {
		localStorage.setItem('state', JSON.stringify(state));
	}
}