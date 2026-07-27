import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The identity app.
 *
 * A static SPA. The identity **server** is Better Auth mounted in `services/api`;
 * this app only renders the screens and calls it. `vercel.json` rewrites
 * `/api/auth/*` to the API so the URL a user or an OAuth provider ever sees stays
 * on the clean domain.
 */
export default defineConfig({
	plugins: [
		// Must precede the React plugin: it generates the route tree the app imports.
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		react(),
		tailwindcss(),
	],
	// tsconfig `paths` is type-only; Vite needs its own alias or the bundler
	// resolves nothing.
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		port: 3002,
		// In production `vercel.json` rewrites these to the API. Locally there is no
		// Vercel, so the dev server has to do the same job — without this, every
		// auth call 404s and nothing on the page works.
		//
		// **`127.0.0.1`, never `localhost`.** Node resolves `localhost` to `::1`
		// first and the API binds IPv4 only, so `localhost` produces a confusing
		// `AggregateError [ECONNREFUSED]` while the server is running perfectly.
		proxy: {
			"/api/auth": {
				target: process.env.API_URL ?? "http://127.0.0.1:3020",
				changeOrigin: false,
			},
			"/signout": {
				target: process.env.API_URL ?? "http://127.0.0.1:3020",
				changeOrigin: false,
				rewrite: (path) => path.replace(/^\/signout/, "/api/auth-signout"),
			},
		},
	},
	// TanStack Router ships modern syntax. The default esbuild target (es2020 /
	// chrome87) cannot transform it and fails on destructuring, so the target is
	// pinned explicitly here and for dependency pre-bundling.
	esbuild: { target: "es2022" },
	optimizeDeps: { esbuildOptions: { target: "es2022" } },
	build: { outDir: "dist", sourcemap: true, target: "es2022" },
});
