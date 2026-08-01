import type { CacheProvider } from "@quickengine/cache";
import {
	deleteSavedView,
	listPinnedSavedViews,
	listSavedViews,
	saveView,
	setSavedViewPinned,
} from "@quickengine/db";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

const uuid = z.uuid();

const saveSchema = z.object({
	moduleId: z.string().trim().min(1).max(100),
	name: z.string().trim().min(1).max(80),
	// Presentation state, mirroring the client's list state. Deliberately not a
	// closed shape: lists gain filters over time, and the backend never enforces
	// anything from this — a malformed view degrades to an unfiltered list.
	state: z.record(z.string(), z.unknown()),
	pinned: z.boolean().optional(),
});

const pinSchema = z.object({ pinned: z.boolean() });

const FRIENDLY: Record<string, string> = {
	SAVED_VIEW_NAME_REQUIRED: "Give the view a name.",
	SAVED_VIEW_NAME_TOO_LONG: "That name is too long.",
	SAVED_VIEW_LIMIT_REACHED:
		"You've reached the maximum number of saved views for this module. Delete one to save another.",
};

/**
 * Saved views — one person's filters, sorting and paging for a module list.
 *
 * 🔴 **Personal, and scoped to the SESSION user, not the workspace.** Every
 * handler passes `userId` from the authorized context, so one member cannot
 * read, change or delete another's views even inside the same workspace. That is
 * the whole reason `sessionCapability` is `workspace.view` rather than a
 * management permission: seeing your own saved filters is not an administrative
 * act, and requiring one would mean only admins could save a view.
 *
 * ⚠️ **Not reachable with an API key.** These belong to a person; a key has no
 * user. `keyCapability` is still declared because `authorizeWorkspace` requires
 * one, but a key-authorized request has no `userId` to scope by and is rejected
 * below rather than silently reading somebody else's views.
 */
export function registerSavedViewRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
	},
) {
	const access = authorizeWorkspace(options.platform, {
		// Arbitrary, and never actually exercised: `authorizeWorkspace` requires a
		// key capability, but a key-authorized request is refused by `requireOwner`
		// below because a key has no person to own a view. Any read capability
		// would behave identically.
		keyCapability: "analytics:read",
		sessionCapability: "workspace.view",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "saved-views.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "saved-views.write",
	});

	/**
	 * The person this view belongs to, or a rejection.
	 *
	 * A view with no owner cannot exist, so an API key gets a clear refusal
	 * instead of an empty list that looks like "you have none".
	 */
	const requireOwner = (c: Context<PlatformEnv>) => {
		const authorized = c.get("authorized");
		const actor = authorized.auditActor;
		if (actor.type === "user") {
			return {
				owner: { userId: actor.id, workspaceId: authorized.workspaceId },
			} as const;
		}
		return {
			rejection: respondError(
				c,
				"CAPABILITY_DENIED",
				"Saved views belong to a person. Use a signed-in session rather than an API key.",
				403,
			),
		} as const;
	};

	app.get("/v1/saved-views", access, readLimit, async (c) => {
		const resolved = requireOwner(c);
		if ("rejection" in resolved) return resolved.rejection;

		const moduleId = c.req.query("moduleId")?.trim();
		// No module means "everything pinned", which is what Home asks for.
		return respond(
			c,
			moduleId
				? await listSavedViews(resolved.owner, moduleId)
				: await listPinnedSavedViews(resolved.owner),
		);
	});

	app.post("/v1/saved-views", access, writeLimit, async (c) => {
		const resolved = requireOwner(c);
		if ("rejection" in resolved) return resolved.rejection;

		const input = saveSchema.parse(await c.req.json());
		try {
			// Upsert: saving twice under one name updates it, which is what everyone
			// who has used a spreadsheet expects.
			return respond(c, await saveView(resolved.owner, input), 201);
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (FRIENDLY[message]) {
				return respondError(c, "VALIDATION_ERROR", FRIENDLY[message], 400);
			}
			throw error;
		}
	});

	app.post("/v1/saved-views/:id/pin", access, writeLimit, async (c) => {
		const resolved = requireOwner(c);
		if ("rejection" in resolved) return resolved.rejection;

		const id = uuid.parse(c.req.param("id"));
		const { pinned } = pinSchema.parse(await c.req.json());
		const view = await setSavedViewPinned(resolved.owner, id, pinned);
		if (!view) {
			return respondError(
				c,
				"NOT_FOUND",
				"That saved view was not found.",
				404,
			);
		}
		return respond(c, view);
	});

	app.delete("/v1/saved-views/:id", access, writeLimit, async (c) => {
		const resolved = requireOwner(c);
		if ("rejection" in resolved) return resolved.rejection;

		const id = uuid.parse(c.req.param("id"));
		const removed = await deleteSavedView(resolved.owner, id);
		if (!removed) {
			return respondError(
				c,
				"NOT_FOUND",
				"That saved view was not found.",
				404,
			);
		}
		return respond(c, { deleted: true });
	});
}
