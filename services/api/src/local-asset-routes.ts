import type { Hono } from "hono";
import type { PlatformEnv } from "./platform-types";

/**
 * Serves public assets in LOCAL DEVELOPMENT only.
 *
 * 🔴 Why this exists: the local storage provider returns URLs under `/assets/…`
 * and nothing answered them, so every uploaded product photograph in
 * development resolved to a 404 and read as "image upload is broken". The
 * provider now writes the bytes; this hands them back.
 *
 * ⚠️ Registered ONLY when no public Blob store is configured. With a real store
 * the provider returns that store's own URL and this route is never involved,
 * so production never serves files off its own filesystem — which on Vercel is
 * ephemeral and per-instance anyway.
 */
export function registerLocalAssetRoutes(app: Hono<PlatformEnv>) {
	if (
		process.env.PUBLIC_BLOB_READ_WRITE_TOKEN ||
		process.env.PUBLIC_BLOB_STORE_ID
	) {
		return;
	}

	app.get("/assets/:workspaceId/*", async (c) => {
		const workspaceId = c.req.param("workspaceId");
		// Everything after `/assets/<workspaceId>/`.
		const rest = c.req.path.split("/").slice(3);

		/**
		 * 🔴 Path traversal is the whole risk of serving files by name. Any empty
		 * or dotted segment is refused outright rather than normalised, because
		 * normalising is where the clever bypasses live. `%2e%2e` is already
		 * decoded by the router, so this sees the real segments.
		 */
		const unsafe = (segment: string) =>
			segment.length === 0 ||
			segment === "." ||
			segment === ".." ||
			segment.includes("\\");
		if (unsafe(workspaceId) || rest.length === 0 || rest.some(unsafe)) {
			return c.text("Not found", 404);
		}

		const { readFile } = await import("node:fs/promises");
		const { join } = await import("node:path");
		const { localAssetRoot } = await import("@quickengine/storage");

		const root = localAssetRoot();
		const file = join(root, "assets", workspaceId, ...rest);
		// Belt and braces: whatever the segments did, the result must still sit
		// inside the asset root.
		if (!file.startsWith(join(root, "assets"))) return c.text("Not found", 404);

		try {
			const bytes = await readFile(file);
			return c.body(new Uint8Array(bytes), 200, {
				"Content-Type": contentTypeOf(file),
				// Keyed by a timestamped name, so a given URL never changes content.
				"Cache-Control": "public, max-age=31536000, immutable",
			});
		} catch {
			return c.text("Not found", 404);
		}
	});
}

const TYPES: Record<string, string> = {
	avif: "image/avif",
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	svg: "image/svg+xml",
	webp: "image/webp",
};

function contentTypeOf(file: string) {
	const extension = file.split(".").pop()?.toLowerCase() ?? "";
	// Unknown types are handed back as bytes rather than guessed at; a browser
	// asked to sniff an unexpected upload is how a stored file becomes script.
	return TYPES[extension] ?? "application/octet-stream";
}
