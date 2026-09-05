import type { CacheProvider } from "@quickengine/cache";
import {
	latestActivitySeq,
	listWorkspaceActivity,
	listWorkspaceActivitySince,
} from "@quickengine/db";
import {
	catalogChannel,
	getPusherServer,
	parseWorkspaceChannel,
} from "@quickengine/realtime";
import type { Hono } from "hono";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

/**
 * Realtime: subscription authorization and the catch-up read.
 *
 * Realtime alone is not a reliable stream — a browser that was asleep, offline,
 * or mid-deploy simply never hears the events it missed, and nothing tells it so.
 * The activity feed's monotonic `seq` closes that hole: the client remembers the
 * highest sequence it has applied and asks for everything after it on reconnect.
 * That makes the realtime message a *hint to refetch* rather than the transport
 * of record, which is also why its payload stays tiny.
 */
export function registerRealtimeRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "realtime:read",
		sessionCapability: "workspace.view",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "realtime.read",
	});

	/**
	 * Pusher calls this to authorize a browser's subscription to a private channel.
	 *
	 * This is the tenant boundary for the realtime stream: without it, knowing a
	 * workspace id would be enough to listen to that workspace's events. The
	 * channel name is parsed for its workspace id and checked against the caller's
	 * own authorized workspace — a member of workspace A may not subscribe to B.
	 */
	const storefrontRead = authorizeWorkspace(options.platform, {
		// Shares the storefront's existing capability rather than inventing one: a
		// site that may read the catalog may be told when the catalog changed.
		keyCapability: "catalog:read",
		sessionCapability: "workspace.view",
	});

	/**
	 * What a connected storefront needs to listen for catalog changes.
	 *
	 * 🔴 Returns the Pusher KEY, never the secret. The key is a public
	 * identifier that every Pusher browser client ships anyway; the secret signs
	 * subscriptions and stays on this side.
	 *
	 * This exists so a site does not have to carry QuickEngine's realtime
	 * configuration as its own environment variables. It already holds a
	 * publishable site key and a workspace id, and that is enough: the channel it
	 * is told to listen on is derived from the workspace it just authenticated
	 * as, so a site cannot ask for somebody else's.
	 */
	app.get("/v1/realtime/catalog", storefrontRead, readLimit, async (c) => {
		const pusher = getPusherServer();
		const key = process.env.PUSHER_KEY;
		const cluster = process.env.PUSHER_CLUSTER;

		if (!pusher || !key || !cluster) {
			// Realtime being absent is not the caller's fault, and a storefront must
			// keep working without it: it falls back to fetching on load, as before.
			return respondError(
				c,
				"DEPENDENCY_UNAVAILABLE",
				"Realtime is not configured.",
				503,
			);
		}

		return respond(c, {
			key,
			cluster,
			channel: catalogChannel(c.get("authorized").workspaceId),
		});
	});

	app.post("/v1/realtime/auth", readAccess, readLimit, async (c) => {
		const pusher = getPusherServer();
		if (!pusher) {
			// The workspace did nothing wrong; realtime simply has no provider here.
			return respondError(
				c,
				"DEPENDENCY_UNAVAILABLE",
				"Realtime is not configured.",
				503,
			);
		}

		const form = await c.req.formData();
		const socketId = String(form.get("socket_id") ?? "");
		const channel = String(form.get("channel_name") ?? "");
		const requested = parseWorkspaceChannel(channel);
		if (!socketId || !requested) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"A socket id and workspace channel are required.",
				400,
			);
		}

		// The authorized workspace comes from the caller's own credentials, so a
		// forged channel name cannot widen access.
		if (requested !== c.get("authorized").workspaceId) {
			return respondError(
				c,
				"WORKSPACE_MISMATCH",
				"That channel belongs to another workspace.",
				403,
			);
		}

		// Pusher expects its own JSON shape here, not the platform envelope.
		return c.json(pusher.authorizeChannel(socketId, channel));
	});

	/**
	 * The workspace activity feed.
	 *
	 * `?since=<seq>` returns everything after that sequence, oldest first — the
	 * reconnect path. Without it, the newest events come back first, for a fresh
	 * page load.
	 */
	app.get("/v1/activity", readAccess, readLimit, async (c) => {
		const workspaceId = c.get("authorized").workspaceId;
		const since = c.req.query("since");
		const limit = Number(c.req.query("limit")) || undefined;

		if (since !== undefined) {
			const cursor = Number(since);
			if (!Number.isInteger(cursor) || cursor < 0) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"`since` must be a non-negative sequence number.",
					400,
				);
			}
			const events = await listWorkspaceActivitySince(
				workspaceId,
				cursor,
				limit,
			);
			return respond(c, {
				events,
				// The client stores this as its next cursor. When the page is empty it
				// keeps the cursor it asked with, so an idle period doesn't rewind it.
				cursor: events.at(-1)?.seq ?? cursor,
			});
		}

		const events = await listWorkspaceActivity(workspaceId, limit);
		return respond(c, {
			events,
			// Newest-first, so the head of the list is the highest sequence.
			cursor: events[0]?.seq ?? (await latestActivitySeq(workspaceId)),
		});
	});
}
