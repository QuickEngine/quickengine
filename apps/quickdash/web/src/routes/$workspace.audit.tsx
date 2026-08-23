import { createFileRoute } from "@tanstack/react-router";
import { AuditView } from "../components/audit-view";

/**
 * Activity — a workspace capability, not a module.
 *
 * Every workspace has one regardless of what it bought, for the same reason
 * Media does: it describes the workspace itself rather than a thing sold in it.
 */
function AuditPage() {
	const { workspaceId } = Route.useRouteContext();
	return <AuditView workspaceId={workspaceId} />;
}

export const Route = createFileRoute("/$workspace/audit")({
	component: AuditPage,
});
