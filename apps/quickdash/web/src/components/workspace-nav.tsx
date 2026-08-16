import { CaretRightIcon, HouseIcon, PlugsIcon } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { QuickDashModule } from "../lib/quickdash-api";
import { ModuleIcon } from "./module-icon";

/**
 * The QuickDash sidebar navigation.
 *
 * 🔴 The module list is the workspace's ENABLED set, named by the registry
 * through `/quickdash/context`. The previous nav kept its own id→label map, which
 * is how the onboarding catalog drifted into offering 5 of 15 modules. Enabling
 * a module in Account changes this list with no code change here.
 *
 * 🔑 **Modules with several capabilities expand; modules with one do not.**
 * Shipping is shipments AND zones AND rates — flattening it puts three unrelated
 * jobs on one screen. Expanding also happens to be how somebody discovers a
 * capability they did not know they had.
 *
 * Anything that lives INSIDE a record stays out of navigation: variants belong to
 * a product, refunds to a payment, addresses to a client, signers to a contract.
 * A sidebar row for them would promise a list that should never exist.
 */

/** Capabilities with their own operator surface, by module id. `""` is the
 * module's own page and always comes first. */
const MODULE_CHILDREN: Readonly<
	Record<string, ReadonlyArray<readonly [string, string]>>
> = {
	"products-services": [
		["", "Products"],
		["categories", "Categories"],
		["reviews", "Reviews"],
	],
	orders: [
		["", "Orders"],
		["discounts", "Discounts"],
	],
	inventory: [
		["", "Levels"],
		["adjustments", "Adjustments"],
	],
	shipping: [
		["", "Shipments"],
		["zones", "Zones"],
		["rates", "Rates"],
	],
	payments: [
		["", "Payments"],
		["providers", "Providers"],
	],
	"client-records": [
		["", "Clients"],
		["messages", "Messages"],
	],
	"projects-tasks": [
		["", "Projects"],
		["tasks", "Tasks"],
	],
	files: [
		["", "Files"],
		["folders", "Folders"],
	],
	"reporting-analytics": [
		["", "Revenue"],
		["traffic", "Traffic"],
	],
};

/**
 * Modules grouped the way a business thinks about them.
 *
 * A group with nothing enabled disappears entirely, so a service business never
 * sees an empty COMMERCE heading. Anything not listed here lands in the final
 * group rather than vanishing — a new module appears in the sidebar the day it
 * ships, without being routed through this file first.
 */
const GROUPS: ReadonlyArray<{ label: string; ids: readonly string[] }> = [
	{
		label: "Commerce",
		ids: [
			"products-services",
			"orders",
			"inventory",
			"shipping",
			"fulfillment",
		],
	},
	{ label: "Money", ids: ["payments", "invoicing", "quotes-estimates"] },
	// A booking is a person's appointment, not a sale — grouping it with orders
	// implies money changed hands.
	{ label: "People", ids: ["client-records", "bookings"] },
	{ label: "Work", ids: ["projects-tasks", "time-tracking"] },
	{ label: "Documents", ids: ["files", "contracts-esign"] },
	{ label: "Website", ids: ["content"] },
	{ label: "Insight", ids: ["reporting-analytics"] },
	{ label: "More", ids: [] },
];

const row =
	"group flex h-8 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-[12.5px] outline-none transition-colors";
const idle =
	"text-[var(--ink-42)] hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-85)]";
const active = "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-90)]";

function SectionLabel({ children }: { children: string }) {
	return (
		<p className="shrink-0 px-2 pt-4 pb-1.5 text-[8.5px] text-[var(--ink-20)] uppercase tracking-[0.14em]">
			{children}
		</p>
	);
}

function ModuleItem({
	workspaceId,
	module,
	pathname,
}: {
	workspaceId: string;
	module: QuickDashModule;
	pathname: string;
}) {
	const base = `/${workspaceId}/${module.id}`;
	const children = MODULE_CHILDREN[module.id];
	const within = pathname === base || pathname.startsWith(`${base}/`);
	// Opens itself when you are inside it, so nothing is ever hidden from where
	// you already are.
	const [open, setOpen] = useState(within);

	if (!children) {
		return (
			<Link
				to="/$workspace/$module"
				params={{ workspace: workspaceId, module: module.id }}
				title={module.description}
				className={`${row} ${within ? active : idle}`}
			>
				<ModuleIcon id={module.id} className="size-[15px] shrink-0" />
				<span className="truncate">{module.name}</span>
			</Link>
		);
	}

	return (
		<div className="shrink-0">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				aria-expanded={open}
				title={module.description}
				className={`${row} ${within ? active : idle}`}
			>
				<ModuleIcon id={module.id} className="size-[15px] shrink-0" />
				<span className="min-w-0 flex-1 truncate text-left">{module.name}</span>
				<CaretRightIcon
					size={11}
					className={`shrink-0 text-[var(--ink-25)] transition-transform ${open ? "rotate-90" : ""}`}
				/>
			</button>
			{open ? (
				<div className="my-1 flex shrink-0 flex-col gap-1">
					{children.map(([segment, label]) => {
						const href = segment ? `${base}/${segment}` : base;
						// The first child owns the module's own path, so it matches
						// exactly — otherwise Products stays lit while you are in
						// Categories.
						const isCurrent = segment
							? pathname === href || pathname.startsWith(`${href}/`)
							: pathname === base;
						return (
							<Link
								key={href}
								// Route id plus params, never an interpolated path — the
								// router's types are what keep a link from outliving the page
								// it points at.
								{...(segment
									? {
											to: "/$workspace/$module/$section" as const,
											params: {
												workspace: workspaceId,
												module: module.id,
												section: segment,
											},
										}
									: {
											to: "/$workspace/$module" as const,
											params: { workspace: workspaceId, module: module.id },
										})}
								className={`flex h-8 w-full shrink-0 items-center rounded-md pr-2 pl-[2.15rem] text-[11.5px] transition-colors ${
									isCurrent
										? "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-85)]"
										: "text-[var(--ink-32)] hover:bg-[rgb(var(--console-ink)/0.045)] hover:text-[var(--ink-75)]"
								}`}
							>
								{label}
							</Link>
						);
					})}
				</div>
			) : null}
		</div>
	);
}

export function WorkspaceNav({
	workspaceId,
	modules,
}: {
	workspaceId: string;
	modules: QuickDashModule[];
}) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	// Both edges of the scrolling list, measured the same way: the header's rule
	// appears once there is content above, the footer's once there is content
	// below. A permanent divider claims the list is cut off even when it is not.
	const listRef = useRef<HTMLElement | null>(null);
	const [scrolled, setScrolled] = useState(false);
	const [more, setMore] = useState(false);

	const measure = useCallback(() => {
		const list = listRef.current;
		if (!list) return;
		setScrolled(list.scrollTop > 0);
		setMore(list.scrollHeight - list.scrollTop - list.clientHeight > 1);
	}, []);

	// On mount and whenever the list changes length — a workspace with every
	// module enabled overflows immediately, before anybody has scrolled.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measuring when the module count changes is the point.
	useEffect(measure, [measure, modules.length]);

	const byId = new Map(modules.map((module) => [module.id, module]));
	const grouped = GROUPS.map((group) => ({
		label: group.label,
		modules: group.ids.flatMap((id) => {
			const module = byId.get(id);
			if (module) byId.delete(id);
			return module ? [module] : [];
		}),
	}));
	// Whatever the groups did not claim — a module that shipped after this file
	// was last edited.
	const last = grouped[grouped.length - 1];
	if (last) last.modules = [...last.modules, ...byId.values()];

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<nav
				className={`flex shrink-0 flex-col gap-1 border-b px-2 pb-1 transition-colors ${scrolled ? "border-[var(--console-line-soft)]" : "border-transparent"}`}
			>
				<Link
					to="/$workspace"
					params={{ workspace: workspaceId }}
					className={`${row} ${pathname === `/${workspaceId}` ? active : idle}`}
				>
					<HouseIcon size={15} className="shrink-0" />
					<span className="truncate">Home</span>
				</Link>
			</nav>

			<nav
				ref={listRef}
				onScroll={measure}
				className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2"
			>
				{modules.length === 0 ? (
					<p className="px-2 py-3 text-[11px] text-[var(--ink-25)] leading-4">
						No modules are enabled. Turn them on in Account.
					</p>
				) : (
					grouped
						.filter((group) => group.modules.length > 0)
						.map((group) => (
							<div key={group.label} className="flex shrink-0 flex-col gap-1">
								<SectionLabel>{group.label}</SectionLabel>
								{group.modules.map((module) => (
									<ModuleItem
										key={module.id}
										workspaceId={workspaceId}
										module={module}
										pathname={pathname}
									/>
								))}
							</div>
						))
				)}
			</nav>

			<div
				className={`flex shrink-0 flex-col gap-1 border-t px-2 py-2 transition-colors ${more ? "border-[var(--console-line-soft)]" : "border-transparent"}`}
			>
				<Link
					to="/$workspace/connect"
					params={{ workspace: workspaceId }}
					className={`${row} ${pathname === `/${workspaceId}/connect` ? active : idle}`}
				>
					<PlugsIcon size={15} className="shrink-0" />
					<span className="truncate">Connect</span>
				</Link>
			</div>
		</div>
	);
}
