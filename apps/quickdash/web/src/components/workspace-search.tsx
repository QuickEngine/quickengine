import {
	AddressBookIcon,
	ArrowsClockwiseIcon,
	ArticleIcon,
	CalendarBlankIcon,
	ClockIcon,
	CreditCardIcon,
	FilesIcon,
	FileTextIcon,
	GearSixIcon,
	HouseIcon,
	ImagesIcon,
	InvoiceIcon,
	PackageIcon,
	PenNibIcon,
	PercentIcon,
	PlugsIcon,
	ShoppingCartIcon,
	StarIcon,
	StorefrontIcon,
	TruckIcon,
} from "@phosphor-icons/react";
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
import { settingsGroups } from "./settings/settings-nav";

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

/**
 * ⚠️ A fixed 32px row, the same height as a settings sidebar entry.
 *
 * `min-h-8` let a two-line description grow the row, so a list of modules was
 * twice the height of the same list anywhere else in the console and read as a
 * different product. Nothing here wraps; anything too long elides.
 */
const item =
	"rounded-lg h-8 px-2 py-0 gap-2.5 text-[12px] text-[var(--ink-55)] data-[selected=true]:bg-[rgb(var(--console-ink)/0.07)] data-[selected=true]:text-[var(--ink-90)]";

/** The kinds a search can return, in the order they are shown. */
const KINDS = [
	{ id: "customer", label: "Customers", Icon: AddressBookIcon },
	{ id: "order", label: "Orders", Icon: ShoppingCartIcon },
	{ id: "product", label: "Products", Icon: StorefrontIcon },
	{ id: "invoice", label: "Invoices", Icon: InvoiceIcon },
	{ id: "quote", label: "Quotes", Icon: PackageIcon },
	{ id: "payment", label: "Payments", Icon: CreditCardIcon },
	{ id: "shipment", label: "Shipments", Icon: TruckIcon },
	{ id: "booking", label: "Bookings", Icon: CalendarBlankIcon },
	{ id: "contract", label: "Contracts", Icon: PenNibIcon },
	{ id: "supplier", label: "Suppliers", Icon: PackageIcon },
	{ id: "purchase-order", label: "Purchase orders", Icon: PackageIcon },
	{ id: "project", label: "Projects", Icon: FileTextIcon },
	{ id: "task", label: "Tasks", Icon: FileTextIcon },
	{ id: "time", label: "Time", Icon: ClockIcon },
	{ id: "discount", label: "Discounts", Icon: PercentIcon },
	{ id: "category", label: "Categories", Icon: StorefrontIcon },
	{ id: "review", label: "Reviews", Icon: StarIcon },
	{ id: "plan", label: "Plans", Icon: ArrowsClockwiseIcon },
	{ id: "zone", label: "Shipping zones", Icon: TruckIcon },
	{ id: "rate", label: "Shipping rates", Icon: TruckIcon },
	{ id: "file", label: "Files", Icon: FilesIcon },
	{ id: "content", label: "Content", Icon: ArticleIcon },
] as const;

export function WorkspaceSearch({
	open,
	onOpenChange,
	workspaceId,
	workspace,
	modules,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The resolved id, for the query. */
	workspaceId: string;
	/** The URL slug, for building the destination a result opens. */
	workspace: string;
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
			/* 🔑 The same surface as the settings dialog: one flat `--console-pop` with a
			   single hairline, no inner panel and no second background behind the
			   input. Two tones inside one small dialog read as a box in a box. */
			contentStyle={{ boxShadow: "var(--lift-pop)" }}
			className="top-[18%] translate-y-0 gap-0 rounded-xl border-0 bg-[var(--console-pop)] p-0 text-[var(--ink-90)] sm:max-w-xl [&_[data-slot=command-input-wrapper]]:h-11 [&_[data-slot=command-input-wrapper]]:border-[var(--console-line-soft)] [&_[data-slot=command-input-wrapper]]:px-3 [&_[data-slot=command]]:bg-transparent"
		>
			<CommandInput
				value={query}
				onValueChange={setQuery}
				placeholder="Search this workspace..."
				className="text-[12px] text-[var(--ink-90)] placeholder:text-[var(--ink-25)]"
			/>
			<CommandList className="max-h-[20rem] p-1.5">
				{/*
				 * ⚠️ CENTRED, and it says what it searched for.
				 *
				 * `cmdk` left-aligns this by default, so "Nothing found" sat against
				 * the edge under a wall of empty panel and read as a broken layout
				 * rather than an answer. Echoing the term also makes an obvious
				 * typo obvious.
				 */}
				<CommandEmpty className="px-4 py-10 text-center text-[12px] text-[var(--ink-40)]">
					{query.trim() ? (
						<>
							Nothing matches{" "}
							<span className="text-[var(--ink-70)]">“{query.trim()}”</span>
							<span className="mt-1 block text-[11px] text-[var(--ink-25)]">
								Records, pages and settings are all searched.
							</span>
						</>
					) : (
						"Search records, pages and settings"
					)}
				</CommandEmpty>

				{/* 🔑 Places first, then modules, then records. Somebody typing
				    "orders" almost always wants the PAGE, not a record whose name
				    happens to contain the word — so what you navigate to sits above
				    what you found. */}
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
						<p className="min-w-0 flex-1 truncate text-[12px]">Home</p>
					</CommandItem>
					<CommandItem
						value="Connect developers API keys webhooks"
						onSelect={() => {
							close();
							void navigate({ to: `/${workspace}/connect` });
						}}
						className={item}
					>
						<PlugsIcon size={15} className="text-[var(--ink-35)]" />
						<p className="min-w-0 flex-1 truncate text-[12px]">Developers</p>
					</CommandItem>
					<CommandItem
						value="Media images files uploads"
						onSelect={() => {
							close();
							void navigate({ to: `/${workspace}/media` });
						}}
						className={item}
					>
						<ImagesIcon size={15} className="text-[var(--ink-35)]" />
						<p className="min-w-0 flex-1 truncate text-[12px]">Media</p>
					</CommandItem>
					<CommandItem
						value="Activity audit log history"
						onSelect={() => {
							close();
							void navigate({ to: `/${workspace}/audit` });
						}}
						className={item}
					>
						<ClockIcon size={15} className="text-[var(--ink-35)]" />
						<p className="min-w-0 flex-1 truncate text-[12px]">Activity</p>
					</CommandItem>
				</CommandGroup>

				{/*
				 * 🔴 Every settings section, reachable from the console's ONE search.
				 *
				 * The settings rail used to carry a search box of its own, which meant
				 * "tax" was only findable by somebody who already knew it lived in
				 * settings and had gone there to look. The placeholder on this box has
				 * always claimed it searched settings; now it does.
				 *
				 * ⚠️ Matched on label, blurb AND keywords, the same three fields the
				 * rail matched on, so "dark" still finds Appearance and "tax" still
				 * finds Orders even though neither says the word in its title.
				 */}
				<CommandGroup heading="Settings" className={groupHeading}>
					{settingsGroups(modules).flatMap(({ group, items }) =>
						items.map((section) => (
							<CommandItem
								key={section.id}
								value={`settings ${group} ${section.label} ${section.blurb} ${section.keywords ?? ""}`}
								onSelect={() => {
									close();
									void navigate({
										to: "/$workspace/settings/$section",
										params: { workspace, section: section.id },
									});
								}}
								className={item}
							>
								<GearSixIcon size={15} className="text-[var(--ink-35)]" />
								<p className="min-w-0 flex-1 truncate text-[12px]">
									{section.label}
								</p>
								{/* The group, so "General" in Workspace is not confused with
								    a module's own general section. */}
								<span className="shrink-0 text-[10.5px] text-[var(--ink-25)]">
									{group}
								</span>
							</CommandItem>
						)),
					)}
				</CommandGroup>

				<CommandGroup heading="Modules" className={groupHeading}>
					{modules.map((module) => (
						<CommandItem
							key={module.id}
							value={`${module.name} ${module.description}`}
							onSelect={() => {
								close();
								void navigate({ to: `/${workspace}/${module.id}` });
							}}
							className={item}
						>
							<ModuleIcon
								id={module.id}
								className="size-[15px] text-[var(--ink-35)]"
							/>
							<p className="min-w-0 flex-1 truncate text-[12px]">
								{module.name}
							</p>
							{/* ⚠️ No blurb on the row. A module's description is a whole
							    sentence, and a sentence beside a name turns a two-word
							    choice into something you have to read. It stays in the
							    `value` above, so typing a word from it still matches. */}
						</CommandItem>
					))}
				</CommandGroup>

				{/*
				 * 🔑 Grouped BY KIND. Twenty results in one undifferentiated list
				 * makes you read every line; "Customers" then "Orders" lets you skip
				 * to the half you meant.
				 */}
				{KINDS.filter((kind) =>
					hits.some((hit) => (hit.kind ?? "product") === kind.id),
				).map((kind) => (
					<CommandGroup
						key={kind.id}
						heading={kind.label}
						className={groupHeading}
					>
						{hits
							.filter((hit) => (hit.kind ?? "product") === kind.id)
							.map((hit) => (
								<CommandItem
									key={hit.objectID}
									value={`${kind.id} ${hit.title} ${hit.description ?? ""}`}
									onSelect={() => {
										close();
										/**
										 * 🔑 Opens the RECORD, not the page it lives on.
										 *
										 * `?record=` is read by `useSelectedRecord`, which every
										 * list view uses for its detail panel — so finding
										 * NEO-0047 shows you that order rather than a list of
										 * forty-seven to hunt through.
										 *
										 * ⚠️ `url` is a module path, not a route. It is joined to
										 * the workspace here because the API has no idea what
										 * this console's addresses look like.
										 */
										if (hit.url)
											void navigate({
												to: `/${workspace}/${hit.url}`,
												search: { record: hit.objectID } as never,
											});
									}}
									className={item}
								>
									<kind.Icon
										size={14}
										className="shrink-0 text-[var(--ink-35)]"
									/>
									<p className="min-w-0 flex-1 truncate text-[12px]">
										{hit.title}
									</p>
									{hit.description ? (
										<span className="max-w-[45%] shrink-0 truncate text-[10.5px] text-[var(--ink-30)]">
											{hit.description}
										</span>
									) : null}
								</CommandItem>
							))}
					</CommandGroup>
				))}
			</CommandList>

			<div className="flex h-8 items-center justify-between px-3 text-[9.5px] text-[var(--ink-25)]">
				<span>Navigate with ↑ ↓</span>
				<span>Open with ↵</span>
			</div>
		</CommandDialog>
	);
}
