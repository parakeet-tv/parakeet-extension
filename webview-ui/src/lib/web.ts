import { authenticated, user } from "./stores";

export const initTestStoresForWeb = () => {
	authenticated.set(true);
	user.set({
		id: '1',
		username: 'test',
		imageUrl: 'https://avatars.githubusercontent.com/u/8016617?v=4'
	});
};