// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import { WebviewApi } from '@types/vscode-webview';

declare global {
	namespace App {
		// interface Error {}	
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
	var vscode: WebviewApi<any>;
}

export {};
