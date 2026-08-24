import { fileURLToPath } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const envDir = fileURLToPath(new URL("../../../", import.meta.url));
	const buildEnv = loadEnv(mode, envDir, "");
	const sentryDsn =
		process.env.VITE_SENTRY_DSN ??
		buildEnv.VITE_DASH_SENTRY_DSN ??
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
			tanstackRouter({ target: "react", autoCodeSplitting: true }),
			react(),
			tailwindcss(),
			sentryVitePlugin({
				org: process.env.SENTRY_ORG ?? buildEnv.SENTRY_ORG ?? "quickengine",
				project: "quickdash",
				authToken: sentryAuthToken,
				disable: !(process.env.VERCEL && sentryAuthToken),
				telemetry: false,
				sourcemaps: {
					filesToDeleteAfterUpload: ["./dist/**/*.map"],
				},
			}),
		],
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
			port: 3011,
			strictPort: true,
			proxy: {
				"/v1": {
					target: process.env.API_URL ?? "http://127.0.0.1:3020",
					changeOrigin: false,
				},
				// 🔴 Uploaded images are stored with the API's own origin, which in
				// development is this dev server (the proxy keeps the Host header).
				// Without this the browser asks Vite for `/assets/...`, gets the SPA
				// fallback instead of a photograph, and every uploaded image renders
				// blank — indistinguishable from an upload that never happened.
				"/assets": {
					target: process.env.API_URL ?? "http://127.0.0.1:3020",
					changeOrigin: false,
				},
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
		esbuild: { target: "es2022" },
		optimizeDeps: { esbuildOptions: { target: "es2022" } },
		build: { outDir: "dist", sourcemap: true, target: "es2022" },
	};
});
