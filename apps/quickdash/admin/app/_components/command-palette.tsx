"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@quickengine/ui/components/ui/command";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
	searchWorkspaceAction,
	type WorkspaceSearchHit,
} from "../_lib/search-actions";

// ⌘K command palette for a workspace. The header pill (or ⌘K/Ctrl-K) opens it; results come
// from the workspace-scoped search proxy (server-filtered to this workspace). cmdk's own
// filtering runs over each item's title+description, so every server hit stays visible.
export function CommandPalette({ workspaceId }: { workspaceId: string }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<WorkspaceSearchHit[]>([]);
	const [, startTransition] = useTransition();

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

	useEffect(() => {
		if (!open) return;
		const q = query.trim();
		if (!q) {
			setHits([]);
			return;
		}
		const timer = setTimeout(() => {
			startTransition(async () => {
				setHits(await searchWorkspaceAction(workspaceId, q));
			});
		}, 200);
		return () => clearTimeout(timer);
	}, [query, open, workspaceId]);

	function go(hit: WorkspaceSearchHit) {
		setOpen(false);
		setQuery("");
		if (hit.url) router.push(hit.url);
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex items-center gap-2 rounded-lg border border-foreground/10 px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-foreground/5 hover:text-foreground"
			>
				<MagnifyingGlass className="size-4" />
				<span className="hidden sm:inline">Search</span>
				<kbd className="hidden rounded border border-foreground/10 px-1 text-[10px] sm:inline">
					⌘K
				</kbd>
			</button>

			<CommandDialog open={open} onOpenChange={setOpen}>
				<CommandInput
					placeholder="Search this workspace…"
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList>
					<CommandEmpty>
						{query.trim() ? "No matches." : "Type to search records."}
					</CommandEmpty>
					{hits.length > 0 && (
						<CommandGroup heading="Records">
							{hits.map((hit) => (
								<CommandItem
									key={hit.objectID}
									value={`${hit.title} ${hit.description ?? ""}`}
									onSelect={() => go(hit)}
								>
									<div className="flex flex-col">
										<span className="text-foreground">{hit.title}</span>
										{hit.description && (
											<span className="text-muted-foreground text-xs">
												{hit.description}
											</span>
										)}
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
