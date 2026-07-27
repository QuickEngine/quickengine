import { Button } from "@quickengine/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { quickDashQueries } from "../lib/quickdash-api";

function WorkspacePicker() {
	const workspaces = useQuery(quickDashQueries.workspaces());
	if (workspaces.isPending)
		return <main className="p-6">Loading QuickDash…</main>;
	if (workspaces.isError) throw workspaces.error;
	if (workspaces.data.items.length === 0) {
		return (
			<main className="mx-auto max-w-xl space-y-4 p-6 text-center">
				<h1 className="font-semibold text-2xl">Create your first workspace</h1>
				<p className="text-muted-foreground">
					QuickDash is ready once your account has a workspace.
				</p>
				<Button asChild>
					<a href="http://localhost:3001/workspaces/new">Open Account</a>
				</Button>
			</main>
		);
	}
	return (
		<main className="mx-auto max-w-4xl space-y-6 p-6">
			<div>
				<p className="text-muted-foreground text-sm">QuickDash</p>
				<h1 className="font-semibold text-2xl">Choose a workspace</h1>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				{workspaces.data.items.map((workspace) => (
					<Link
						key={workspace.id}
						to="/$workspace"
						params={{ workspace: workspace.id }}
						className="rounded-xl border p-5 hover:bg-foreground/[0.03]"
					>
						<h2 className="font-medium">{workspace.name}</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							{workspace.businessType}
						</p>
					</Link>
				))}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/")({ component: WorkspacePicker });
