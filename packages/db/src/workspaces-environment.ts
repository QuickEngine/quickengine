import { eq } from "drizzle-orm";
import { db } from "./client";
import { quickengineWorkspaces } from "./schema/quickengine";

/**
 * Which money a workspace is currently dealing in.
 *
 * 🔴 A workspace can move between sandbox and live and back, so it accumulates
 * records in BOTH modes over its life. Anything reporting on money therefore has
 * to say which mode it means — an unfiltered total silently adds test cards to
 * real revenue, and the number looks perfectly plausible.
 *
 * ⚠️ Fetched, not sub-queried. Raw SQL subqueries do not survive the drizzle
 * driver — see DB_RULES — so the mode is read first and passed into the filter.
 *
 * Defaults to `live` for a workspace that has never been set, which is the safe
 * direction: showing a real figure as real is correct, and the alternative would
 * hide genuine revenue behind a sandbox filter.
 */
export async function workspaceEnvironment(
	workspaceId: string,
): Promise<"test" | "live"> {
	const [row] = await db
		.select({ environment: quickengineWorkspaces.environment })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	return row?.environment === "test" ? "test" : "live";
}
