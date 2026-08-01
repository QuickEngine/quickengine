import {
	CaretRightIcon,
	ChartLineUpIcon,
	SquaresFourIcon,
} from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ModuleIcon } from "./module-icon";

export const MODULE_LABELS: Readonly<Record<string, string>> = {
	"client-records": "Client Records",
	invoicing: "Invoicing",
	payments: "Payments",
	fulfillment: "Fulfillment",
	files: "Files & Documents",
	"products-services": "Products & Services",
	orders: "Orders",
	inventory: "Inventory",
	shipping: "Shipping",
	bookings: "Bookings",
	"projects-tasks": "Projects & Tasks",
	"time-tracking": "Time Tracking",
	"quotes-estimates": "Quotes & Estimates",
	"contracts-esign": "Contracts & E-sign",
	"reporting-analytics": "Reporting & Analytics",
};

/**
 * Analytics sections, and the module each one needs.
 *
 * These are the real sections `getWorkspaceReportDto` returns — it marks each
 * `available` only when its module is enabled, so the same filter runs here.
 * Showing "Revenue" to a workspace with no payments module would offer a report
 * that renders empty.
 *
 * ⚠️ They currently all land on the same page. The reporting view renders every
 * section in one scroll, so `?section=` is carried but does nothing yet — it is
 * the seam for splitting them, not a promise that they are split.
 */
const ANALYTICS_SECTIONS: { id: string; label: string; needs: string }[] = [
	{ id: "revenue", label: "Revenue", needs: "payments" },
	{ id: "orders", label: "Orders", needs: "orders" },
	{ id: "invoices", label: "Invoices", needs: "invoicing" },
	{ id: "clients", label: "Clients", needs: "client-records" },
	{ id: "bookings", label: "Bookings", needs: "bookings" },
	{ id: "projects", label: "Projects", needs: "projects-tasks" },
	{ id: "inventory", label: "Inventory", needs: "inventory" },
];

/**
 * Sub-items a module can expand to. Empty for now — these are records, and
 * records come from each module's own query. Wiring them is a per-module job;
 * the shape is here so the expand behaviour can be designed against it.
 */
const SUBMENUS: Readonly<Record<string, { label: string; href: string }[]>> =
	{};

function SectionLabel({ children }: { children: string }) {
	return (
		<p className="px-2 pt-4 pb-1 font-body text-[10px] text-dim/70 uppercase tracking-[0.12em]">
			{children}
		</p>
	);
}

/**
 * Dashboard and Analytics — pinned, not scrolled.
 *
 * Separate from the module list because with all fifteen modules enabled the
 * list overflows and these two were being pushed off the top. They are the two
 * places you return to constantly, so they stay put and the modules scroll
 * behind them — the same treatment the Feedback/Settings group gets at the
 * bottom.
 */
export function SidebarTop({
	workspaceId,
	moduleIds,
}: {
	workspaceId: string;
	moduleIds: string[];
}) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [analyticsOpen, setAnalyticsOpen] = useState(false);

	const analyticsHref = moduleIds.includes("reporting-analytics")
		? `/${workspaceId}/reporting-analytics`
		: null;
	const sections = ANALYTICS_SECTIONS.filter((section) =>
		moduleIds.includes(section.needs),
	);

	const row =
		"group inline-flex h-8 w-full items-center gap-2.5 rounded-md px-2 font-body text-[13px] transition-colors";
	const idle = "text-dim hover:bg-field hover:text-ink";
	const active = "bg-field text-ink";

	return (
		<div className="flex flex-col gap-1 px-2 pt-2">
			{/* Above the Modules label, not inside it — neither of these is a module,
			    and putting them in that group would imply they are. */}
			<Link
				to="/$workspace"
				params={{ workspace: workspaceId }}
				className={`${row} ${pathname === `/${workspaceId}` ? active : idle}`}
			>
				<SquaresFourIcon size={16} className="shrink-0" />
				<span className="truncate">Dashboard</span>
			</Link>

			{analyticsHref ? (
				<div>
					<div
						className={`${row} ${pathname.startsWith(analyticsHref) ? active : idle} pr-1`}
					>
						<ChartLineUpIcon size={16} className="shrink-0" />
						<Link
							to="/$workspace/$module"
							params={{ workspace: workspaceId, module: "reporting-analytics" }}
							className="min-w-0 flex-1 truncate"
						>
							Analytics
						</Link>
						{sections.length > 0 ? (
							<button
								type="button"
								aria-label={analyticsOpen ? "Collapse" : "Expand"}
								aria-expanded={analyticsOpen}
								onClick={() => setAnalyticsOpen((open) => !open)}
								className="shrink-0 rounded p-1 text-dim hover:text-ink"
							>
								<CaretRightIcon
									size={11}
									className={`transition-transform duration-200 ${analyticsOpen ? "rotate-90" : ""}`}
								/>
							</button>
						) : null}
					</div>

					{analyticsOpen && sections.length > 0 ? (
						<div className="my-1 ml-[1.4rem] flex flex-col gap-1 border-edge border-l pl-2">
							{sections.map((section) => (
								<a
									key={section.id}
									href={`${analyticsHref}?section=${section.id}`}
									className="truncate rounded-md px-2 py-1.5 font-body text-[13px] text-dim transition-colors hover:bg-field hover:text-ink"
								>
									{section.label}
								</a>
							))}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export function SidebarNav({
	workspaceId,
	moduleIds,
}: {
	workspaceId: string;
	moduleIds: string[];
}) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [expanded, setExpanded] = useState<string | null>(null);

	const row =
		"group inline-flex h-8 w-full items-center gap-2.5 rounded-md px-2 font-body text-[13px] transition-colors";
	const idle = "text-dim hover:bg-field hover:text-ink";
	const active = "bg-field text-ink";

	return (
		<nav
			data-orientation-target="module-navigation"
			className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pt-2 pb-2"
		>
			<SectionLabel>Modules</SectionLabel>
			{moduleIds
				.filter((id) => id !== "reporting-analytics")
				.map((id) => {
					const href = `/${workspaceId}/${id}`;
					const isActive = pathname === href || pathname.startsWith(`${href}/`);
					const items = SUBMENUS[id] ?? [];
					const isOpen = expanded === id;

					return (
						<div key={id}>
							<div className={`${row} ${isActive ? active : idle} pr-1`}>
								<ModuleIcon id={id} className="size-4 shrink-0" />
								<Link
									to="/$workspace/$module"
									params={{ workspace: workspaceId, module: id }}
									className="min-w-0 flex-1 truncate"
								>
									{MODULE_LABELS[id] ?? id}
								</Link>

								{/* Only modules that HAVE sub-items get a disclosure. A caret on
							    a row that expands to nothing is a promise the UI breaks. */}
								{items.length > 0 ? (
									<button
										type="button"
										aria-label={isOpen ? "Collapse" : "Expand"}
										aria-expanded={isOpen}
										onClick={() => setExpanded(isOpen ? null : id)}
										className="shrink-0 rounded p-1 text-dim hover:text-ink"
									>
										<CaretRightIcon
											size={11}
											className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
										/>
									</button>
								) : null}
							</div>

							{/* No icons down here, deliberately. Sub-items are instances of the
						    thing above them, not categories of their own — the parent's icon
						    already classifies them, and repeating one per row turns a list
						    of records into a column of identical glyphs.

						    The rule instead: one hairline down the group, which is what
						    actually communicates "these belong to that". */}
							{isOpen && items.length > 0 ? (
								<div className="my-0.5 ml-[1.4rem] flex flex-col border-edge border-l pl-2">
									{items.map((item) => (
										<Link
											key={item.href}
											to={item.href}
											className="truncate rounded-md px-2 py-1.5 font-body text-[13px] text-dim transition-colors hover:bg-field hover:text-ink"
										>
											{item.label}
										</Link>
									))}
								</div>
							) : null}
						</div>
					);
				})}
		</nav>
	);
}
