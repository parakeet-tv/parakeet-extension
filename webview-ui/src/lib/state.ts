import { get, writable } from 'svelte/store';
import z from 'zod';

const stateSchema = z.object({
	streamKey: z.string().default(''),
	shareOption: z.enum(['current-file', 'directory', 'everything']).default('current-file'),
	streamTitle: z.string().default(''),
	userTags: z.array(z.string()).default([]),
	autoTags: z.array(z.string()).default([])
});

export type State = z.infer<typeof stateSchema>;

export const stateStore = writable<State>();

export const setState = (state: State) => {
	stateStore.set(state);
    vscode.setState(state);
};

export const getState = () => {
	const existingState = get(stateStore);
	if (existingState) {
		return existingState;
	}

    const savedState = vscode.getState();
    const parsedState = stateSchema.parse(savedState || {});
    stateStore.set(parsedState);

	return parsedState;
};
