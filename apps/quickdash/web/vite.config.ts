import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		react(),
		tailwindcss(),
	],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		port: 3011,
		strictPort: true,
		proxy: {
			"/v1": {
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
});
