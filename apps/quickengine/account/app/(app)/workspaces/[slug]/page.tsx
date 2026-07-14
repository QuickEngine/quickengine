import { getSession } from "@quickengine/auth/server";
import { and, db, eq } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import {
	FOUNDATION_MODULE_IDS,
	getWorkspaceModuleCatalog,
} from "@quickengine/module-registry";
import { Button } from "@quickengine/ui/components/ui/button";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusinessType } from "../../../_lib/workspace-catalog";
import { DeleteWorkspaceForm } from "./delete-workspace-form";
import { ModuleToggleForm } from "./module-toggle-form";
import { WorkspaceLifecycleForm } from "./workspace-lifecycle-form";
import { WorkspaceNameForm } from "./workspace-name-form";

const QUICKDASH_URL =
	process.env.NEXT_PUBLIC_QUICKDASH_ADMIN_URL ?? "http://localhost:3011";

export const metadata: Metadata = { title: "Workspace" };

function createdDate(value: Date): string {
	return new Intl.DateTimeFormat("en", {
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(value);
}

function settingValue(value: unknown): string {
	if (typeof value === "boolean") {
		return value ? "On" : "Off";
	}
	if (typeof value === "string" || typeof value === "number") {
		return String(value);
	}
	return JSON.stringify(value);
}

export default async function Page({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const session = await getSession(await headers());
	if (!session) {
		return null;
	}
	const { slug } = await params;
	const [workspace] = await db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			slug: quickengineWorkspaces.slug,
			businessType: quickengineWorkspaces.businessType,
			archivedAt: quickengineWorkspaces.archivedAt,
			createdAt: quickengineWorkspaces.createdAt,
		})
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.ownerId, session.user.id),
				eq(quickengineWorkspaces.slug, slug),
			),
		)
		.limit(1);
	if (!workspace) {
		notFound();
	}

	const modules = await getWorkspaceModuleCatalog(workspace.id);
	const businessType = getBusinessType(workspace.businessType);
	const foundationIds = new Set<string>(FOUNDATION_MODULE_IDS);

	return (
		<div className="space-y-8 p-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-sm">
						{businessType?.name ?? workspace.businessType}
					</p>
					<h1 className="mt-1 font-semibold text-2xl text-foreground">
						{workspace.name}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						Created {createdDate(workspace.createdAt)}
					</p>
				</div>
				<div className="flex gap-2">
					{!workspace.archivedAt ? (
						<Button asChild>
							<a href={`${QUICKDASH_URL}/${workspace.id}`}>Open QuickDash</a>
						</Button>
					) : null}
					<Button asChild variant="outline">
						<Link href="/">Back to workspaces</Link>
					</Button>
				</div>
			</div>
			{workspace.archivedAt && (
				<div className="rounded-xl border border-foreground/10 bg-foreground/[0.04] p-4 text-sm">
					This workspace is archived. Its data and module settings are
					preserved, but it is outside the active workspace list until restored.
				</div>
			)}

			<section className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-xl border border-foreground/[0.06] p-4">
					<p className="text-muted-foreground text-xs">Stable slug</p>
					<p className="mt-1 break-all font-medium text-sm">{workspace.slug}</p>
				</div>
				<div className="rounded-xl border border-foreground/[0.06] p-4">
					<p className="text-muted-foreground text-xs">Business type</p>
					<p className="mt-1 font-medium text-sm">
						{businessType?.name ?? workspace.businessType}
					</p>
				</div>
				<div className="rounded-xl border border-foreground/[0.06] p-4">
					<p className="text-muted-foreground text-xs">Modules</p>
					<p className="mt-1 font-medium text-sm">
						{modules.filter((module) => module.enabled).length} enabled
					</p>
				</div>
			</section>

			<WorkspaceNameForm
				workspaceId={workspace.id}
				slug={workspace.slug ?? slug}
				name={workspace.name}
			/>

			<WorkspaceLifecycleForm
				workspaceId={workspace.id}
				slug={workspace.slug ?? slug}
				archived={workspace.archivedAt !== null}
			/>

			{workspace.archivedAt && (
				<DeleteWorkspaceForm
					workspaceId={workspace.id}
					slug={workspace.slug ?? slug}
					name={workspace.name}
				/>
			)}

			<section>
				<div>
					<h2 className="font-medium text-lg">Workspace modules</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						This is the canonical configuration QuickDash will render for this
						workspace.
					</p>
				</div>
				<div className="mt-4 grid gap-4 lg:grid-cols-2">
					{modules.map((module) => {
						const foundation = foundationIds.has(module.id);
						return (
							<article
								key={module.id}
								className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-5"
							>
								<div className="flex items-start justify-between gap-3">
									<div>
										<h3 className="font-medium">{module.name}</h3>
										<p className="mt-1 text-muted-foreground text-sm">
											{module.description}
										</p>
									</div>
									<div className="flex shrink-0 flex-col items-end gap-2">
										<span className="rounded-full border border-foreground/10 px-2 py-0.5 text-[11px] text-muted-foreground">
											{module.enabled ? "Enabled" : "Disabled"}
										</span>
										{foundation ? (
											<span className="text-muted-foreground text-xs">
												Always included
											</span>
										) : workspace.archivedAt ? (
											<span className="text-muted-foreground text-xs">
												Restore to manage
											</span>
										) : (
											<ModuleToggleForm
												workspaceId={workspace.id}
												slug={workspace.slug ?? slug}
												moduleId={module.id}
												enabled={module.enabled}
											/>
										)}
									</div>
								</div>
								<dl className="mt-4 grid gap-2 border-foreground/[0.06] border-t pt-4 text-sm">
									{Object.entries(module.settings).map(([key, value]) => (
										<div key={key} className="flex justify-between gap-4">
											<dt className="text-muted-foreground">{key}</dt>
											<dd className="text-right">{settingValue(value)}</dd>
										</div>
									))}
								</dl>
							</article>
						);
					})}
				</div>
			</section>
		</div>
	);
}
