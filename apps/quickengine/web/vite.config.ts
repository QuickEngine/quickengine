import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Marketing site. **No authenticated surface, ever** — that is what lets this one
 * be a plain static SPA with no server runtime at all.
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
	server: { port: 3000, strictPort: true },
	// TanStack Router ships modern syntax. The default esbuild target (es2020 /
	// chrome87) cannot transform it and fails on destructuring, so the target is
	// pinned explicitly here and for dependency pre-bundling.
	esbuild: { target: "es2022" },
	optimizeDeps: { esbuildOptions: { target: "es2022" } },
	build: { outDir: "dist", sourcemap: true, target: "es2022" },
});
