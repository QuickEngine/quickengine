"use client";

import {
	CaretDown,
	Funnel,
	MagnifyingGlass,
	Rows,
	SquaresFour,
} from "@phosphor-icons/react";
import { Button } from "@quickengine/ui/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@quickengine/ui/components/ui/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@quickengine/ui/components/ui/toggle-group";
import { useState } from "react";

type View = "cards" | "table";

// Placeholder workspace recipes (each scoped to one business type). The real,
// docs-driven list replaces this once workspace creation is wired.
const WORKSPACE_TYPES = [
	"E-commerce",
	"Agency",
	"Freelancer",
	"SaaS",
	"Creator",
	"Nonprofit",
	"Restaurant",
	"Blank",
];

export function WorkspacesToolbar() {
	const [query, setQuery] = useState("");
	const [view, setView] = useState<View>("cards");

	return (
		<div className="space-y-6 p-6">
			<div className="flex items-center gap-3">
				{/* Wide search takes the remaining width; controls sit to its right. */}
				<InputGroup className="flex-1">
					<InputGroupAddon>
						<MagnifyingGlass className="size-4" />
					</InputGroupAddon>
					<InputGroupInput
						placeholder="Search Workspaces"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</InputGroup>

				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline" className="font-normal">
							<Funnel className="size-4" />
							Filter
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-64">
						<p className="font-medium text-foreground text-sm">Filters</p>
						{/* Filter controls land here once we decide what's filterable. */}
						<p className="mt-1 text-muted-foreground text-xs">
							No filters yet.
						</p>
					</PopoverContent>
				</Popover>

				{/* Cards ↔ table layout. Guard the empty value so a view stays selected. */}
				<ToggleGroup
					type="single"
					variant="outline"
					value={view}
					onValueChange={(v) => v && setView(v as View)}
					aria-label="Layout"
				>
					<ToggleGroupItem value="cards" aria-label="Cards">
						<SquaresFour className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem value="table" aria-label="Table">
						<Rows className="size-4" />
					</ToggleGroupItem>
				</ToggleGroup>

				<Popover>
					<PopoverTrigger asChild>
						<Button className="font-normal">
							New Workspace
							<CaretDown className="size-4" />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						className="w-(--radix-popover-trigger-width) p-1"
					>
						{/* Placeholder recipes — the real business-type list wires in later. */}
						{WORKSPACE_TYPES.map((type) => (
							<button
								key={type}
								type="button"
								className="w-full rounded-md px-2 py-1.5 text-left text-foreground text-sm transition-colors hover:bg-foreground/5"
							>
								{type}
							</button>
						))}
					</PopoverContent>
				</Popover>
			</div>

			{/* No workspaces yet — the {view} list/table renders here once workspace
			    creation and membership are wired. */}
			<div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
				No workspaces yet
			</div>
		</div>
	);
}
