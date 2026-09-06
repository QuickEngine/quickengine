import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { OutletError, OutletNotFound } from "../components/outlet-error";
import { SettingsBody } from "../components/settings/settings-body";
import { clientEnv } from "../lib/env";
import { quickDashQueries } from "../lib/quickdash-api";

/**
 * `/{workspace}/settings/{section}` — one section, on the main outlet.
 *
 * ⚠️ Reads the workspace context itself rather than taking it down through the
 * layout. The layout already holds it for its own chrome, but a page that
 * depends on props threaded through a parent cannot be linked to directly, and
 * being linkable is the entire point of moving settings out of a dialog.
 */
function Page() {
	/* The slug comes from the URL, the resolved id from the context: they are
	   different values and Integrations needs the slug to link back in. */
	const { workspace, section } = Route.useParams();
	const { workspaceId } = Route.useRouteContext();
	const context = useQuery(quickDashQueries.context(workspaceId));

	return (
		<SettingsBody
			workspaceId={workspaceId}
			sectionId={section}
			workspace={workspace}
			modules={context.data?.modules ?? []}
			workspaceName={context.data?.workspace.name ?? ""}
			organizationId={context.data?.workspace.organizationId}
			accountUrl={clientEnv.ACCOUNT_URL}
			environment={context.data?.workspace.environment ?? "live"}
			apiUrl={clientEnv.API_URL}
		/>
	);
}

export const Route = createFileRoute("/$workspace/settings/$section")({
	errorComponent: OutletError,
	notFoundComponent: OutletNotFound,
	component: Page,
});
