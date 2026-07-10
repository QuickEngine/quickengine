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
import { useEffect, useState } from "react";

const QUICK_LINKS = [
	{ href: "/", label: "Dashboard" },
	{ href: "/workspaces", label: "Workspaces" },
	{ href: "/analytics", label: "Analytics" },
	{ href: "/billing", label: "Billing" },
];

// Global header search. The bar is a trigger; it opens a command-palette modal
// (also on ⌘K / Ctrl-K). Placement is provisional (centered for now). Results are
// placeholder quick links until real search is wired.
export function SearchBar() {
	const [open, setOpen] = useState(false);

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

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex h-9 w-52 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-muted-foreground text-sm outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-foreground/40"
			>
				<MagnifyingGlass className="size-4 shrink-0" />
				<span className="flex-1 text-left">Search...</span>
				<kbd className="pointer-events-none hidden rounded border border-foreground/15 bg-foreground/5 px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground sm:inline-block">
					⌘K
				</kbd>
			</button>
			<CommandDialog open={open} onOpenChange={setOpen}>
				<CommandInput placeholder="Search..." />
				<CommandList>
					<CommandEmpty>No results found.</CommandEmpty>
					<CommandGroup heading="Quick links">
						{QUICK_LINKS.map(({ href, label }) => (
							<CommandItem
								key={href}
								value={label}
								onSelect={() => {
									setOpen(false);
									window.location.assign(href);
								}}
							>
								{label}
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</CommandDialog>
		</>
	);
}
