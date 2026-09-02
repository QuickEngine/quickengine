import {
	CaretRightIcon,
	ClockCounterClockwiseIcon,
	HouseIcon,
	type Icon,
	ImagesIcon,
	PlugsIcon,
} from "@phosphor-icons/react";
import { Link, useLocation } from "@tanstack/react-router";
import { useHeaderRail } from "./header-action";
import { ModuleIcon } from "./module-icon";
import { MODULE_CHILDREN } from "./workspace-nav";

/**
 * Where in the console you are, read left to right.
 *
 * 🔑 It answers a question the sidebar cannot. The sidebar says what EXISTS;
 * the breadcrumb says which of it you are looking at — and on a section page
 * the sidebar's highlight is on a child row two levels down, which is easy to
 * miss and impossible to read at a glance.
 *
 * 🔴 The module crumb is a LINK, the leaf is not. A crumb that navigates to the
 * page you are already on is a control that does nothing, and the trailing
 * segment is a label rather than a destination in every breadcrumb worth
 * copying.
 */

/** Pages that are not modules but still need a name and an icon. */
const FIXED: Readonly<Record<string, readonly [string, Icon]>> = {
	media: ["Media", ImagesIcon],
	audit: ["Activity", ClockCounterClockwiseIcon],
	connect: ["Developers", PlugsIcon],
};

/** `module` marks a crumb that links to that module's own page. */
type Crumb = { label: string; module?: string };

export function WorkspaceBreadcrumb({
	workspace,
	modules,
}: {
	workspace: string;
	modules: ReadonlyArray<{ id: string; name: string }>;
}) {
	const { pathname } = useLocation();
	const { setRail } = useHeaderRail();

	// Everything after the workspace slug. Parsed from the path rather than read
	// from route params because this renders in the LAYOUT, above the outlet —
	// it has no typed params for whichever child route is mounted.
	const rest = pathname
		.split("/")
		.filter(Boolean)
		.slice(1)
		.map((segment) => decodeURIComponent(segment));

	const [first, second] = rest;

	let LeadIcon: Icon | null = null;
	let moduleId: string | null = null;
	let crumbs: Crumb[] = [];

	if (!first) {
		LeadIcon = HouseIcon;
		crumbs = [{ label: "Home" }];
	} else if (FIXED[first]) {
		const [label, FixedIcon] = FIXED[first];
		LeadIcon = FixedIcon;
		crumbs = [{ label }];
	} else {
		const module = modules.find((candidate) => candidate.id === first);
		// An unknown segment is not worth guessing a name for. Showing nothing is
		// better than showing a raw url fragment styled as a page title.
		if (!module) {
			// 🔴 Still renders. Returning null here would take the rail with it, and
			// a page whose module the context has not loaded yet would lose Export,
			// Filter and its create button rather than just its name.
			crumbs = [];
		} else {
			moduleId = module.id;

			const children = MODULE_CHILDREN[module.id];
			const childLabel = children?.find(
				([segment]) => segment === (second ?? ""),
			)?.[1];

			// 🔑 A module whose own page is named after the module shows ONE crumb.
			// Orders' index is "Orders", so "Orders > Orders" would be noise — but
			// Inventory's index is "Levels", which genuinely is a page within it.
			if (!second) {
				crumbs =
					childLabel && childLabel !== module.name
						? [{ label: module.name, module: module.id }, { label: childLabel }]
						: [{ label: module.name }];
			} else {
				crumbs = [
					{ label: module.name, module: module.id },
					{ label: childLabel ?? second },
				];
			}
		}
	}

	return (
		/**
		 * One row: where you are on the left, what you can do on the right.
		 *
		 * 🔑 The controls arrive by PORTAL from whichever list page is mounted.
		 * They used to sit in a row of their own directly underneath, which spent
		 * a whole line of vertical space on two things that read perfectly well
		 * side by side — and pushed every table down with it.
		 */
		<div className="flex items-center justify-between gap-3">
			<nav
				aria-label="Breadcrumb"
				className="flex min-w-0 items-center gap-1.5 text-[13px]"
			>
				{moduleId ? (
					<ModuleIcon
						id={moduleId}
						className="size-[15px] shrink-0 text-[var(--ink-42)]"
					/>
				) : LeadIcon ? (
					<LeadIcon size={15} className="shrink-0 text-[var(--ink-42)]" />
				) : null}
				{crumbs.map((crumb, index) => {
					const last = index === crumbs.length - 1;
					return (
						<span
							key={crumb.label}
							className="flex min-w-0 items-center gap-1.5"
						>
							{index > 0 ? (
								<CaretRightIcon
									size={10}
									weight="bold"
									aria-hidden="true"
									className="shrink-0 text-[var(--ink-42)]"
								/>
							) : null}
							{crumb.module && !last ? (
								<Link
									to="/$workspace/$module"
									params={{ workspace, module: crumb.module }}
									className="truncate text-[var(--ink-42)] transition-colors hover:text-[var(--ink-85)]"
								>
									{crumb.label}
								</Link>
							) : (
								<span
									aria-current={last ? "page" : undefined}
									className={`truncate ${last ? "font-medium text-[var(--ink-90)]" : "text-[var(--ink-42)]"}`}
								>
									{crumb.label}
								</span>
							)}
						</span>
					);
				})}
			</nav>
			{/* Where a list page's Export, Filter, view toggle and create action
			    land. Always rendered, even with no crumbs, so a page never loses
			    its controls because its name could not be resolved. */}
			<div ref={setRail} className="flex shrink-0 items-center gap-2" />
		</div>
	);
}
