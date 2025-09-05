import { get, writable } from 'svelte/store';
import z from 'zod';
import { ctx } from './ctx';

const stateSchema = z.object({
	streamKey: z.string().default(''),
	shareOption: z.enum(['current-file', 'directory', 'everything']).default('current-file'),
	streamTitle: z.string().default(''),
	streamDescription: z.string().default(''),
	saveVod: z.boolean().default(false),
	userTags: z.array(z.string()).default([]),
	autoTags: z.array(z.string()).default([])
});

export type State = z.infer<typeof stateSchema>;

export const stateStore = writable<State>();

export const setState = (state: State) => {
	stateStore.set(state);
    setInternalState(state);
};

export const getState = () => {
	const existingState = get(stateStore);
	if (existingState) {
		return existingState;
	}

    const savedState = getInternalState();
    const parsedState = stateSchema.parse(savedState || {});
    stateStore.set(parsedState);

	return parsedState;
};

const getInternalState = () => {
	if (ctx === 'extension') {
		return vscode.getState();
	}

	const localState = localStorage.getItem('state');
	if (!localState) {
		return {};
	}

	return JSON.parse(localState);
}

const setInternalState = (state: State) => {
	if (ctx === 'extension') {
		vscode.setState(state);
	} else {
		localStorage.setItem('state', JSON.stringify(state));
	}
}