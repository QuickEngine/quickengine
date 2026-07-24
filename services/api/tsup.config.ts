import { defineConfig } from "tsup";

export default defineConfig({
	clean: true,
	entry: ["src/index.ts", "src/server.ts"],
	format: ["esm"],
	platform: "node",
	// Bundled CommonJS transitive deps (e.g. `debug`) call `require()` for Node built-ins. In an
	// ESM bundle esbuild replaces those with a shim that throws, so expose a real `require`.
	banner: {
		js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
	},
	// Workspace packages publish TypeScript source today. Bundle QuickEngine-owned code so the
	// plain Node/Vercel artifact never tries to execute a linked .ts file at runtime.
	noExternal: [/^@quickengine\//],
});
