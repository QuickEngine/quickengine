import { Button } from "@quickengine/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceActivityFeed } from "../components/workspace-activity-feed";
import { workspaceApi } from "../lib/api";
import { quickDashQueries } from "../lib/quickdash-api";

function Overview() {
	const { workspace } = Route.useParams();
	const context = useQuery(quickDashQueries.context(workspace));
	const activity = useQuery({
		queryKey: ["quickdash", workspace, "activity"],
		queryFn: async () =>
			(await workspaceApi(workspace).activity.list({ limit: 20 })).data,
	});
	if (context.isPending || activity.isPending)
		return <main className="p-6">Loading workspace…</main>;
	if (context.isError) throw context.error;
	if (activity.isError) throw activity.error;
	return (
		<main className="space-y-8 p-6">
			<div>
				<p className="text-muted-foreground text-sm">Workspace overview</p>
				<h1 className="mt-1 font-semibold text-2xl">
					{context.data.workspace.name}
				</h1>
			</div>
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{context.data.modules.map((module) => (
					<article key={module.id} className="rounded-xl border p-5">
						<h2 className="font-medium capitalize">
							{module.id.replaceAll("-", " ")}
						</h2>
						<Button asChild variant="outline" className="mt-5 w-full">
							<Link
								to="/$workspace/$module"
								params={{ workspace, module: module.id }}
							>
								Open module
							</Link>
						</Button>
					</article>
				))}
			</div>
			<WorkspaceActivityFeed
				rows={activity.data.events.map((event) => ({
					seq: event.seq,
					name: event.name,
					occurredAt: event.occurredAt,
				}))}
			/>
		</main>
	);
}

export const Route = createFileRoute("/$workspace/")({ component: Overview });
