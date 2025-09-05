<script>
	import { page } from '$app/state';
</script>

<h1>{page.status} {page.error?.message} {page.url.pathname}</h1>
