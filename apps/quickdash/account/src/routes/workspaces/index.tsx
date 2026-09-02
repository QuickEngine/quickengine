import {
	DotsSixVerticalIcon,
	FunnelIcon,
	type Icon,
	MagnifyingGlassIcon,
	RowsIcon,
	SquaresFourIcon,
} from "@phosphor-icons/react";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { RequestFailure } from "../../components/page-state";
import { SkeletonRows } from "../../components/skeletons";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { clientEnv } from "../../lib/env";
import { getBusinessType } from "../../lib/workspace-catalog";

/** The page's one create action. Pill, filled, ink on the popover surface so it
 * inverts correctly in both themes. */
const addAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85";

/** Enter the workspace — the reason this page exists, so it is the filled one. */
const openAction =
	"inline-flex h-7 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink))] px-3 text-[11px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85";

/** Configure it, which is not what you came here to do: outline, not fill. */
const quietLink =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.06)]";

/** `quickdash.xyz/caffeinate` — where this workspace actually answers. */
const workspaceUrl = (identifier: string) => {
	try {
		return `${new URL(clientEnv.DASH_URL).host}/${identifier}`;
	} catch {
		return identifier;
	}
};

const chip =
	"rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2 py-0.5 text-[10.5px] text-[var(--ink-50)]";

const testBadge =
	"shrink-0 rounded-[3px] bg-[#f5a623]/[0.14] px-1.5 py-0.5 font-medium text-[9px] text-[#f5b44a] uppercase tracking-[0.09em]";

const mutedBadge =
	"shrink-0 rounded-[3px] bg-[rgb(var(--console-ink)/0.07)] px-1.5 py-0.5 font-medium text-[9px] text-[var(--ink-40)] uppercase tracking-[0.09em]";

const created = (value: string) =>
	new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(new Date(value));

/** "Orders, Payments and 4 more" — the shape of the workspace in one line. */
const moduleSummary = (ids: string[], name: (id: string) => string) => {
	if (ids.length === 0) return "None";
	const [first, second] = ids.map(name);
	const rest = ids.length - (second ? 2 : 1);
	const head = second ? `${first}, ${second}` : first;
	return rest > 0 ? `${head} +${rest}` : head;
};

type View = "cards" | "table";

const VIEWS: ReadonlyArray<{ id: View; label: string; Glyph: Icon }> = [
	{ id: "cards", label: "Card view", Glyph: SquaresFourIcon },
	{ id: "table", label: "Table view", Glyph: RowsIcon },
];

/** Workspaces in the active organization. */
function WorkspacesPage() {
	const { active } = useActiveOrganization();
	const workspaces = useQuery(accountQueries.workspaces(active?.id ?? ""));
	const catalog = useQuery(accountQueries.moduleCatalog());
	const [query, setQuery] = useState("");
	const [view, setView] = useState<View>("cards");

	// Falls back to the id, so a module the catalog has not heard of still reads
	// as something rather than vanishing from the workspace it is enabled in.
	const moduleNames = new Map(
		(catalog.data?.items ?? []).map((module) => [module.id, module.name]),
	);
	const moduleName = (id: string) => moduleNames.get(id) ?? id;

	/**
	 * The card order, dragged by hand.
	 *
	 * ⚠️ Kept in this browser, not on the server. A workspace has no ordering
	 * column, so this cannot follow you to another machine or be shared with a
	 * teammate — it is one person's arrangement of their own cards. Persisting it
	 * properly needs a per-user ordering field on the workspace membership.
	 */
	const orderKey = `quickengine-workspace-order:${active?.id ?? ""}`;
	const [order, setOrder] = useState<string[]>(() => {
		try {
			const stored: unknown = JSON.parse(
				localStorage.getItem(orderKey) ?? "[]",
			);
			return Array.isArray(stored)
				? stored.filter((id): id is string => typeof id === "string")
				: [];
		} catch {
			return [];
		}
	});
	const [dragging, setDragging] = useState<string | null>(null);

	const needle = query.trim().toLowerCase();
	const items = (workspaces.data?.items ?? []).filter((workspace) =>
		needle
			? [
					workspace.name,
					workspace.slug ?? "",
					getBusinessType(workspace.businessType)?.name ??
						workspace.businessType,
				]
					.join(" ")
					.toLowerCase()
					.includes(needle)
			: true,
	);

	// Dragged cards first, in their arranged order; anything never dragged keeps
	// the server's order behind them, so a new workspace always shows up.
	const rank = (id: string) => {
		const index = order.indexOf(id);
		return index === -1 ? Number.MAX_SAFE_INTEGER : index;
	};
	const ordered = [...items].sort((a, b) => rank(a.id) - rank(b.id));

	const moveCard = (sourceId: string | null, targetId: string) => {
		setDragging(null);
		if (!sourceId || sourceId === targetId) return;
		const ids = ordered.map((workspace) => workspace.id);
		const from = ids.indexOf(sourceId);
		const to = ids.indexOf(targetId);
		if (from === -1 || to === -1) return;
		ids.splice(to, 0, ids.splice(from, 1)[0]);
		setOrder(ids);
		try {
			localStorage.setItem(orderKey, JSON.stringify(ids));
		} catch {
			// A browser refusing storage still reorders for this session.
		}
	};

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-3 flex items-center gap-2">
				<div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 transition-colors focus-within:border-[rgb(var(--console-ink)/0.18)]">
					<MagnifyingGlassIcon
						size={14}
						className="shrink-0 text-[var(--ink-30)]"
					/>
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search workspaces"
						className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
					/>
				</div>

				{/* 🔑 The popover is anchored to the whole control group, not to the filter
			    button, so it spans from that button's left edge to the right edge of
			    the create action. `--radix-popover-trigger-width` is the anchor's
			    measured width, which keeps the span exact as the labels change. */}
				<Popover>
					<PopoverAnchor asChild>
						<div className="flex shrink-0 items-center gap-2">
							<PopoverTrigger className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 text-[12.5px] text-[var(--ink-50)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-85)] focus-visible:bg-[rgb(var(--console-ink)/0.04)] data-[state=open]:bg-[rgb(var(--console-ink)/0.04)] data-[state=open]:text-[var(--ink-85)]">
								<FunnelIcon size={14} />
								Filter
							</PopoverTrigger>

							{/* One switch, not two buttons: a filled track with a thumb that slides
				    between the two icons. Both stay visible, so the control says where
				    it can go rather than only where it is. */}
							<button
								type="button"
								role="switch"
								aria-checked={view === "table"}
								aria-label={`View: ${view === "table" ? "table" : "cards"}. Switch to ${view === "table" ? "cards" : "table"}.`}
								onClick={() => setView(view === "cards" ? "table" : "cards")}
								/* A switch between two equal views. Visible track, no on-colour —
								   see the row/card switch in QuickDash for the same reasoning. */
								className="relative flex h-9 w-[4.25rem] shrink-0 items-center rounded-full border border-[var(--console-line-strong)] bg-[rgb(var(--console-ink)/0.04)] p-0.5 outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.08)] focus-visible:bg-[rgb(var(--console-ink)/0.08)]"
							>
								<span
									aria-hidden="true"
									className={`absolute top-0.5 left-0.5 size-8 rounded-full bg-[rgb(var(--console-ink)/0.14)] transition-transform duration-200 ease-out ${
										view === "table" ? "translate-x-8" : "translate-x-0"
									}`}
								/>
								{VIEWS.map(({ id, Glyph }) => (
									<span
										key={id}
										className={`relative z-10 flex size-8 items-center justify-center transition-colors ${
											view === id
												? "text-[var(--ink-90)]"
												: "text-[var(--ink-30)]"
										}`}
									>
										<Glyph size={15} />
									</span>
								))}
							</button>

							<Link to="/workspaces/new" className={addAction}>
								New workspace
							</Link>
						</div>
					</PopoverAnchor>
					<PopoverContent
						side="bottom"
						align="start"
						sideOffset={6}
						aria-label="Filter workspaces"
						className="w-[var(--radix-popover-trigger-width)] rounded-lg border-[var(--console-line-strong)] bg-[var(--console-pop)] p-2 shadow-2xl"
					>
						<p className="px-1 py-6 text-center text-[11.5px] text-[var(--ink-30)]">
							No filters yet.
						</p>
					</PopoverContent>
				</Popover>
			</div>

			{workspaces.isPending ? (
				<SkeletonRows rows={4} />
			) : workspaces.isError ? (
				<RequestFailure
					error={workspaces.error}
					onRetry={() => {
						void workspaces.refetch();
					}}
				/>
			) : items.length === 0 ? (
				<p className="text-[12px] text-[var(--ink-30)]">
					{needle ? "No workspaces match that." : "No workspaces yet."}
				</p>
			) : view === "table" ? (
				<div className="overflow-x-auto rounded-lg border border-[var(--console-line-strong)]">
					<table className="w-full min-w-[52rem] border-collapse text-left">
						<thead>
							<tr className="border-[var(--console-line-soft)] border-b text-[10px] text-[var(--ink-30)] uppercase tracking-[0.1em]">
								<th className="px-4 py-2.5 font-medium">Workspace</th>
								<th className="px-4 py-2.5 font-medium">Type</th>
								<th className="px-4 py-2.5 font-medium">Environment</th>
								<th className="px-4 py-2.5 font-medium">Modules</th>
								<th className="px-4 py-2.5 font-medium">Created</th>
								<th className="w-0 px-4 py-2.5" />
							</tr>
						</thead>
						<tbody className="divide-y divide-[var(--console-line-soft)]">
							{ordered.map((workspace) => (
								<tr
									key={workspace.id}
									draggable
									onDragStart={() => setDragging(workspace.id)}
									onDragEnd={() => setDragging(null)}
									onDragOver={(event) => event.preventDefault()}
									onDrop={(event) => {
										event.preventDefault();
										moveCard(dragging, workspace.id);
									}}
									className={`group cursor-grab transition-colors hover:bg-[rgb(var(--console-ink)/0.03)] active:cursor-grabbing ${
										dragging === workspace.id ? "opacity-40" : ""
									}`}
								>
									<td className="px-4 py-3">
										<div className="flex items-center">
											{/* No grip. The row is draggable and the grab cursor says
											    so; a permanent handle earns nothing on a dense table. */}
											{/* Same slot as the card: initials until a workspace can
											    carry an image. */}
											<span
												aria-hidden="true"
												className="mr-2.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--console-ink)/0.07)] text-[11px] text-[var(--ink-50)]"
											>
												{workspace.name.trim().charAt(0).toUpperCase() || "?"}
											</span>
											<span className="truncate text-[12.5px] text-[var(--ink-90)]">
												{workspace.name}
											</span>
											{workspace.archivedAt ? (
												<span className={`ml-2.5 ${mutedBadge}`}>Archived</span>
											) : null}
										</div>
									</td>
									<td className="px-4 py-3 text-[11.5px] text-[var(--ink-40)]">
										{getBusinessType(workspace.businessType)?.name ??
											workspace.businessType}
									</td>
									<td className="px-4 py-3">
										{workspace.environment === "test" ? (
											<span className={testBadge}>Test</span>
										) : (
											<span className="text-[11.5px] text-[var(--ink-40)]">
												Live
											</span>
										)}
									</td>
									<td className="px-4 py-3 text-[11.5px] text-[var(--ink-40)]">
										{moduleSummary(workspace.modules, moduleName)}
									</td>
									<td className="px-4 py-3 text-[11.5px] text-[var(--ink-35)]">
										{created(workspace.createdAt)}
									</td>
									<td className="px-4 py-3">
										<div className="flex items-center justify-end gap-1.5">
											{workspace.slug ? (
												<Link
													to="/workspaces/$slug"
													params={{ slug: workspace.slug }}
													className={quietLink}
												>
													Manage
												</Link>
											) : null}
											{workspace.archivedAt ? null : (
												<a
													href={`${clientEnv.DASH_URL}/${workspace.slug ?? workspace.id}`}
													className={openAction}
												>
													Open
												</a>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(0,20rem))] justify-start gap-3">
					{/*
					 * 🔴 FIXED tracks, not `1fr` ones.
					 *
					 * `sm:grid-cols-2 xl:grid-cols-3` divided whatever width existed
					 * between two or three cards, so every card grew and shrank
					 * continuously as the sidebar was dragged or the assistant opened —
					 * and between breakpoints they got very wide before suddenly becoming
					 * three narrow ones. That constant rubber is what looked broken.
					 *
					 * `repeat(auto-fill, 20rem)` gives each card ONE width, forever. The
					 * grid fits as many as it can and the leftover goes to the end of the
					 * row rather than into the cards: widening adds a card to the row, it
					 * never resizes the ones already there.
					 *
					 * ⚠️ `minmax(0, 20rem)` rather than a bare `20rem`, so on a narrow
					 * window the single column can still shrink instead of overflowing.
					 */}
					{ordered.map((workspace) => {
						const names = workspace.modules.map(moduleName);
						const shown = names.slice(0, 4);
						const rest = names.length - shown.length;
						return (
							// Drag to reorder. The card is the handle — a grip appears on
							// hover rather than taking permanent space in the corner.
							// biome-ignore lint/a11y/noStaticElementInteractions: the drag handlers are the reorder affordance; the card's own links stay keyboard-reachable and ordering is a preference, not a route to anything.
							<div
								key={workspace.id}
								draggable
								onDragStart={() => setDragging(workspace.id)}
								onDragEnd={() => setDragging(null)}
								onDragOver={(event) => event.preventDefault()}
								onDrop={(event) => {
									event.preventDefault();
									moveCard(dragging, workspace.id);
								}}
								className={`group flex cursor-grab flex-col rounded-lg border border-[var(--console-line-strong)] bg-[var(--console-panel)] p-4 transition-colors active:cursor-grabbing ${
									dragging === workspace.id ? "opacity-40" : ""
								}`}
							>
								<div className="flex items-start gap-3">
									{/* The workspace's mark. There is no image field on a workspace
									    yet, so this is the slot it will fill; initials until then. */}
									<span
										aria-hidden="true"
										className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--console-ink)/0.07)] text-[13px] text-[var(--ink-50)]"
									>
										{workspace.name.trim().charAt(0).toUpperCase() || "?"}
									</span>

									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<p className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-90)]">
												{workspace.name}
											</p>
											{workspace.archivedAt ? (
												<span className={mutedBadge}>Archived</span>
											) : workspace.environment === "test" ? (
												<span className={testBadge}>Test</span>
											) : null}
											<DotsSixVerticalIcon
												size={14}
												className="shrink-0 text-[var(--ink-25)] opacity-0 transition-opacity group-hover:opacity-100"
											/>
										</div>
										<p className="mt-0.5 truncate text-[11px] text-[var(--ink-30)]">
											{workspaceUrl(workspace.slug ?? workspace.id)}
										</p>
									</div>
								</div>

								{/* The modules ARE the workspace: they decide what it can do and
								    what QuickDash shows. Naming a few beats counting them. */}
								<div className="mt-3 flex flex-wrap gap-1">
									{shown.length === 0 ? (
										<span className="text-[11px] text-[var(--ink-25)]">
											No modules enabled
										</span>
									) : (
										<>
											{shown.map((name) => (
												<span key={name} className={chip}>
													{name}
												</span>
											))}
											{rest > 0 ? <span className={chip}>+{rest}</span> : null}
										</>
									)}
								</div>

								<div className="mt-4 flex items-center justify-between gap-2">
									<p className="truncate text-[10.5px] text-[var(--ink-25)]">
										Created {created(workspace.createdAt)}
									</p>
									<div className="flex shrink-0 items-center gap-1.5">
										{workspace.slug ? (
											<Link
												to="/workspaces/$slug"
												params={{ slug: workspace.slug }}
												className={quietLink}
											>
												Manage
											</Link>
										) : null}
										{workspace.archivedAt ? null : (
											<a
												href={`${clientEnv.DASH_URL}/${workspace.slug ?? workspace.id}`}
												className={openAction}
											>
												Open
											</a>
										)}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</main>
	);
}

export const Route = createFileRoute("/workspaces/")({
	component: WorkspacesPage,
});
