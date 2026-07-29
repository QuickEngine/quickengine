import { fileURLToPath } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * Marketing site. **No authenticated surface, ever** — that is what lets this one
 * be a plain static SPA with no server runtime at all.
 */
export default defineConfig(({ mode }) => {
	const envDir = fileURLToPath(new URL("../../../", import.meta.url));
	const buildEnv = loadEnv(mode, envDir, "");
	const sentryDsn =
		process.env.VITE_SENTRY_DSN ??
		buildEnv.VITE_WEB_SENTRY_DSN ??
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
				project: "quickengine-web",
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
		server: { port: 3000, strictPort: true },
		// TanStack Router ships modern syntax. The default esbuild target (es2020 /
		// chrome87) cannot transform it and fails on destructuring, so the target is
		// pinned explicitly here and for dependency pre-bundling.
		esbuild: { target: "es2022" },
		optimizeDeps: { esbuildOptions: { target: "es2022" } },
		build: { outDir: "dist", sourcemap: true, target: "es2022" },
	};
});
