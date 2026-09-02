import { HouseIcon, PlugsIcon } from "@phosphor-icons/react";
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
import { workspaceApi } from "../lib/api";
import type { QuickDashModule, QuickDashSearchHit } from "../lib/quickdash-api";
import { ModuleIcon } from "./module-icon";

/**
 * Search, scoped to one workspace.
 *
 * 🔴 Workspace-scoped on the SERVER, not by filtering here: `workspaceApi`
 * carries the workspace header and `/quickdash/search` only ever returns that
 * workspace's records. A client-side filter over a wider result set would be one
 * bug away from showing another business's customers.
 *
 * Records are debounced and fetched; modules come from the workspace's enabled
 * set, so what you can search is exactly what this business has turned on.
 */

const groupHeading =
	"text-[var(--ink-90)] [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-[var(--ink-25)]";

const item =
	"rounded-lg min-h-8 py-1 text-[12px] text-[var(--ink-55)] data-[selected=true]:bg-[rgb(var(--console-ink)/0.07)] data-[selected=true]:text-[var(--ink-90)]";

export function WorkspaceSearch({
	open,
	onOpenChange,
	workspaceId,
	modules,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string;
	modules: QuickDashModule[];
}) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<QuickDashSearchHit[]>([]);

	useEffect(() => {
		const openSearch = (event: KeyboardEvent) => {
			/**
			 * 🔴 `event.key` can be UNDEFINED, and calling `.toLowerCase()` on it
			 * throws out of a document-level listener.
			 *
			 * Chrome dispatches `keydown` with no `key` during autofill, so simply
			 * having the browser fill a form on this page threw a TypeError — caught
			 * by Sentry, and unexplainable from the stack because nothing about
			 * autofill looks like a keyboard shortcut.
			 */
			if (typeof event.key !== "string") return;
			if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey))
				return;
			event.preventDefault();
			onOpenChange(!open);
		};
		document.addEventListener("keydown", openSearch);
		return () => document.removeEventListener("keydown", openSearch);
	}, [onOpenChange, open]);

	// 200ms, and cancelled on every keystroke: a request per character would
	// spend the workspace's rate limit on prefixes nobody meant to search for.
	useEffect(() => {
		if (!open) return;
		const trimmed = query.trim();
		if (!trimmed) {
			setHits([]);
			return;
		}
		let cancelled = false;
		const timer = setTimeout(async () => {
			try {
				const response = await workspaceApi(workspaceId).request<{
					items: QuickDashSearchHit[];
				}>(`/quickdash/search?q=${encodeURIComponent(trimmed)}`);
				if (!cancelled) setHits(response.data.items);
			} catch {
				// A failed search shows nothing rather than a stale answer to a
				// different question.
				if (!cancelled) setHits([]);
			}
		}, 200);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [query, open, workspaceId]);

	const close = () => {
		onOpenChange(false);
		setQuery("");
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Search workspace"
			description="Find records and modules in this workspace"
			showCloseButton={false}
			className="top-[18%] translate-y-0 rounded-xl border-[var(--console-line)] bg-[var(--console-pop)] p-1.5 text-[var(--ink-90)] shadow-2xl sm:max-w-2xl [&_[data-slot=command-input-wrapper]]:border-b-0 [&_[data-slot=command-input-wrapper]]:h-9"
		>
			<CommandInput
				value={query}
				onValueChange={setQuery}
				placeholder="Search this workspace..."
				className="text-[12px] text-[var(--ink-90)] placeholder:text-[var(--ink-25)]"
			/>
			<CommandList className="max-h-[18rem] py-0.5">
				<CommandEmpty className="py-8 text-[11.5px] text-[var(--ink-35)]">
					{query.trim() ? "Nothing found" : "Type to search records"}
				</CommandEmpty>

				{hits.length > 0 ? (
					<CommandGroup heading="Records" className={groupHeading}>
						{hits.map((hit) => (
							<CommandItem
								key={hit.objectID}
								value={`${hit.title} ${hit.description ?? ""}`}
								onSelect={() => {
									close();
									if (hit.url) void navigate({ to: hit.url });
								}}
								className={item}
							>
								<p className="min-w-0 flex-1 truncate text-[12.5px]">
									{hit.title}
								</p>
								{hit.description ? (
									<span className="max-w-[55%] shrink-0 truncate text-[10.5px] text-[var(--ink-30)]">
										{hit.description}
									</span>
								) : null}
							</CommandItem>
						))}
					</CommandGroup>
				) : null}

				<CommandGroup heading="Modules" className={groupHeading}>
					{modules.map((module) => (
						<CommandItem
							key={module.id}
							value={`${module.name} ${module.description}`}
							onSelect={() => {
								close();
								void navigate({ to: `/${workspaceId}/${module.id}` });
							}}
							className={item}
						>
							<ModuleIcon
								id={module.id}
								className="size-[15px] text-[var(--ink-35)]"
							/>
							<p className="min-w-0 flex-1 truncate text-[12.5px]">
								{module.name}
							</p>
							<span className="max-w-[55%] shrink-0 truncate text-[10.5px] text-[var(--ink-30)]">
								{module.description}
							</span>
						</CommandItem>
					))}
				</CommandGroup>

				<CommandGroup heading="Workspace" className={groupHeading}>
					<CommandItem
						value="Home overview"
						onSelect={() => {
							close();
							void navigate({ to: `/${workspaceId}` });
						}}
						className={item}
					>
						<HouseIcon size={15} className="text-[var(--ink-35)]" />
						<p className="min-w-0 flex-1 truncate text-[12.5px]">Home</p>
					</CommandItem>
					<CommandItem
						value="Connect developers API keys webhooks"
						onSelect={() => {
							close();
							void navigate({ to: `/${workspaceId}/connect` });
						}}
						className={item}
					>
						<PlugsIcon size={15} className="text-[var(--ink-35)]" />
						<p className="min-w-0 flex-1 truncate text-[12.5px]">Developers</p>
					</CommandItem>
				</CommandGroup>
			</CommandList>
			<div className="flex h-8 items-center justify-between px-3 text-[9.5px] text-[var(--ink-25)]">
				<span>Navigate with ↑ ↓</span>
				<span>Open with ↵</span>
			</div>
		</CommandDialog>
	);
}
