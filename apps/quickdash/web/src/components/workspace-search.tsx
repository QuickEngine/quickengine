import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@quickengine/ui/components/ui/command";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	searchWorkspaceAction,
	type WorkspaceSearchHit,
} from "../_lib/search-actions";
import { ModuleIcon } from "./module-icon";

const MODULE_LABELS: Readonly<Record<string, string>> = {
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
 * Workspace search — the ⌘K palette and the header control that opens it.
 *
 * Scoped to ONE workspace, always. The server filters by `workspaceId` and the
 * destinations below are all built from it, so nothing from another workspace
 * can appear no matter what is typed.
 *
 * ⚠️ Records are not fully searchable yet. Module and place results are computed
 * here and are complete. Record results come from `/v1/quickdash/search`, which
 * delegates to an Algolia index — so a record only appears if it was written to
 * that index, and nothing writes to it on create/update/delete. See TECH_DEBT 34.
 */
export function WorkspaceSearch({
	workspaceId,
	moduleIds,
}: {
	workspaceId: string;
	moduleIds: string[];
}) {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<WorkspaceSearchHit[]>([]);

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((prev) => !prev);
			}
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	// Debounced, because this hits the network on every keystroke otherwise.
	useEffect(() => {
		if (!open) return;
		const q = query.trim();
		if (!q) {
			setHits([]);
			return;
		}
		const timer = setTimeout(() => {
			searchWorkspaceAction(workspaceId, q)
				.then(setHits)
				.catch(() => setHits([]));
		}, 180);
		return () => clearTimeout(timer);
	}, [open, query, workspaceId]);

	const go = (to: string) => {
		setOpen(false);
		setQuery("");
		navigate({ to });
	};

	// Places that are not modules. Built from the workspace id so they can only
	// ever point inside it.
	const places = [
		{ label: "Workspace home", to: `/${workspaceId}` },
		{ label: "Connect", to: `/${workspaceId}/connect` },
	];

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="btn btn-secondary pointer-events-auto inline-flex h-7 w-52 items-center gap-2 rounded-lg bg-void px-2.5 text-dim transition-colors hover:text-ink"
			>
				<MagnifyingGlassIcon size={14} />
				<span className="font-body text-[13px]">Search your workspace</span>
				<kbd className="ml-auto font-body text-[11px] text-dim">&#8984;K</kbd>
			</button>

			{/* Overrides rather than edits to `command.tsx`, which Account and Auth
			    also consume — restyling the shared component would restyle theirs.

			      · `[&_[data-slot=command-input-wrapper]]:border-0` drops the rule under
			        the search field; the outer dialog border is the only line in here
			      · `gap-1` on the list and groups puts 4px between every row, so nothing
			        ever sits flush against its neighbour
			      · rows come down from the default `py-3` to a 32px control */}
			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				className="max-w-lg [&_[data-slot=command-input-wrapper]]:border-0 [&_[cmdk-item]]:h-8 [&_[cmdk-item]]:rounded-md [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-0 [&_[cmdk-item]]:text-[13px] [&_[cmdk-group]]:px-2"
			>
				<CommandInput
					value={query}
					onValueChange={setQuery}
					placeholder="Search modules, places and records…"
				/>
				<CommandList className="flex flex-col gap-1 px-1 pb-2 [&_[cmdk-group]]:flex [&_[cmdk-group]]:flex-col [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-1">
					<CommandEmpty>No matches in this workspace.</CommandEmpty>

					{/* Records first when there are any — someone who typed a name wants
					    the thing, not the module it lives in. */}
					{/* `url` is optional on a hit, and a result you cannot navigate to is
					    not a result — those are dropped rather than rendered as dead
					    rows. */}
					{hits.some((hit) => hit.url) ? (
						<CommandGroup heading="Records">
							{hits
								.filter(
									(hit): hit is WorkspaceSearchHit & { url: string } =>
										typeof hit.url === "string",
								)
								.map((hit) => (
									<CommandItem
										key={hit.objectID}
										value={`${hit.title} ${hit.description ?? ""}`}
										onSelect={() => go(hit.url)}
									>
										<span className="truncate">{hit.title}</span>
										{hit.description ? (
											<span className="ml-2 truncate text-[12px] text-dim">
												{hit.description}
											</span>
										) : null}
									</CommandItem>
								))}
						</CommandGroup>
					) : null}

					<CommandGroup heading="Modules">
						{moduleIds.map((id) => (
							<CommandItem
								key={id}
								value={MODULE_LABELS[id] ?? id}
								onSelect={() => go(`/${workspaceId}/${id}`)}
							>
								<ModuleIcon id={id} className="size-4 shrink-0" />
								{MODULE_LABELS[id] ?? id}
							</CommandItem>
						))}
					</CommandGroup>

					<CommandGroup heading="Places">
						{places.map((place) => (
							<CommandItem
								key={place.to}
								value={place.label}
								onSelect={() => go(place.to)}
							>
								{place.label}
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</CommandDialog>
		</>
	);
}
