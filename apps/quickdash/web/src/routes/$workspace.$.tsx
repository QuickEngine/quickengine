import { createFileRoute } from "@tanstack/react-router";
import { OutletNotFound } from "../components/outlet-error";

/**
 * Anything under a workspace that matches no other route.
 *
 * 🔴 Without this, `/neoengine/one/two/three` matched nothing at all and fell
 * to the ROOT's not-found screen — which sits above the shell and replaces the
 * entire console. A mistyped address took away the sidebar you would use to
 * recover from it.
 *
 * The splat is last-resort by construction: TanStack prefers a more specific
 * match, so this only ever catches what genuinely has no page.
 */
export const Route = createFileRoute("/$workspace/$")({
	component: OutletNotFound,
});
