import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const prerender = true;
export const ssr = false;

export const load: LayoutLoad = ({ url }) => {
	// Redirect /index.html to /
	// This is to prevent the extension from trying to load the index.html file
	if (url.pathname === '/index.html') {
		throw redirect(301, '/');
	}
};