import {
	FunnelIcon,
	MagnifyingGlassIcon,
	SortAscendingIcon,
} from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState, RequestFailure } from "../components/page-state";
import { SkeletonRows } from "../components/skeletons";
import { clientEnv } from "../lib/env";
import { quickDashQueries } from "../lib/quickdash-api";

/**
 * The workspace picker — the only QuickDash screen with no workspace.
 *
 * 🔑 Rendered OUTSIDE the console shell on purpose. Every part of that shell —
 * the switcher, the module list, the sandbox banner — describes a workspace, and
 * there is not one yet. Chrome around nothing is how a product feels broken
 * before it has done anything.
 *
 * 🔴 It does not auto-redirect to the last workspace. Somebody with a live shop
 * and a sandbox must choose deliberately; skipping the choice is how a test
 * order gets taken against the real business.
 */

const businessLabel = (value: string) =>
	value
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());

/**
 * Synthetic workspaces, for looking at the states this screen is normally in
 * for about four seconds a day.
 *
 * 🔑 `?preview=full` and `?preview=empty`. The picker has three states and two
 * of them are effectively unreachable once you have a workspace: you cannot see
 * the empty state again without deleting your business, and you cannot see the
 * two-column layout without creating seven. So they never got looked at, and a
 * screen nobody looks at is a screen that quietly rots.
 *
 * ⚠️ Read-only and additive to nothing. It swaps what the list RENDERS and
 * touches no query, no cache and no database — leaving the preview is a
 * navigation, not a cleanup.
 */
const PREVIEW_WORKSPACES = [
	["Caffeinate", "coffee-roastery", "live"],
	["Gemsutopia", "jewellery", "live"],
	["NeoEngine", "software", "live"],
	["Northwind Supply", "wholesale", "live"],
	["Alder & Co", "boutique", "test"],
	["Harbour Books", "bookshop", "live"],
	["Third Wave", "subscription-box", "test"],
	["Studio Ferrous", "fabrication", "live"],
	["Palewell Farm", "grocery", "live"],
].map(([name, businessType, environment], index) => ({
	id: `preview-${index}`,
	name,
	slug: null,
	businessType,
	environment,
}));

function WorkspacePicker() {
	const workspaces = useQuery(quickDashQueries.workspaces());
	const [query, setQuery] = useState("");
	/**
	 * The same two controls every list in the console carries, doing the two
	 * things worth doing here.
	 *
	 * ⚠️ Both are REAL. Drawing a funnel and a sort icon to match the chrome and
	 * then wiring them to nothing would be worse than leaving them out: a
	 * control that does not work teaches somebody that the console's controls do
	 * not work.
	 */
	const [mode, setMode] = useState<"all" | "live" | "test">("all");
	const [order, setOrder] = useState<"name" | "type">("name");
	const { preview } = Route.useSearch();

	const live = workspaces.data?.items ?? [];
	const all =
		preview === "full"
			? (PREVIEW_WORKSPACES as typeof live)
			: preview === "empty"
				? ([] as typeof live)
				: live;
	const needle = query.trim().toLowerCase();
	const visible = all
		.filter((workspace) =>
			needle
				? `${workspace.name} ${workspace.businessType}`
						.toLowerCase()
						.includes(needle)
				: true,
		)
		.filter((workspace) =>
			mode === "all" ? true : (workspace.environment ?? "live") === mode,
		)
		.slice()
		.sort((a, b) =>
			order === "name"
				? a.name.localeCompare(b.name)
				: a.businessType.localeCompare(b.businessType) ||
					a.name.localeCompare(b.name),
		);

	return (
		<main className="flex min-h-svh items-center justify-center bg-[var(--console-bg)] px-5 py-16 text-[var(--ink-90)]">
			<div className={all.length > 6 ? "w-full max-w-2xl" : "w-full max-w-md"}>
				{/* 🔴 No heading and no instruction line.
				    "QuickDash / Choose which business you are working in." named the
				    product you are already inside and narrated a list you can see.
				    It is the voice of onboarding on a screen you meet a thousand
				    times, and it was the reason the page read as a different product
				    from the console behind it. */}

				{/* 🔑 ONE panel, exactly like an outlet's table.
				    The search strip is the panel's top row with a hairline under
				    it, then the rows. It is not a separate floating bar — that is
				    only how the EMPTY state looks, because `EmptyState` draws its
				    own border inside the panel. Building from the empty screenshot
				    got this backwards once already. */}
				{/* A real surface with a real shadow, not a bordered void. An
				    outline on the page's own colour is a shape drawn on the floor;
				    this is a panel sitting on it, which is what gives the cards
				    inside something to lift away from. */}
				<div
					style={{ boxShadow: "var(--lift-panel)" }}
					className="overflow-hidden rounded-xl border border-[var(--console-line)] bg-[var(--surface-panel)]"
				>
					<div className="flex h-11 items-center gap-2 border-[var(--console-line-soft)] border-b px-2.5">
						<Popover>
							<PopoverTrigger
								aria-label="Filter"
								title="Filter"
								className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--ink-45)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-85)] data-[state=open]:bg-[rgb(var(--console-ink)/0.06)] data-[state=open]:text-[var(--ink-85)]"
							>
								<FunnelIcon
									size={15}
									weight={mode === "all" ? "regular" : "fill"}
								/>
							</PopoverTrigger>
							<PopoverContent
								align="start"
								sideOffset={8}
								className="w-44 rounded-xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-1"
							>
								{(
									[
										["all", "All workspaces"],
										["live", "Live only"],
										["test", "Sandbox only"],
									] as const
								).map(([value, label]) => (
									<button
										key={value}
										type="button"
										onClick={() => setMode(value)}
										className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] ${
											mode === value
												? "text-[var(--ink-90)]"
												: "text-[var(--ink-50)]"
										}`}
									>
										{label}
									</button>
								))}
							</PopoverContent>
						</Popover>

						<label className="flex min-w-0 flex-1 items-center gap-2">
							<MagnifyingGlassIcon
								size={15}
								aria-hidden="true"
								className="shrink-0 text-[var(--ink-35)]"
							/>
							<span className="sr-only">Find a workspace</span>
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Find a workspace"
								className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
							/>
						</label>

						<Popover>
							<PopoverTrigger
								aria-label="Sort"
								title="Sort"
								className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--ink-45)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-85)] data-[state=open]:bg-[rgb(var(--console-ink)/0.06)] data-[state=open]:text-[var(--ink-85)]"
							>
								<SortAscendingIcon size={15} />
							</PopoverTrigger>
							<PopoverContent
								align="end"
								sideOffset={8}
								className="w-44 rounded-xl border border-[var(--console-line-strong)] bg-[var(--console-pop)] p-1"
							>
								{(
									[
										["name", "Name"],
										["type", "Business type"],
									] as const
								).map(([value, label]) => (
									<button
										key={value}
										type="button"
										onClick={() => setOrder(value)}
										className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] ${
											order === value
												? "text-[var(--ink-90)]"
												: "text-[var(--ink-50)]"
										}`}
									>
										{label}
									</button>
								))}
							</PopoverContent>
						</Popover>
					</div>

					{workspaces.isPending && !preview ? (
						<div className="p-3">
							<SkeletonRows rows={3} />
						</div>
					) : workspaces.isError && !preview ? (
						<div className="p-3">
							<RequestFailure
								error={workspaces.error}
								onRetry={() => {
									void workspaces.refetch();
								}}
							/>
						</div>
					) : all.length === 0 ? (
						<div className="p-3">
							<EmptyState
								title="No workspaces yet"
								detail="A workspace is one business: its records, its modules and its own API credentials. They are created in your account."
								action={
									<a
										href={`${clientEnv.ACCOUNT_URL}/workspaces/new`}
										className="inline-flex h-8 items-center justify-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] no-underline transition-opacity hover:opacity-90"
									>
										Create a workspace
									</a>
								}
							/>
						</div>
					) : visible.length === 0 ? (
						<div className="p-3">
							<EmptyState
								title="Nothing matches"
								detail="Try a different search."
							/>
						</div>
					) : (
						/* 🔑 Populated POPS, empty stays flat.
						   A list with something in it is a set of objects you pick
						   between, and they should read as objects — lifted off the
						   panel, each one its own card. An empty state has nothing to
						   pick, so raising a box that says "nothing here" gives weight
						   to the absence. Same panel, two different insides. */
						<div
							className={`p-2.5 ${
								all.length > 6
									? "grid grid-cols-1 gap-2.5 sm:grid-cols-2"
									: "flex flex-col gap-2.5"
							}`}
						>
							{visible.map((workspace) => (
								<Link
									key={workspace.id}
									to="/$workspace"
									// Slug where there is one; the id remains a valid address
									// for a workspace that never got one.
									params={{ workspace: workspace.slug ?? workspace.id }}
									style={{ boxShadow: "var(--lift-card)" }}
									/* 🔑 One step ABOVE the panel, on both surface and
									   shadow. Both used to be `--console-card` with the same
									   2px `--card-lift`, so a card sat on a surface of its own
									   colour casting a shadow nothing could see — which is
									   exactly why neither appeared to pop. */
									className="group flex items-center gap-3 rounded-lg border border-[var(--console-line)] bg-[var(--surface-card)] p-3 outline-none transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-px hover:border-[var(--console-line-strong)]"
								>
									<span
										aria-hidden="true"
										className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--console-ink)/0.07)] text-[12px] text-[var(--ink-50)]"
									>
										{workspace.name.trim().charAt(0).toUpperCase() || "?"}
									</span>
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-2">
											<span className="min-w-0 truncate text-[12.5px] text-[var(--ink-90)]">
												{workspace.name}
											</span>
											{/* The one thing worth knowing BEFORE you go in. */}
											{workspace.environment === "test" ? (
												<span className="shrink-0 rounded-[3px] bg-[color-mix(in_srgb,var(--signal-attention)_16%,transparent)] px-1.5 py-0.5 font-medium text-[9px] text-[var(--signal-attention-text)] uppercase tracking-[0.09em]">
													Sandbox
												</span>
											) : null}
										</span>
										<span className="mt-0.5 block truncate text-[11px] text-[var(--ink-30)]">
											{businessLabel(workspace.businessType)}
										</span>
									</span>
								</Link>
							))}
						</div>
					)}
				</div>

				{/* Centred, and the quietest thing on the page: it leaves QuickDash. */}
				<div className="mt-4 flex justify-center">
					<a
						href={clientEnv.ACCOUNT_URL}
						className="inline-flex h-8 items-center justify-center rounded-md px-3 text-[11.5px] text-[var(--ink-35)] no-underline transition-colors hover:bg-[rgb(var(--console-ink)/0.05)] hover:text-[var(--ink-75)]"
					>
						Manage workspaces in your account
					</a>
				</div>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/")({
	component: WorkspacePicker,
	validateSearch: (search: Record<string, unknown>): { preview?: string } => ({
		preview:
			search.preview === "full" || search.preview === "empty"
				? String(search.preview)
				: undefined,
	}),
});
