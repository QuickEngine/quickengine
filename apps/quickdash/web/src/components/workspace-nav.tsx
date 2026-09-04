import {
	CaretRightIcon,
	CaretUpIcon,
	ClockCounterClockwiseIcon,
	HouseIcon,
	ImagesIcon,
	PlugsIcon,
} from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NavSignal } from "../lib/nav-signals";
import { readOpenModules, writeOpenModules } from "../lib/nav-state";
import type { QuickDashModule } from "../lib/quickdash-api";
import { ModuleIcon } from "./module-icon";
import { WorkingSpinner } from "./working-spinner";

/** Shared with the bell and the toasts; one meaning per colour, everywhere. */
const SIGNAL_COLOR: Record<NavSignal["signal"], string> = {
	news: "var(--signal-news)",
	attention: "var(--signal-attention)",
	failure: "var(--signal-failure)",
};

/**
 * The trailing marker slot at the end of a nav row.
 *
 * 🔴 Exactly the caret glyph's width, and every trailing marker sits in one.
 *
 * Without it a dot and a caret on neighbouring rows are 2.5px out of line, and
 * the arithmetic is why: both end at the same right padding, but the caret is
 * 11px wide and the dot is 6px, so their centres land at `edge - 5.5` and
 * `edge - 3`. Small enough to look like a rendering artefact and survive a dev
 * server restart, which is precisely what makes it worth pinning down. Centring
 * both in a fixed 11px box puts them on one axis by construction.
 */
const marker = "flex w-[11px] shrink-0 items-center justify-center";

/** Loudest wins when a collapsed module hides several kinds at once. */
const SIGNAL_RANK: Record<NavSignal["signal"], number> = {
	news: 0,
	attention: 1,
	failure: 2,
};

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
export const MODULE_CHILDREN: Readonly<
	Record<string, ReadonlyArray<readonly [string, string]>>
> = {
	"products-services": [
		["", "Products"],
		["categories", "Categories"],
		["reviews", "Reviews"],
	],
	orders: [
		["", "Orders"],
		["subscriptions", "Subscriptions"],
		["discounts", "Discounts"],
		["partners", "Partners"],
	],
	inventory: [
		["", "Levels"],
		["adjustments", "Adjustments"],
		["suppliers", "Suppliers"],
		["purchase-orders", "Purchase orders"],
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
};

/**
 * Modules grouped the way a business thinks about them.
 *
 * A group with nothing enabled disappears entirely, so a service business never
 * sees an empty COMMERCE heading. Anything not listed here lands in the final
 * group rather than vanishing — a new module appears in the sidebar the day it
 * ships, without being routed through this file first.
 */
/**
 * A row in a group that is NOT a module.
 *
 * 🔑 Some capabilities every workspace has regardless of what it bought — Media
 * is the first. They still belong in a named group rather than pinned to the
 * bottom strip, which is reserved for "do this or nothing works" (Connect). A
 * bottom strip that accumulates stops reading as a starting point.
 */
type NavExtra = {
	id: string;
	label: string;
	path: string;
	/**
	 * ⚠️ The route id, not an interpolated path. The router's types are what stop
	 * a sidebar link outliving the page it points at — and this was hardcoded to
	 * Media's route, which worked only because Media was the only extra there has
	 * ever been. A second one silently linked to the first.
	 */
	to: "/$workspace/media" | "/$workspace/audit";
	Icon: typeof ImagesIcon;
};

const GROUPS: ReadonlyArray<{
	label: string;
	ids: readonly string[];
	extras?: readonly NavExtra[];
}> = [
	/**
	 * Ordered by the day, not by the data model.
	 *
	 * Three rules, applied in this order:
	 *
	 * 1. **Frequency first.** What somebody opens every morning sits at the top.
	 *    Orders led by Products meant the busiest page in the console sat behind
	 *    one people configure occasionally.
	 * 2. **Cause before effect.** An order, its payment, the work of delivering
	 *    it and the parcel that leaves are one sale seen four times. Splitting
	 *    them across "Commerce" and "Money" meant following a single sale
	 *    crossed groups.
	 * 3. **Setup apart from operation.** A catalog is arranged, then revisited.
	 *    Triage and configuration are different modes and mixing them makes both
	 *    harder to scan.
	 */

	// Today's work, in the order one sale moves through it.
	{ label: "Selling", ids: ["orders", "payments", "fulfillment", "shipping"] },

	// What you sell, and how much is left. Arranged, then revisited.
	{ label: "Catalog", ids: ["products-services", "inventory"] },

	// A booking is a person's appointment, not a sale — grouping it with orders
	// would imply money changed hands.
	{ label: "Customers", ids: ["client-records", "bookings"] },

	// Money you are OWED, which is a different mode from money already taken.
	// A quote becomes an invoice, so it comes first.
	{ label: "Billing", ids: ["quotes-estimates", "invoicing"] },

	{ label: "Work", ids: ["projects-tasks", "time-tracking"] },

	// Above Documents deliberately: the words on a business's own site change
	// far more often than anybody opens a signed contract.
	//
	// Content is the words, Media is the pictures — both are what appears on the
	// customer's own site, which is what makes this the right home for Media
	// rather than the bottom strip.
	{
		label: "Website",
		ids: ["content"],
		extras: [
			{
				id: "media",
				label: "Media",
				path: "media",
				to: "/$workspace/media",
				Icon: ImagesIcon,
			},
		],
	},

	{ label: "Documents", ids: ["files", "contracts-esign"] },

	/**
	 * 🔑 A group of one, which `HIDDEN_FROM_NAV` above rejects for Reporting —
	 * and the difference is worth stating. Reporting was hidden because revenue
	 * and traffic are things you READ about the workspace, which is what Home
	 * already is; a second place to read them would disagree with the first.
	 *
	 * Activity is not a summary of anything. It is the only record of who changed
	 * what, it is what somebody opens at 2am with a customer on the phone, and
	 * there is nowhere else in the product it could live.
	 */
	{
		label: "Workspace",
		ids: [],
		extras: [
			{
				id: "audit",
				label: "Activity",
				path: "audit",
				to: "/$workspace/audit",
				Icon: ClockCounterClockwiseIcon,
			},
		],
	},
];

/**
 * Enabled modules that get NO sidebar entry.
 *
 * 🔴 Must be explicit. Anything the groups do not claim falls into "More", so
 * simply deleting a module from `GROUPS` does not remove it from the sidebar —
 * it moves it somewhere worse.
 *
 * Reporting is here because revenue and traffic are things a person READS about
 * the workspace as a whole, which is exactly what Home is. Everything else in
 * QuickDash is something they OPERATE. A group of one buried the numbers an
 * owner opens most underneath eight groups of chores.
 */
const HIDDEN_FROM_NAV = new Set(["reporting-analytics"]);

/**
 * ⚠️ Width is NOT baked in. `row` carries `w-full shrink-0`, which is right for
 * a stacked list and wrong beside anything: a row that fills its parent and
 * refuses to shrink pushes a sibling clean out of the container. `rowBase` is
 * for rows that share a line.
 */
const rowBase =
	"group flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2 text-[12.5px] outline-none transition-colors";
const row = `${rowBase} w-full`;
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
	childBadges,
	open,
	onToggle,
}: {
	workspaceId: string;
	module: QuickDashModule;
	pathname: string;
	/** Keyed `moduleId/section`; a truthy value shows a dot on that row. */
	childBadges?: Record<string, NavSignal>;
	/** Remembered open state, owned by the nav so "collapse all" can reach it. */
	open: boolean;
	onToggle: (open: boolean) => void;
}) {
	const base = `/${workspaceId}/${module.id}`;
	const children = MODULE_CHILDREN[module.id];
	const within = pathname === base || pathname.startsWith(`${base}/`);
	/**
	 * Open because you opened it, and nothing else.
	 *
	 * 🔴 Being INSIDE a group no longer forces it open. It used to — `within ||
	 * open` — which meant the one group you were actually using was the one group
	 * you could not collapse. The caret was there, it just did nothing, and
	 * "collapse all" left a section standing.
	 *
	 * ⚠️ Navigating into a group still OPENS it (see the effect in the nav), so
	 * the useful default is unchanged. The difference is that it is now a
	 * starting point rather than a rule, which is how the account sidebar has
	 * always behaved.
	 */
	const expanded = open;
	// Only while COLLAPSED: once open, each child shows its own, and two dots for
	// one fact reads as two problems.
	//
	// 🔑 The rolled-up dot takes the LOUDEST child's colour. A collapsed Payments
	// hiding a dispute must not show the same calm blue as one hiding a new
	// order — the colour is the only thing distinguishing them while shut.
	const rolledUp = (children ?? [])
		.map(([segment]) => childBadges?.[`${module.id}/${segment}`])
		.filter((badge): badge is NavSignal => Boolean(badge))
		.sort((a, b) => SIGNAL_RANK[b.signal] - SIGNAL_RANK[a.signal])[0];

	if (!children) {
		// A module with no sub-pages still has notifications pointing at it, and
		// they key on the module's own path — the same `moduleId/` an expandable
		// module's first child uses. Without this the dot silently goes nowhere.
		const own = childBadges?.[`${module.id}/`];
		return (
			<Link
				to="/$workspace/$module"
				params={{ workspace: workspaceId, module: module.id }}
				title={module.description}
				className={`${row} ${within ? active : idle}`}
			>
				<ModuleIcon id={module.id} className="size-[15px] shrink-0" />
				<span className="min-w-0 flex-1 truncate">{module.name}</span>
				{own ? (
					<>
						<span className="sr-only">{own.count} unread</span>
						{/* A module with no sub-pages has no caret, so the dot takes the
						    slot the caret would have used and lands on its axis. */}
						<span className={marker}>
							<span
								aria-hidden="true"
								className="size-1.5 rounded-full"
								style={{ background: SIGNAL_COLOR[own.signal] }}
							/>
						</span>
					</>
				) : null}
			</Link>
		);
	}

	return (
		<div className="shrink-0">
			<button
				type="button"
				onClick={() => onToggle(!expanded)}
				aria-expanded={expanded}
				title={module.description}
				className={`${row} ${within ? active : idle}`}
			>
				<ModuleIcon id={module.id} className="size-[15px] shrink-0" />
				<span className="min-w-0 flex-1 truncate text-left">{module.name}</span>
				{/* Bubbling preserved: collapsed, the loudest child's colour shows on
				    the parent. Expanded, the children show their own. */}
				{!expanded && rolledUp ? (
					<span className={marker}>
						<span
							aria-hidden="true"
							className="size-1.5 rounded-full"
							style={{ background: SIGNAL_COLOR[rolledUp.signal] }}
						/>
					</span>
				) : null}
				<span className={marker}>
					<CaretRightIcon
						size={11}
						className={`text-[var(--ink-25)] transition-transform ${expanded ? "rotate-90" : ""}`}
					/>
				</span>
			</button>
			{expanded ? (
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
								<span className="min-w-0 flex-1 truncate text-left">
									{label}
								</span>
								{/* 🔑 A dot, not a count. On a collapsed-width row the number
								    matters less than the fact that something is waiting — and a
								    count that keeps changing draws the eye every time it moves.
								    The page itself shows how many. */}
								{childBadges?.[`${module.id}/${segment}`] ? (
									// The dot is decorative; the count is announced as text so a
									// screen reader hears "Messages, 3 unread" rather than a bare
									// label with an unexplained mark beside it.
									<>
										<span className="sr-only">
											{childBadges[`${module.id}/${segment}`].count} unread
										</span>
										<span className={marker}>
											<span
												aria-hidden="true"
												className="size-1.5 rounded-full"
												style={{
													background:
														SIGNAL_COLOR[
															childBadges[`${module.id}/${segment}`].signal
														],
												}}
											/>
										</span>
									</>
								) : null}
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
	connectPending,
	childBadges,
}: {
	workspaceId: string;
	modules: QuickDashModule[];
	/** Attention markers for sub-pages, keyed `moduleId/section`. */
	childBadges?: Record<string, NavSignal>;
	/**
	 * A site has been set up but has never called us yet.
	 *
	 * 🔑 Shown on the row rather than only on the Connect page, so somebody can
	 * deploy their site and go and do something else. Watching a page for a
	 * handshake is exactly the wait that made people refresh and lose their
	 * place.
	 */
	connectPending?: boolean;
}) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	/**
	 * Which modules are open, owned HERE rather than by each row.
	 *
	 * 🔑 Lifted so one control can shut them all. While each row held its own
	 * state there was nothing a "collapse all" could talk to.
	 */
	const [openModules, setOpenModules] = useState<Set<string>>(() =>
		readOpenModules(workspaceId),
	);

	/**
	 * 🔑 Walking into a group opens it, once.
	 *
	 * This is what makes collapsing possible: the group you navigate to starts
	 * expanded, and from then on it obeys you. Writing it into the remembered set
	 * rather than deriving it means a later collapse actually sticks.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the path, not the setter
	useEffect(() => {
		const active = modules.find((module) => {
			const base = `/${workspaceId}/${module.id}`;
			return pathname === base || pathname.startsWith(`${base}/`);
		});
		if (!active || !MODULE_CHILDREN[active.id]) return;
		setOpenModules((current) => {
			if (current.has(active.id)) return current;
			const updated = new Set(current).add(active.id);
			writeOpenModules(workspaceId, updated);
			return updated;
		});
	}, [pathname, workspaceId]);

	const toggleModule = useCallback(
		(moduleId: string, next: boolean) => {
			setOpenModules((current) => {
				const updated = new Set(current);
				if (next) updated.add(moduleId);
				else updated.delete(moduleId);
				writeOpenModules(workspaceId, updated);
				return updated;
			});
		},
		[workspaceId],
	);

	const collapseAll = useCallback(() => {
		const empty = new Set<string>();
		writeOpenModules(workspaceId, empty);
		setOpenModules(empty);
	}, [workspaceId]);
	/**
	 * 🔴 The scroll rules are gone, and with them the measuring.
	 *
	 * Two dividers used to appear once there was content above or below, which
	 * was the honest way to say "there is more" with a hard edge. The list now
	 * fades at both ends instead (`fade-ends`), and a rule drawn across a
	 * fading edge is the one thing that breaks the illusion: a crisp line
	 * sitting on top of pixels that are dissolving.
	 *
	 * The fade says the same thing without a scroll listener, a ref, two pieces
	 * of state and a re-measure on every module change.
	 */
	const listRef = useRef<HTMLElement | null>(null);

	const byId = new Map(
		modules
			.filter((module) => !HIDDEN_FROM_NAV.has(module.id))
			.map((module) => [module.id, module]),
	);
	const grouped = GROUPS.map((group) => ({
		label: group.label,
		extras: group.extras ?? [],
		modules: group.ids.flatMap((id) => {
			const module = byId.get(id);
			if (module) byId.delete(id);
			return module ? [module] : [];
		}),
	}));
	// 🔴 No catch-all. A "More" bucket meant a new module silently appeared in a
	// group nobody chose, and deleting a module from `GROUPS` moved it there
	// rather than removing it. Every module belongs to a named group or to
	// `HIDDEN_FROM_NAV`, deliberately — an unlisted one simply does not appear,
	// which is a visible, fixable mistake rather than a quiet wrong answer.

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="shrink-0">
				<nav className="flex flex-col gap-1 px-2 pb-1">
					{/*
					 * Home and "fold everything up" on one line.
					 *
					 * 🔴 The old control was a circle straddling the divider, revealed
					 * only by hovering the header — so the one way to tidy a sidebar
					 * gone long was a button you had to already know was there. On a
					 * touch screen there is no hover at all, which made it
					 * unreachable rather than merely obscure.
					 */}
					{/*
					 * 🔴 A button INSIDE the row, not a sibling beside it — and
					 * absolutely positioned rather than nested, because a `<button>`
					 * inside an `<a>` is invalid HTML and browsers resolve it by
					 * swallowing one of the two clicks.
					 *
					 * The link is padded on the right to leave the caret its space, so
					 * the two never overlap however long the label gets.
					 */}
					<div className="relative">
						<Link
							to="/$workspace"
							params={{ workspace: workspaceId }}
							className={`${row} pr-8 ${pathname === `/${workspaceId}` ? active : idle}`}
						>
							<HouseIcon size={15} className="shrink-0" />
							<span className="truncate">Home</span>
						</Link>
						{/* Only once something is actually open: a collapse control on a
						    sidebar with nothing expanded does nothing. */}
						{openModules.size > 0 ? (
							<button
								type="button"
								onClick={collapseAll}
								title="Collapse all"
								aria-label="Collapse all groups"
								className="-translate-y-1/2 absolute top-1/2 right-1 flex size-6 items-center justify-center rounded text-[var(--ink-35)] transition-colors hover:bg-[rgb(var(--console-ink)/0.08)] hover:text-[var(--ink-85)]"
							>
								<CaretUpIcon size={12} weight="bold" />
							</button>
						) : null}
					</div>
				</nav>
			</div>

			<nav
				ref={listRef}
				className="fade-ends flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2"
			>
				{modules.length === 0 ? (
					<p className="px-2 py-3 text-[11px] text-[var(--ink-25)] leading-4">
						No modules are enabled. Turn them on in Account.
					</p>
				) : (
					grouped
						// ⚠️ `|| extras` matters: Website would otherwise disappear when the
						// Content module is off, taking Media — which every workspace has —
						// with it.
						.filter(
							(group) => group.modules.length > 0 || group.extras.length > 0,
						)
						.map((group) => (
							<div key={group.label} className="flex shrink-0 flex-col gap-1">
								<SectionLabel>{group.label}</SectionLabel>
								{group.modules.map((module) => (
									<ModuleItem
										key={module.id}
										workspaceId={workspaceId}
										module={module}
										pathname={pathname}
										childBadges={childBadges}
										open={openModules.has(module.id)}
										onToggle={(next) => toggleModule(module.id, next)}
									/>
								))}
								{/* Always-present rows that are not modules. Media is the
								    first; see `NavExtra`. */}
								{group.extras.map((extra) => (
									<Link
										key={extra.id}
										to={extra.to}
										params={{ workspace: workspaceId }}
										className={`${row} ${
											pathname === `/${workspaceId}/${extra.path}`
												? active
												: idle
										}`}
									>
										<extra.Icon size={15} className="shrink-0" />
										<span className="min-w-0 flex-1 truncate">
											{extra.label}
										</span>
									</Link>
								))}
							</div>
						))
				)}
			</nav>

			<div className="flex shrink-0 flex-col gap-1 px-2 py-2">
				<Link
					to="/$workspace/connect"
					params={{ workspace: workspaceId }}
					className={`${row} ${pathname === `/${workspaceId}/connect` ? active : idle}`}
				>
					<PlugsIcon size={15} className="shrink-0" />
					<span className="min-w-0 flex-1 truncate">Developers</span>
					{connectPending ? (
						<WorkingSpinner label="Waiting for your site to connect" />
					) : null}
				</Link>
			</div>
		</div>
	);
}
