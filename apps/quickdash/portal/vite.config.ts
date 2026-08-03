import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * The customer portal — our USERS' USERS.
 *
 * A shopper, a massage client, an agency's client, a student. Not an operator:
 * nobody here can reach QuickDash, and nobody here consumes a seat.
 *
 * One deployment serves every workspace. Which workspace a visitor is in comes
 * from the host or a path segment, and which sections they see comes from that
 * workspace's enabled modules — a commerce workspace shows Orders, a service
 * workspace shows Bookings. Same code, different tabs, exactly like QuickDash's
 * own sidebar.
 */
export default defineConfig(({ mode }) => {
	const envDir = fileURLToPath(new URL("../../../", import.meta.url));
	// 🔴 `process.env` is the SHELL, not `.env.local`. Vite only surfaces
	// `VITE_`-prefixed keys from the env file to client code, and nothing at all
	// to this config — so reading `process.env.API_URL` silently ignored the
	// value sitting in `.env.local` and kept proxying to the local API. Which
	// then answered INVALID_API_KEY for a key minted against production, and the
	// error was true but pointed at the wrong thing.
	const fileEnv = loadEnv(mode, envDir, "");
	const apiUrl =
		process.env.API_URL ?? fileEnv.API_URL ?? "http://127.0.0.1:3020";

	return {
		envDir,
		plugins: [
			// Must precede the React plugin: it generates the route tree the app imports.
			tanstackRouter({ target: "react", autoCodeSplitting: true }),
			react(),
			tailwindcss(),
		],
		// tsconfig `paths` is type-only; Vite needs its own alias or the bundler
		// resolves nothing.
		resolve: {
			alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
		},
		server: {
			port: 3012,
			strictPort: true,
			// Production rewrites these to the API. Locally there is no Vercel, so the
			// dev server does the same job.
			//
			// **`127.0.0.1`, never `localhost`.** Node resolves `localhost` to `::1`
			// first and the API binds IPv4 only, so `localhost` yields a confusing
			// `AggregateError [ECONNREFUSED]` while the server runs perfectly.
			proxy: {
				"/v1": {
					target: apiUrl,
					// Required when the target is another host: without it the upstream
					// sees `Host: localhost:3012` and TLS/routing fails.
					changeOrigin: apiUrl.startsWith("https"),
				},
			},
		},
		// TanStack Router ships modern syntax the default esbuild target cannot parse.
		esbuild: { target: "es2022" },
		optimizeDeps: { esbuildOptions: { target: "es2022" } },
		build: { outDir: "dist", sourcemap: true, target: "es2022" },
	};
});
