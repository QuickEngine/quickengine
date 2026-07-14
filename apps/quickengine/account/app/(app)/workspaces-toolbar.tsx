"use client";

import {
	ArrowSquareOut,
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

export type WorkspaceSummary = {
	id: string;
	name: string;
	slug: string | null;
	businessType: string;
	modules: string[];
	createdAt: string;
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
	ecommerce: "E-commerce",
	agency: "Agency",
	freelancer: "Freelancer",
	saas: "SaaS",
	creator: "Creator",
	consulting: "Consulting",
};

function businessTypeLabel(id: string): string {
	return BUSINESS_TYPE_LABELS[id] ?? id;
}

function createdDate(value: string): string {
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(new Date(value));
}

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

export function WorkspacesToolbar({
	workspaces,
}: {
	workspaces: WorkspaceSummary[];
}) {
	const [query, setQuery] = useState("");
	const [view, setView] = useState<View>("cards");
	const normalizedQuery = query.trim().toLowerCase();
	const visibleWorkspaces = workspaces.filter((workspace) => {
		if (!normalizedQuery) {
			return true;
		}
		return [
			workspace.name,
			workspace.slug ?? "",
			businessTypeLabel(workspace.businessType),
		]
			.join(" ")
			.toLowerCase()
			.includes(normalizedQuery);
	});

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

			{workspaces.length === 0 ? (
				<div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
					<p className="font-medium text-foreground">No workspaces yet</p>
					<p className="mt-1 max-w-sm text-muted-foreground text-sm">
						Create a workspace to configure the backend for your first business.
					</p>
				</div>
			) : visibleWorkspaces.length === 0 ? (
				<div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
					No workspaces match “{query.trim()}”
				</div>
			) : view === "cards" ? (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{visibleWorkspaces.map((workspace) => (
						<article
							key={workspace.id}
							className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-5"
						>
							<div className="flex items-start justify-between gap-4">
								<div className="min-w-0">
									<h2 className="truncate font-medium text-foreground">
										{workspace.name}
									</h2>
									<p className="mt-1 text-muted-foreground text-sm">
										{businessTypeLabel(workspace.businessType)}
									</p>
								</div>
								<span className="shrink-0 rounded-full border border-foreground/10 px-2 py-0.5 text-[11px] text-muted-foreground">
									Configured
								</span>
							</div>

							<div className="mt-6 grid grid-cols-2 gap-4 border-foreground/[0.06] border-t pt-4 text-sm">
								<div>
									<p className="text-muted-foreground text-xs">Modules</p>
									<p className="mt-1 text-foreground">
										{workspace.modules.length} enabled
									</p>
								</div>
								<div>
									<p className="text-muted-foreground text-xs">Created</p>
									<p className="mt-1 text-foreground">
										{createdDate(workspace.createdAt)}
									</p>
								</div>
							</div>

							<Button
								disabled
								variant="outline"
								className="mt-5 w-full font-normal"
							>
								<ArrowSquareOut className="size-4" />
								QuickDash coming next
							</Button>
						</article>
					))}
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border border-foreground/[0.06]">
					<div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_100px_140px] gap-4 border-foreground/[0.06] border-b bg-foreground/[0.02] px-4 py-3 text-[11px] text-muted-foreground uppercase tracking-wide">
						<span>Workspace</span>
						<span>Type</span>
						<span>Modules</span>
						<span>Created</span>
					</div>
					{visibleWorkspaces.map((workspace) => (
						<div
							key={workspace.id}
							className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_100px_140px] gap-4 border-foreground/[0.06] border-b px-4 py-3 text-sm last:border-0"
						>
							<span className="truncate font-medium text-foreground">
								{workspace.name}
							</span>
							<span className="truncate text-muted-foreground">
								{businessTypeLabel(workspace.businessType)}
							</span>
							<span className="text-muted-foreground">
								{workspace.modules.length}
							</span>
							<span className="text-muted-foreground">
								{createdDate(workspace.createdAt)}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
