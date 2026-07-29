import { ArrowRight, CheckCircle, Lightning } from "@phosphor-icons/react";
import { PageLoadingState } from "@quickengine/ui";
import { Button } from "@quickengine/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import Link from "../compat/router-link";
import { WorkspaceActivityFeed } from "../components/workspace-activity-feed";
import { buildWorkspaceHomeModel } from "../components/workspace-home";
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
		return (
			<PageLoadingState
				label="Loading workspace home"
				rows={4}
				className="mx-auto w-full max-w-6xl"
			/>
		);
	if (context.isError) throw context.error;
	if (activity.isError) throw activity.error;
	const home = buildWorkspaceHomeModel(context.data.checklist.items);
	return (
		<main className="mx-auto w-full max-w-6xl space-y-8 p-6">
			<header>
				<p className="text-muted-foreground text-sm">Workspace home</p>
				<h1 className="mt-1 font-semibold text-2xl">
					{context.data.workspace.name}
				</h1>
				<p className="mt-2 max-w-2xl text-muted-foreground text-sm">
					Pick up the next useful piece of work or see what changed recently.
				</p>
			</header>

			{home.nextAction ? (
				<section aria-labelledby="next-action-heading">
					<div className="rounded-xl border bg-card p-5 text-card-foreground">
						<div className="flex items-start gap-4">
							<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
								<Lightning className="size-5" weight="fill" />
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
									Next action
								</p>
								<h2
									id="next-action-heading"
									className="mt-1 font-semibold text-lg"
								>
									{home.nextAction.label}
								</h2>
								<p className="mt-1 text-muted-foreground text-sm">
									{home.nextAction.description}
								</p>
								<Button asChild className="mt-4">
									<Link href={home.nextAction.href}>
										Continue <ArrowRight />
									</Link>
								</Button>
							</div>
							<span className="text-muted-foreground text-xs">
								{home.completedRequiredSteps}/{home.totalRequiredSteps} complete
							</span>
						</div>
					</div>
				</section>
			) : (
				<section
					aria-labelledby="caught-up-heading"
					className="rounded-xl border p-5"
				>
					<div className="flex items-start gap-3">
						<CheckCircle
							className="mt-0.5 size-6 shrink-0 text-primary"
							weight="fill"
						/>
						<div>
							<h2 id="caught-up-heading" className="font-semibold">
								You’re caught up
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								QuickDash has no unfinished setup actions for this workspace.
								New operational summaries will appear here as their modules
								provide them.
							</p>
						</div>
					</div>
				</section>
			)}

			{home.quickActions.length > 0 && (
				<section aria-labelledby="quick-actions-heading">
					<h2 id="quick-actions-heading" className="font-medium text-lg">
						Quick actions
					</h2>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						{home.quickActions.map((action) => (
							<Link
								key={action.id}
								href={action.href}
								className="rounded-xl border p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<span className="flex items-center justify-between gap-3 font-medium text-sm">
									{action.label}
									<ArrowRight className="size-4 shrink-0" />
								</span>
								<span className="mt-1 block text-muted-foreground text-sm">
									{action.description}
								</span>
							</Link>
						))}
					</div>
				</section>
			)}

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
