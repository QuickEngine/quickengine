import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ConnectView } from "../components/connect-view";
import { clientEnv } from "../lib/env";
import { quickDashQueries } from "../lib/quickdash-api";

function ConnectPage() {
	const { workspace } = Route.useParams();
	const context = useQuery(quickDashQueries.context(workspace));
	if (context.isPending) return <main className="p-6">Loading Connect…</main>;
	if (context.isError) throw context.error;
	const accountTarget = context.data.workspace.slug ?? workspace;
	return (
		<ConnectView
			workspaceId={workspace}
			workspaceName={context.data.workspace.name}
			apiUrl={clientEnv.API_URL}
			accountUrl={`${clientEnv.ACCOUNT_URL}/workspaces/${accountTarget}`}
		/>
	);
}

export const Route = createFileRoute("/$workspace/connect")({
	component: ConnectPage,
});
