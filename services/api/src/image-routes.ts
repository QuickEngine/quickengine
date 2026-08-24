import type { Hono } from "hono";
import { authorizeWorkspace } from "./authorize";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * `/v1/quickdash/images` — a picture that belongs to the WORKSPACE, not a product.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 Until now the only way to get an image into a workspace was to attach it to
 * a catalog item. That was fine while photographs were only ever of products,
 * and it quietly blocked everything else: a business could not put a picture on
 * its own About page, in a banner, or beside a paragraph, because there was
 * nowhere for an image to live that was not a product.
 *
 * The content module has had an `image` slot type since it was written, and no
 * way to fill it — so an image slot meant pasting a URL by hand, which is not a
 * thing an operator can do.
 *
 * ⚠️ The storage layer was never the problem. `putPublicAsset` already works and
 * is proven by product photographs; this route simply reaches it without
 * demanding a catalog item first.
 *
 * 🔑 Deliberately NOT the `files` module. That one holds private documents behind
 * expiring links; these are public and permanent, and the public bucket is a
 * separate store precisely so a signed contract has no route into it.
 */
export function registerImageRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	/**
	 * ⚠️ `catalog:write` rather than a capability of its own.
	 *
	 * A key that may change what a business sells may change the picture beside
	 * it. Minting a separate `images:write` would mean every existing integration
	 * silently losing the ability the day it was introduced.
	 */
	const write = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:write",
		sessionCapability: "records.write",
	});

	// Matches the product upload limit. A photograph larger than this is almost
	// always an unresized camera original, and saying so beats a timeout.
	const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

	const publicAssets = async (origin: string) => {
		const { createLocalStorageProvider, createVercelBlobStorageProvider } =
			await import("@quickengine/storage");
		// 🔴 A SEPARATE Blob store from the private one, not a flag on it: public
		// and private access is fixed per store at creation. Separate credentials
		// mean a signed contract has no route into the public store at all.
		return process.env.PUBLIC_BLOB_READ_WRITE_TOKEN ||
			process.env.PUBLIC_BLOB_STORE_ID
			? createVercelBlobStorageProvider({
					token: process.env.PUBLIC_BLOB_READ_WRITE_TOKEN,
					oidcToken: process.env.VERCEL_OIDC_TOKEN,
					storeId: process.env.PUBLIC_BLOB_STORE_ID,
				})
			: createLocalStorageProvider(origin);
	};

	/**
	 * ⚠️ Under `/v1/quickdash`, with the console's other operator actions, rather
	 * than at `/v1/images`.
	 *
	 * That namespace is the CONSOLE's, and is deliberately outside the documented
	 * public API — the catalog's own image upload sits there for the same reason.
	 * Publishing a multipart endpoint as public API is a contract worth designing
	 * on purpose rather than acquiring as a side effect of needing an upload.
	 */
	app.post("/v1/quickdash/images", write, async (c) => {
		const form = await c.req.formData();
		const file = form.get("file");
		if (!(file instanceof File) || file.size === 0) {
			return respondError(c, "VALIDATION_ERROR", "Choose an image.", 400);
		}
		if (!file.type.startsWith("image/")) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That file is not an image.",
				400,
			);
		}
		if (file.size > MAX_IMAGE_BYTES) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Images must be 10 MB or smaller.",
				400,
			);
		}

		/**
		 * 🔴 The uploaded name is never trusted into the key.
		 *
		 * It reaches a shared public namespace, so it is reduced to safe characters
		 * and prefixed with a timestamp — which also stops two pictures called
		 * `IMG_0001.jpg` overwriting each other.
		 *
		 * ⚠️ Under `content/` rather than `catalog/`, so the two are separable
		 * later: a product photograph and a picture on an About page are billed the
		 * same but mean different things, and an asset index will want to tell them
		 * apart without guessing from a filename.
		 */
		const safeName =
			file.name
				.toLowerCase()
				.replace(/[^a-z0-9.]+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(-60) || "image";
		const provider = await publicAssets(new URL(c.req.url).origin);
		const asset = await provider.putPublicAsset({
			workspaceId: c.get("authorized").workspaceId,
			key: `content/${Date.now()}-${safeName}`,
			body: new Uint8Array(await file.arrayBuffer()),
			contentType: file.type,
		});

		return respond(c, { url: asset.url }, 201);
	});
}
