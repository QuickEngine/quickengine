"use client";

import {
	ArrowSquareOut,
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
import Link from "next/link";
import { useState } from "react";
import { getBusinessType } from "../_lib/workspace-catalog";

type View = "cards" | "table";
type StatusFilter = "active" | "archived" | "all";

export type WorkspaceSummary = {
	id: string;
	name: string;
	slug: string | null;
	businessType: string;
	modules: string[];
	archivedAt: string | null;
	createdAt: string;
};

function businessTypeLabel(id: string): string {
	return getBusinessType(id)?.name ?? id;
}

function createdDate(value: string): string {
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(new Date(value));
}

export function WorkspacesToolbar({
	workspaces,
}: {
	workspaces: WorkspaceSummary[];
}) {
	const [query, setQuery] = useState("");
	const [view, setView] = useState<View>("cards");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
	const normalizedQuery = query.trim().toLowerCase();
	const visibleWorkspaces = workspaces.filter((workspace) => {
		if (statusFilter === "active" && workspace.archivedAt) {
			return false;
		}
		if (statusFilter === "archived" && !workspace.archivedAt) {
			return false;
		}
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
						<p className="font-medium text-foreground text-sm">Status</p>
						<div className="mt-2 grid gap-1">
							{(["active", "archived", "all"] as const).map((status) => (
								<button
									key={status}
									type="button"
									onClick={() => setStatusFilter(status)}
									className={`rounded-md px-2 py-1.5 text-left text-sm capitalize ${statusFilter === status ? "bg-foreground/[0.08]" : "hover:bg-foreground/[0.04]"}`}
								>
									{status}
								</button>
							))}
						</div>
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

				<Button asChild className="font-normal">
					<Link href="/workspaces/new">New Workspace</Link>
				</Button>
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
					{normalizedQuery
						? `No workspaces match “${query.trim()}”`
						: `No ${statusFilter} workspaces`}
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
										{workspace.slug ? (
											<Link
												href={`/workspaces/${workspace.slug}`}
												className="hover:underline"
											>
												{workspace.name}
											</Link>
										) : (
											workspace.name
										)}
									</h2>
									<p className="mt-1 text-muted-foreground text-sm">
										{businessTypeLabel(workspace.businessType)}
									</p>
								</div>
								<span className="shrink-0 rounded-full border border-foreground/10 px-2 py-0.5 text-[11px] text-muted-foreground">
									{workspace.archivedAt ? "Archived" : "Active"}
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

							{workspace.slug ? (
								<Button
									asChild
									variant="outline"
									className="mt-5 w-full font-normal"
								>
									<Link href={`/workspaces/${workspace.slug}`}>
										Manage workspace
									</Link>
								</Button>
							) : (
								<Button
									disabled
									variant="outline"
									className="mt-5 w-full font-normal"
								>
									<ArrowSquareOut className="size-4" />
									Workspace unavailable
								</Button>
							)}
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
								{workspace.slug ? (
									<Link
										href={`/workspaces/${workspace.slug}`}
										className="hover:underline"
									>
										{workspace.name}
									</Link>
								) : (
									workspace.name
								)}
							</span>
							<span className="truncate text-muted-foreground">
								{businessTypeLabel(workspace.businessType)}
								{workspace.archivedAt ? " · Archived" : ""}
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
