import { getSession } from "@quickengine/auth/server";
import {
	clientRecordsSettingsSchema,
	listClientRecords,
} from "@quickengine/mod-client-records";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ClientRecordsView } from "../../_components/client-records-view";
import { ModuleIcon } from "../../_components/module-icon";
import { getModuleNavigation } from "../../_lib/module-navigation";
import { requireWorkspaceAccess } from "../../_lib/workspace-access";

export default async function Page({
	params,
}: {
	params: Promise<{ workspace: string; module: string }>;
}) {
	const session = await getSession(await headers());
	if (!session) {
		return null;
	}
	const { workspace: workspaceId, module: moduleId } = await params;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) {
		notFound();
	}
	const enabledModule = access.modules.find((module) => module.id === moduleId);
	const navigation = getModuleNavigation(moduleId);
	if (!enabledModule || !navigation) {
		notFound();
	}
	const clientRecords =
		moduleId === "client-records"
			? await listClientRecords(access.workspace.id)
			: null;
	const clientSettings =
		moduleId === "client-records"
			? clientRecordsSettingsSchema.parse(enabledModule.settings)
			: null;
	return (
		<main className="p-6">
			<div className="flex items-start gap-4">
				<div className="flex size-11 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.04]">
					<ModuleIcon id={moduleId} className="size-5" />
				</div>
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="font-semibold text-2xl">{navigation.label}</h1>
						<Badge variant="secondary">Enabled</Badge>
					</div>
					<p className="mt-2 text-muted-foreground text-sm">
						{enabledModule.description}
					</p>
				</div>
			</div>
			{clientRecords && clientSettings ? (
				<ClientRecordsView
					workspaceId={access.workspace.id}
					records={clientRecords.map((record) => ({
						id: record.id,
						name: record.name,
						email: record.email,
						phone: record.phone,
						company: record.company,
						notes: record.notes,
						createdAt: record.createdAt.toISOString(),
					}))}
					labelSingular={clientSettings.recordLabelSingular}
					labelPlural={clientSettings.recordLabelPlural}
					fields={clientSettings.fields}
				/>
			) : (
				<section className="mt-8 rounded-xl border border-dashed p-8">
					<h2 className="font-medium">Module connected</h2>
					<p className="mt-2 max-w-xl text-muted-foreground text-sm">
						QuickDash resolved this module from the workspace registry and
						enforced workspace ownership before rendering it. Its operational
						interface is the next layer to build.
					</p>
				</section>
			)}
		</main>
	);
}
