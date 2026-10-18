import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		host: '127.0.0.1',
		port: 5183,
		strictPort: true
	},
	plugins: [
		{
			name: 'veluna-dev-referrer-policy',
			configureServer(server) {
				server.middlewares.use((_req, res, next) => {
					res.setHeader('Referrer-Policy', 'no-referrer');
					next();
				});
			}
		},
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SPA fallback so the dynamic /playlist/[id] route resolves on direct load. context/18.
			adapter: adapter({ fallback: 'index.html' })
		})
	]
});
