import { createFileRoute } from "@tanstack/react-router";
import { MediaView } from "../components/media-view";

/**
 * Media — a workspace capability, not a module.
 *
 * Sits beside Connect rather than inside a module group because every
 * workspace has one, regardless of which modules it bought. See the reasoning
 * in `media-view.tsx`.
 */
function MediaPage() {
	const { workspaceId } = Route.useRouteContext();
	return <MediaView workspaceId={workspaceId} />;
}

export const Route = createFileRoute("/$workspace/media")({
	component: MediaPage,
});
