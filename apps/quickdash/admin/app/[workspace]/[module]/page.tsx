import { getSession } from "@quickengine/auth/server";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ModuleIcon } from "../../_components/module-icon";
import { getModuleNavigation } from "../../_lib/module-navigation";
import { requireWorkspaceAccess } from "../../_lib/workspace-access";
import type { ModulePageProps } from "../../_modules/types";

type ModulePageComponent = (props: ModulePageProps) => Promise<ReactNode>;

// Every operational module page is loaded LAZILY. The dynamic `import()` is what
// puts each module's service + view in its own chunk, so opening one module page
// compiles only that module — not all of them. Statically importing a module's
// service/view into this shell would recompile every module on every page and
// defeat the split (this route was ~21s cold before the split for exactly that).
//
// ADD A NEW OPERATIONAL MODULE PAGE HERE — and only here:
//   1. create `app/_modules/<module>-page.tsx` — a default async component of type
//      `(props: ModulePageProps) => Promise<ReactNode>` that loads its own data and
//      renders its own view;
//   2. add one `"<module-id>": () => import("../../_modules/<module>-page"),` line.
// Never add a static `@quickengine/mod-*` or view import to this file.
const MODULE_PAGES: Record<
	string,
	() => Promise<{ default: ModulePageComponent }>
> = {
	"client-records": () => import("../../_modules/client-records-page"),
	"contracts-esign": () => import("../../_modules/contracts-page"),
	invoicing: () => import("../../_modules/invoicing-page"),
	payments: () => import("../../_modules/payments-page"),
	fulfillment: () => import("../../_modules/fulfillment-page"),
	"products-services": () => import("../../_modules/catalog-page"),
	orders: () => import("../../_modules/orders-page"),
	inventory: () => import("../../_modules/inventory-page"),
	shipping: () => import("../../_modules/shipping-page"),
	bookings: () => import("../../_modules/bookings-page"),
	"projects-tasks": () => import("../../_modules/projects-page"),
	"time-tracking": () => import("../../_modules/time-tracking-page"),
	files: () => import("../../_modules/files-page"),
	"quotes-estimates": () => import("../../_modules/quotes-page"),
	"reporting-analytics": () => import("../../_modules/reporting-page"),
};

export default async function Page({
	params,
	searchParams,
}: {
	params: Promise<{ workspace: string; module: string }>;
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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
	const loadModulePage = MODULE_PAGES[moduleId];
	let content: ReactNode;
	if (loadModulePage) {
		const { default: ModulePage } = await loadModulePage();
		content = await ModulePage({
			workspaceId: access.workspace.id,
			settings: enabledModule.settings,
			today: new Date(),
			searchParams,
		});
	} else {
		content = (
			<section className="mt-8 rounded-xl border border-dashed p-8">
				<h2 className="font-medium">Module connected</h2>
				<p className="mt-2 max-w-xl text-muted-foreground text-sm">
					QuickDash resolved this module from the workspace registry and
					enforced workspace ownership before rendering it. Its operational
					interface is the next layer to build.
				</p>
			</section>
		);
	}
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
			{content}
		</main>
	);
}
