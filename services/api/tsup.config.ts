import { defineConfig } from "tsup";

export default defineConfig({
	clean: true,
	entry: ["src/index.ts", "src/server.ts"],
	format: ["esm"],
	// Workspace packages publish TypeScript source today. Bundle QuickEngine-owned code so the
	// plain Node/Vercel artifact never tries to execute a linked .ts file at runtime.
	noExternal: [/^@quickengine\//],
});
