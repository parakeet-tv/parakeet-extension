import { get, writable } from 'svelte/store';
import z from 'zod';

const stateSchema = z.object({
	test: z.string()
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
    stateStore.set(savedState || {});

	return savedState;
};
