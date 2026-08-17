import {
	BellIcon,
	BookOpenIcon,
	CaretDoubleLeftIcon,
	CaretDownIcon,
	CaretUpDownIcon,
	ChatCircleIcon,
	CheckIcon,
	ClockCounterClockwiseIcon,
	GaugeIcon,
	GearSixIcon,
	HeadsetIcon,
	ListIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	SignOutIcon,
} from "@phosphor-icons/react";
import { type MouseEventHandler, type ReactNode, useState } from "react";
import { InitialsAvatar } from "./initials-avatar";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "./ui/popover";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";

/**
 * How the shell renders a link to somewhere inside the SAME application.
 *
 * 🔴 A plain `<a>` here is a full document navigation: the SPA unmounts, the
 * bundle re-executes and the sidebar visibly reloads on every click, which reads
 * as the shell not being part of the layout at all. Account passes its router's
 * `Link` so those stay client-side.
 *
 * The default is still an anchor, because the same menu is rendered by QuickDash,
 * where these targets live on a different origin and MUST be a real navigation.
 */
export type ConsoleLinkProps = {
	href: string;
	className?: string;
	children: ReactNode;
};
export type ConsoleLink = (props: ConsoleLinkProps) => ReactNode;

const AnchorLink: ConsoleLink = ({ href, className, children }) => (
	<a href={href} className={className}>
		{children}
	</a>
);

/**
 * The sandbox strip: this workspace is not real money.
 *
 * 🔴 **Never dismissible.** A test-mode marker you can hide is one you will
 * forget, and forgetting is the exact failure it exists to prevent — a real card
 * charged in a sandbox, or a test card taken against the live business.
 *
 * It spans the whole window rather than the content area, because the sidebar is
 * part of what is sandboxed: the records in it are not real either.
 */
export function SandboxBanner({ action }: { action?: ReactNode }) {
	return (
		<div className="flex h-9 shrink-0 items-center justify-center gap-3 bg-[var(--console-banner)] px-4 text-[var(--console-banner-ink)]">
			{/* A dot rather than a colour field: the marker is unmistakable up close
			    and the band stays quiet from across the room. */}
			<span
				aria-hidden="true"
				className="size-1.5 shrink-0 rounded-full bg-[#f5b44a]"
			/>
			<p className="truncate text-[11.5px]">
				Sandbox mode — nothing here is real. Payments are not charged and
				records do not belong to your live business.
			</p>
			{action}
		</div>
	);
}

/** A small always-visible qualifier on the current context, e.g. `TEST`.
 *
 * Deliberately absent in the normal case. An indicator shown for both states is
 * read as decoration and stops being read at all, which is the one thing a
 * test-mode marker may never become. */
export function SidebarBadge({ label }: { label: string }) {
	return (
		<span className="shrink-0 rounded-[3px] bg-[#f5a623]/[0.14] px-1.5 py-0.5 font-medium text-[9px] text-[#f5b44a] uppercase tracking-[0.09em]">
			{label}
		</span>
	);
}

export function SidebarName({
	name,
	badge,
	currentId,
	items,
	onSelect,
	onSearch,
	onNotifications,
	notificationCount = 0,
	notificationsActive = false,
	searchLabel,
	createLabel,
	createHref,
	link: Link = AnchorLink,
}: {
	name: string;
	/** Qualifier beside the name, e.g. the workspace's `test` environment. */
	badge?: string | null;
	currentId: string;
	items: Array<{
		id: string;
		name: string;
		/** Owning context, shown when two items could share a name. */
		secondary?: string | null;
		badge?: string | null;
	}>;
	onSelect: (id: string) => void;
	onSearch?: () => void;
	onNotifications?: () => void;
	notificationCount?: number;
	notificationsActive?: boolean;
	searchLabel: string;
	createLabel: string;
	createHref: string;
	link?: ConsoleLink;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const visibleItems = items.filter((item) =>
		item.name.toLowerCase().includes(query.trim().toLowerCase()),
	);

	return (
		<div className="h-full min-w-0">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverAnchor asChild>
					<div className="flex h-full min-w-0 items-center gap-0.5 px-2.5">
						<PopoverTrigger className="group flex h-full min-w-0 flex-1 items-center text-left outline-none">
							<span className="flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-md bg-transparent px-2.5 transition-colors group-hover:bg-[rgb(var(--console-ink)/0.06)] group-focus-visible:bg-[rgb(var(--console-ink)/0.06)] group-data-[state=open]:bg-[rgb(var(--console-ink)/0.06)]">
								<span className="truncate text-[15px] text-[var(--ink-90)]">
									{name}
								</span>
								{badge ? <SidebarBadge label={badge} /> : null}
								<CaretDownIcon
									size={15}
									className="shrink-0 text-[var(--ink-30)] transition-colors group-hover:text-[var(--ink-60)]"
								/>
							</span>
						</PopoverTrigger>
						<button
							type="button"
							aria-label="Search"
							onClick={onSearch}
							className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--ink-30)] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-70)]"
						>
							<MagnifyingGlassIcon size={15} />
						</button>
						<button
							type="button"
							aria-label={`Notifications${notificationCount > 0 ? " (new)" : ""}`}
							onClick={onNotifications}
							className={`flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-70)] ${notificationsActive ? "bg-[rgb(var(--console-ink)/0.06)] text-[var(--ink-70)]" : "text-[var(--ink-30)]"}`}
						>
							<span className="relative inline-flex">
								<BellIcon size={15} />
								{notificationCount > 0 ? (
									<span
										aria-hidden="true"
										className="-right-1.5 -top-1.5 absolute size-2 rounded-full bg-[#ff3b3b] shadow-[0_0_0_1px_var(--console-panel)]"
									/>
								) : null}
							</span>
						</button>
					</div>
				</PopoverAnchor>
				<PopoverContent
					side="bottom"
					align="center"
					sideOffset={-6}
					aria-label="Switch context"
					className="w-56 border-[var(--console-line)] bg-[var(--console-pop)] p-1.5 shadow-2xl"
				>
					<div className="flex h-8 items-center gap-2 border-[var(--console-line-soft)] border-b px-2 text-[var(--ink-35)] focus-within:text-[var(--ink-60)]">
						<MagnifyingGlassIcon size={13} className="shrink-0" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={searchLabel}
							className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--ink-80)] outline-none placeholder:text-[var(--ink-25)]"
						/>
					</div>
					<div className="flex max-h-56 flex-col overflow-y-auto py-1">
						{visibleItems.length > 0 ? (
							visibleItems.map((item) => (
								<button
									key={item.id}
									type="button"
									onClick={() => {
										onSelect(item.id);
										setOpen(false);
									}}
									className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[var(--ink-55)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.055)] focus-visible:text-[var(--ink-90)]"
								>
									<InitialsAvatar
										label={item.name}
										className="size-7 shrink-0 text-[10px]!"
									/>
									<span className="min-w-0 flex-1">
										<span className="flex min-w-0 items-center gap-1.5">
											<span className="min-w-0 truncate text-[12px]">
												{item.name}
											</span>
											{item.badge ? <SidebarBadge label={item.badge} /> : null}
										</span>
										{item.secondary ? (
											<span className="mt-px block truncate text-[10px] text-[var(--ink-30)]">
												{item.secondary}
											</span>
										) : null}
									</span>
									{item.id === currentId ? (
										<CheckIcon
											size={13}
											className="shrink-0 text-[var(--ink-45)]"
										/>
									) : null}
								</button>
							))
						) : (
							<p className="px-2 py-5 text-center text-[11px] text-[var(--ink-30)]">
								Nothing found
							</p>
						)}
					</div>
					<div className="border-[var(--console-line-soft)] border-t pt-1">
						<Link
							href={createHref}
							className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[11.5px] text-[var(--ink-40)] transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-85)]"
						>
							<PlusIcon size={13} />
							<span>{createLabel}</span>
						</Link>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}

export function SidebarSwitcher({
	kind,
	name,
}: {
	kind: "organization" | "workspace";
	name: string;
}) {
	const label = kind === "organization" ? "Organization" : "Workspace";

	return (
		<Popover>
			<PopoverTrigger className="group flex h-full w-full min-w-0 items-center gap-2.5 px-3 text-left outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] focus-visible:bg-[rgb(var(--console-ink)/0.055)]">
				<InitialsAvatar
					label={name || label}
					className="size-7 shrink-0 text-[10px]!"
				/>
				<div className="min-w-0 flex-1">
					<p className="truncate text-[12px] text-[var(--ink-90)]">
						{name || `Select ${label.toLowerCase()}`}
					</p>
					<p className="mt-px truncate text-[10px] text-[var(--ink-35)]">
						{label}
					</p>
				</div>
				<CaretUpDownIcon
					size={17}
					className="shrink-0 text-[var(--ink-25)] transition-colors group-hover:text-[var(--ink-50)]"
				/>
			</PopoverTrigger>
			<PopoverContent
				side="right"
				align="start"
				sideOffset={8}
				aria-label={`${label} switcher`}
				className="h-16 w-[13.75rem] border-[var(--console-line)] bg-[var(--console-pop)] p-0 shadow-2xl"
			/>
		</Popover>
	);
}

export function SidebarAccount({
	name,
	planId,
	accountUrl,
	authUrl,
	webUrl = "",
	onFeedback,
	onHelp,
	onSignOut,
	link: Link = AnchorLink,
	settingsHref,
	settingsLink,
}: {
	name: string;
	planId: string | null;
	accountUrl: string;
	authUrl: string;
	webUrl?: string;
	onFeedback?: () => void;
	/**
	 * Summons help in place, rather than navigating to it.
	 *
	 * 🔑 Needing help happens in the middle of something. A console that can
	 * open help WITHOUT abandoning the page passes this; one that cannot (the
	 * account app) leaves it out and the row stays an ordinary link.
	 */
	onHelp?: () => void;
	onSignOut?: MouseEventHandler<HTMLAnchorElement>;
	link?: ConsoleLink;
	/**
	 * Where "Settings" goes, when it is not the account's own.
	 *
	 * 🔑 Contextual on purpose. In Account this row means account settings; in
	 * QuickDash the thing you are settling INTO is the workspace, so it means
	 * workspace settings. One row that always means "settings for where I am"
	 * beats two rows competing to be the settings row.
	 */
	settingsHref?: string;
	/** Rendered for that row alone — the other entries stay cross-origin. */
	settingsLink?: ConsoleLink;
}) {
	const SettingsLink = settingsLink ?? Link;
	const [open, setOpen] = useState(false);
	const plan = `${(planId || "free").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} Plan`;
	const accountHref = (path: string) => `${accountUrl}${path}`;
	const signOutHref = `${authUrl}/signout?redirect=${encodeURIComponent(`${authUrl}/signin?signedout=1`)}`;
	const MenuHeading = ({ children }: { children: string }) => (
		<p className="px-2 pt-2 pb-0.5 text-[8.5px] text-[var(--ink-20)] uppercase tracking-[0.14em]">
			{children}
		</p>
	);

	const menuRow =
		"flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[12px] text-[var(--ink-50)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.055)] focus-visible:text-[var(--ink-90)]";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger className="group flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] focus-visible:bg-[rgb(var(--console-ink)/0.055)]">
				<InitialsAvatar
					label={name || "Account"}
					className="size-7 shrink-0 text-[10px]!"
				/>
				<div className="min-w-0 flex-1">
					<p className="truncate text-[12px] text-[var(--ink-90)]">
						{name || "Account"}
					</p>
					<p className="mt-px truncate text-[10px] text-[var(--ink-35)]">
						{plan}
					</p>
				</div>
				<CaretUpDownIcon
					size={14}
					className="shrink-0 text-[var(--ink-25)] transition-colors group-hover:text-[var(--ink-50)]"
				/>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align="center"
				sideOffset={8}
				aria-label="Account menu"
				className="flex w-56 flex-col gap-1 border-[var(--console-line)] bg-[var(--console-pop)] p-1.5 shadow-2xl"
			>
				<Link
					href={accountHref("/settings/profile")}
					className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-[var(--ink-85)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] focus-visible:bg-[rgb(var(--console-ink)/0.055)]"
				>
					<InitialsAvatar
						label={name || "Account"}
						className="size-7 shrink-0 text-[10px]!"
					/>
					<span className="min-w-0 truncate text-[12px]">
						{name || "Account"}
					</span>
				</Link>
				<div className="border-[var(--console-line-soft)] border-t" />

				{/* 🔑 Grouped so LEAVING is a decision rather than a surprise.
				    Everything above the "Your account" heading stays where you are;
				    everything below changes surface. Somebody deep in a workspace
				    should never be thrown to another app by a menu row that looked
				    identical to the one above it. */}
				<SettingsLink
					href={settingsHref ?? accountHref("/settings/security")}
					className={menuRow}
				>
					<GearSixIcon size={14} />
					<span>Settings</span>
				</SettingsLink>
				<button
					type="button"
					onClick={() => {
						setOpen(false);
						onFeedback?.();
					}}
					className={menuRow}
				>
					<ChatCircleIcon size={14} />
					<span>Feedback</span>
				</button>

				<MenuHeading>Your account</MenuHeading>
				<Link href={accountHref("/usage")} className={menuRow}>
					<GaugeIcon size={14} />
					<span>Usage</span>
				</Link>
				{onHelp ? (
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							onHelp();
						}}
						className={menuRow}
					>
						<HeadsetIcon size={14} />
						<span>Help & Support</span>
					</button>
				) : (
					<Link href={accountHref("/support")} className={menuRow}>
						<HeadsetIcon size={14} />
						<span>Help & Support</span>
					</Link>
				)}
				<a href={`${webUrl}/docs`} className={menuRow}>
					<BookOpenIcon size={14} />
					<span>Docs</span>
				</a>
				<a href={`${webUrl}/changelog`} className={menuRow}>
					<ClockCounterClockwiseIcon size={14} />
					<span>Changelog</span>
				</a>
				<a href={signOutHref} onClick={onSignOut} className={menuRow}>
					<SignOutIcon size={14} />
					<span>Sign out</span>
				</a>
				<Link
					href={accountHref("/billing")}
					className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-[rgb(var(--console-ink))] px-2 text-[11.5px] text-[var(--console-pop)] transition-colors hover:bg-[rgb(var(--console-ink)/0.85)]"
				>
					<span>Upgrade</span>
				</Link>
			</PopoverContent>
		</Popover>
	);
}

/** Shared authenticated frame. Account and QuickDash supply different sidebar
 * contents while retaining identical geometry and responsive behaviour. */
export function ConsoleShell({
	switcher,
	account,
	navTop,
	nav,
	navBottom,
	overlays,
	banner,
	header,
	children,
}: {
	switcher: ReactNode;
	account?: ReactNode;
	navTop?: ReactNode;
	nav?: ReactNode;
	navBottom?: ReactNode;
	overlays?: ReactNode;
	/**
	 * A strip across the very top of the window, above the sidebar as well as the
	 * content.
	 *
	 * 🔑 It PUSHES rather than overlays: the frame below becomes the remaining
	 * height, so nothing is covered and nothing is squashed. A banner floating
	 * over the console would hide the first row of whatever is under it, which on
	 * a work queue is the most important row.
	 */
	banner?: ReactNode;
	/**
	 * The bar across the top of the CONTENT, beside the sidebar rather than above
	 * it.
	 *
	 * 🔑 Aligned with the workspace switcher, so the two read as one line across
	 * the window. Spanning the whole width instead would put page actions above
	 * the workspace name, which inverts what belongs to what: the sidebar says
	 * WHERE you are, the header says what you can do HERE.
	 *
	 * ⚠️ Outside the scroll container, so it stays put. The actions in it are the
	 * ones somebody reaches for repeatedly, and a header that scrolls away is a
	 * header they have to scroll back for.
	 *
	 * Deliberately borderless — it sits ON the content rather than above it.
	 */
	header?: ReactNode;
	children: ReactNode;
}) {
	const [menuOpen, setMenuOpen] = useState(false);

	const sidebar = (
		<>
			{switcher ? <div className="h-16 shrink-0">{switcher}</div> : null}
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{navTop}
				{nav}
				{navBottom ? (
					<div className="mt-auto shrink-0 px-2 pb-3">{navBottom}</div>
				) : null}
			</div>
			{account ? (
				<div className="shrink-0 border-[var(--console-line-soft)] border-t">
					{account}
				</div>
			) : null}
		</>
	);

	// 🔴 `overscroll-none` on the frame and `overscroll-contain` on the scroller
	// below. Without them the console's own scroll chains up to the document and
	// the whole shell rubber-bands, showing the page behind it — the app looks
	// like it is peeling off the window.
	const frame = (
		<div
			className={`relative flex min-h-0 overflow-hidden overscroll-none bg-[var(--console-bg)] text-[var(--ink-90)] ${
				// With a banner the console sits INSIDE the window rather than being
				// the window, so its top corners round and the banner shows through
				// behind them.
				banner ? "flex-1 rounded-t-2xl" : "h-svh"
			}`}
		>
			<aside
				className={`hidden w-60 shrink-0 flex-col border-[var(--console-line)] border-r bg-[var(--console-panel)] md:flex ${banner ? "rounded-tl-2xl" : ""}`}
			>
				{sidebar}
			</aside>

			<button
				type="button"
				aria-label="Open navigation"
				onClick={() => setMenuOpen(true)}
				className="absolute top-3 left-3 z-30 flex size-9 items-center justify-center border border-[rgb(var(--console-ink)/0.10)] bg-[var(--console-bg)] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] md:hidden"
			>
				<ListIcon size={18} />
			</button>

			<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
				<SheetContent
					side="left"
					className="w-60 gap-0 border-[var(--console-line)] bg-[var(--console-panel)] p-0 text-[var(--ink-90)] [&>button]:hidden"
				>
					<SheetTitle className="sr-only">Application navigation</SheetTitle>
					<button
						type="button"
						aria-label="Close navigation"
						onClick={() => setMenuOpen(false)}
						className="absolute top-4 right-2 z-10 flex size-8 items-center justify-center text-[var(--ink-40)] transition-colors hover:text-[var(--ink-90)]"
					>
						<CaretDoubleLeftIcon size={15} />
					</button>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: native child controls emit the click that closes the drawer. */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation of those native controls also emits click. */}
					<div
						onClick={() => setMenuOpen(false)}
						className="flex min-h-0 flex-1 flex-col"
					>
						{sidebar}
					</div>
				</SheetContent>
			</Sheet>

			<main className="min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--console-bg)]">
				{header ? (
					/**
					 * Sticky inside the scroll container, so it stays put while a long
					 * list moves under it.
					 */
					<div className="sticky top-0 z-20 flex h-16 shrink-0 items-center bg-[var(--console-bg)] px-5">
						{header}
					</div>
				) : null}
				{children}
			</main>

			{overlays}
		</div>
	);

	if (!banner) return frame;

	return (
		<div className="flex h-svh min-h-0 flex-col overflow-hidden bg-[var(--console-banner)]">
			{banner}
			{frame}
		</div>
	);
}
