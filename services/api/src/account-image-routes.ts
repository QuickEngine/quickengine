import type { Hono } from "hono";
import { authorizeSession } from "./authorize-account";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * `/v1/account/images` — the two pictures on a PERSON's profile.
 *
 * ── Why this is not `/v1/quickdash/images` ───────────────────────────────────
 *
 * 🔴 That route is workspace-scoped: it authorizes with `catalog:write` against
 * a workspace and prefixes the object key with the workspace id. An avatar is
 * uploaded during ONBOARDING, before any workspace exists, so there is nothing
 * to authorize against and nothing to key by. Reusing it would have meant either
 * inventing a fake workspace or loosening a check that exists to stop one
 * business overwriting another's photographs.
 *
 * ── Why the object key is the user id ────────────────────────────────────────
 *
 * ⚠️ `putPublicAsset` names its namespace parameter `workspaceId`, and this
 * passes a USER id. That is deliberate, not a bug: the parameter is a key prefix
 * whose only job is to stop two owners colliding in a flat public namespace, and
 * a user id serves that exactly as well. Renaming it to `owner` across the
 * storage package and its two existing callers is the tidier fix and belongs in
 * its own change, not smuggled into a profile feature.
 *
 * ── Why the key is stable ────────────────────────────────────────────────────
 *
 * One key per kind, overwritten in place. A new key per upload would mint a new
 * URL every time and orphan the previous object, and nothing would ever clean
 * them up — the storage bill only goes one way.
 */
export function registerAccountImageRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const session = authorizeSession(options.platform);

	/**
	 * The browser resizes and crops before it uploads, so anything arriving here
	 * is already small. This bound exists to refuse an unresized camera original
	 * from a client that skipped that step, not to size a normal upload.
	 */
	const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

	const KINDS = new Set(["avatar", "banner"]);

	app.post("/v1/account/images", session, async (c) => {
		const form = await c.req.formData();
		const file = form.get("file");
		const kind = String(form.get("kind") ?? "");

		if (!KINDS.has(kind)) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Choose a picture to upload.",
				400,
			);
		}
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
				"Images must be 8 MB or smaller.",
				400,
			);
		}

		// Hard rule 12: the storage SDK loads inside the handler, never at module
		// scope, or it joins the module graph of every cold start.
		const { publicAssetProviderFromEnv } = await import("@quickengine/storage");
		const provider = publicAssetProviderFromEnv(new URL(c.req.url).origin);

		const userId = c.get("account").userId;
		const asset = await provider.putPublicAsset({
			workspaceId: userId,
			// 🔴 A cache-busting suffix on a STABLE key. The object is overwritten in
			// place so nothing is orphaned, but the URL has to change or every
			// surface already showing the old avatar keeps showing it — the browser
			// and the CDN both hold the previous bytes under the identical URL.
			key: `profile/${kind}`,
			body: new Uint8Array(await file.arrayBuffer()),
			contentType: file.type,
		});

		return respond(c, { url: `${asset.url}?v=${Date.now()}` }, 201);
	});
}
