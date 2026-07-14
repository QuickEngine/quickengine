import { getSession } from "@quickengine/auth/server";
import { Button } from "@quickengine/ui/components/ui/button";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModuleIcon } from "../_components/module-icon";
import { getModuleNavigation } from "../_lib/module-navigation";
import { requireWorkspaceAccess } from "../_lib/workspace-access";

export const metadata: Metadata = { title: "Overview" };

export default async function Page({
	params,
}: {
	params: Promise<{ workspace: string }>;
}) {
	const session = await getSession(await headers());
	if (!session) {
		return null;
	}
	const { workspace: workspaceId } = await params;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) {
		notFound();
	}

	return (
		<main className="space-y-8 p-6">
			<div>
				<p className="text-muted-foreground text-sm">Workspace overview</p>
				<h1 className="mt-1 font-semibold text-2xl">{access.workspace.name}</h1>
				<p className="mt-2 max-w-2xl text-muted-foreground text-sm">
					This QuickDash is assembled from the modules enabled in QuickEngine.
					Choose a module to begin operating this business.
				</p>
			</div>
			<section>
				<div className="flex items-end justify-between gap-4">
					<div>
						<h2 className="font-medium text-lg">Enabled modules</h2>
						<p className="text-muted-foreground text-sm">
							{access.modules.length} available in this workspace
						</p>
					</div>
				</div>
				<div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{access.modules.map((module) => {
						const navigation = getModuleNavigation(module.id);
						if (!navigation) {
							return null;
						}
						return (
							<article
								key={module.id}
								className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-5"
							>
								<ModuleIcon id={module.id} className="size-5" />
								<h3 className="mt-4 font-medium">{navigation.label}</h3>
								<p className="mt-1 min-h-10 text-muted-foreground text-sm">
									{navigation.description}
								</p>
								<Button asChild variant="outline" className="mt-5 w-full">
									<Link href={`/${workspaceId}/${module.id}`}>Open module</Link>
								</Button>
							</article>
						);
					})}
				</div>
			</section>
		</main>
	);
}
