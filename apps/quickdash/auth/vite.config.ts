import { fileURLToPath } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * The identity app.
 *
 * A static SPA. The identity **server** is Better Auth mounted in `services/api`;
 * this app only renders the screens and calls it. `vercel.json` rewrites
 * `/api/auth/*` to the API so the URL a user or an OAuth provider ever sees stays
 * on the clean domain.
 */
export default defineConfig(({ mode }) => {
	const envDir = fileURLToPath(new URL("../../../", import.meta.url));
	const buildEnv = loadEnv(mode, envDir, "");
	const sentryDsn =
		process.env.VITE_SENTRY_DSN ??
		buildEnv.VITE_AUTH_SENTRY_DSN ??
		buildEnv.VITE_SENTRY_DSN;
	const sentryAuthToken =
		process.env.SENTRY_AUTH_TOKEN ?? buildEnv.SENTRY_AUTH_TOKEN;

	return {
		// All apps share the repository-root `.env.local`; Vite only exposes keys
		// carrying its `VITE_` prefix to browser code.
		envDir,
		define: {
			"import.meta.env.VITE_SENTRY_DSN": JSON.stringify(sentryDsn),
		},
		plugins: [
			// Must precede the React plugin: it generates the route tree the app imports.
			tanstackRouter({ target: "react", autoCodeSplitting: true }),
			react(),
			tailwindcss(),
			sentryVitePlugin({
				org: process.env.SENTRY_ORG ?? buildEnv.SENTRY_ORG ?? "quickengine",
				project: "quickdash-auth",
				authToken: sentryAuthToken,
				disable: !(process.env.VERCEL && sentryAuthToken),
				telemetry: false,
				sourcemaps: {
					filesToDeleteAfterUpload: ["./dist/**/*.map"],
				},
			}),
		],
		// tsconfig `paths` is type-only; Vite needs its own alias or the bundler
		// resolves nothing.
		resolve: {
			alias: {
				"@": fileURLToPath(new URL("./src", import.meta.url)),
			},
		},
		server: {
			/**
			 * 🔴 Vite must NOT answer the CORS preflight for the proxied auth calls.
			 *
			 * Its built-in CORS middleware runs BEFORE the proxy and ends the
			 * `OPTIONS` request itself, replying with its own headers — which do not
			 * include `Access-Control-Allow-Credentials`. Better Auth is called with
			 * `credentials: "include"`, so the browser rejects the response and the
			 * real request is never sent. The symptom is a flat refusal to save
			 * anything on an account screen, with the API completely innocent: it
			 * returns `allow-credentials: true` when asked directly.
			 *
			 * 🔑 `false` lets the preflight fall through to the proxy and be answered
			 * by the API — which is exactly what happens in production, where there is
			 * no dev server and `vercel.json` rewrites straight through.
			 */
			cors: false,
			port: 3002,
			strictPort: true,
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
	};
});
