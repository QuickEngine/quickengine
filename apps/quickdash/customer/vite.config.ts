import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
export default defineConfig({
	envDir: fileURLToPath(new URL("../../../", import.meta.url)),
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
				target: process.env.API_URL ?? "http://127.0.0.1:3020",
				changeOrigin: false,
			},
		},
	},
	// TanStack Router ships modern syntax the default esbuild target cannot parse.
	esbuild: { target: "es2022" },
	optimizeDeps: { esbuildOptions: { target: "es2022" } },
	build: { outDir: "dist", sourcemap: true, target: "es2022" },
});
