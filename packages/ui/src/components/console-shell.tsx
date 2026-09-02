import {
	BellIcon,
	CaretDoubleLeftIcon,
	CaretDownIcon,
	CaretUpDownIcon,
	ChatCircleIcon,
	DesktopIcon,
	GearSixIcon,
	HeadsetIcon,
	ListIcon,
	MagnifyingGlassIcon,
	MoonIcon,
	PlugsConnectedIcon,
	PlusCircleIcon,
	SignOutIcon,
	SparkleIcon,
	SquaresFourIcon,
	SunIcon,
	TerminalWindowIcon,
} from "@phosphor-icons/react";
import {
	createContext,
	type MouseEventHandler,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { InitialsAvatar } from "./initials-avatar";
import { useTheme } from "./theme-provider";
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
	environment,
	onEnvironment,
	busy = false,
	environmentError,
	compact = false,
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
	/**
	 * The workspace's mode, and how to change it.
	 *
	 * ⚠️ Both or neither. Without the handler the control is not rendered at all,
	 * because a console with one workspace mode (Account has none) would
	 * otherwise show a toggle that reports a state it cannot change.
	 */
	environment?: "live" | "test";
	onEnvironment?: (next: "live" | "test") => void;
	/** True while a switch is in flight, so it cannot be fired twice. */
	busy?: boolean;
	/**
	 * Why the last switch was refused.
	 *
	 * 🔴 Shown HERE, beside the control that was refused. Mode locks once the
	 * workspace has a payment account, an order or a payment — so this is a
	 * normal answer, not an error, and the message is the rule. A quick switch
	 * that silently does nothing is worse than one that is not offered.
	 */
	environmentError?: string | null;
	/**
	 * The header form: sized to its own content rather than filling a rail.
	 *
	 * ⚠️ `w-full` is right at the top of a sidebar, where the trigger IS the row.
	 * In a header the row belongs to three different things, so a switcher that
	 * stretched would push the search out of the centre of the window.
	 */
	compact?: boolean;
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
	// 🔑 The current entry is pulled OUT of the list and shown as the menu's
	// subject, so it never appears twice — once as the header block and again as
	// a row you are already on.
	const current = items.find((item) => item.id === currentId);
	const others = visibleItems.filter((item) => item.id !== currentId);

	return (
		<div className={`h-full min-w-0 ${compact ? "flex flex-1" : ""}`}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverAnchor asChild>
					<div
						className={`flex h-full min-w-0 flex-1 items-center gap-0.5 ${
							compact ? "" : "px-2.5"
						}`}
					>
						<PopoverTrigger
							// `flex-1` in BOTH modes now: in the sidebar it fills the row, and
							// in the header it fills the group that is sized to the rail.
							className="group flex h-full min-w-0 flex-1 items-center text-left outline-none"
						>
							{/* 🔴 `flex-1`, so the switcher fills whatever its group is given
							    and the NAME elides inside it. It cannot set its own width:
							    the group is sized to the SIDEBAR, and a child with a fixed
							    width would either overflow it or leave a gap at the end.
							    ⚠️ `max-w-` was tried first and did nothing — a max-width
							    never binds on a control already sized to its own text, which
							    is why 16, 18, 22 and 26rem all rendered identically. */}
							{/* 🔑 `w-full` with the caret pushed to the far end. With the
							    search and bell buttons beside it the trigger was sized to its
							    text and stopped halfway across the sidebar, which read as an
							    unfinished row rather than a control. Alone in the row it
							    should look like the header button it is. */}
							<span
								style={compact ? {} : undefined}
								className={`flex min-w-0 items-center gap-1.5 rounded-md ${
									compact
										? "h-9 min-w-0 flex-1 border border-[var(--console-line)] bg-[var(--console-panel)] px-3 transition-[box-shadow] duration-150 group-group-active:translate-y-px"
										: "h-9 w-full bg-transparent px-2.5 transition-colors group-hover:bg-[rgb(var(--console-ink)/0.06)] group-focus-visible:bg-[rgb(var(--console-ink)/0.06)] group-data-[state=open]:bg-[rgb(var(--console-ink)/0.06)]"
								}`}
							>
								<span
									className={`min-w-0 truncate text-[var(--ink-90)] ${
										compact ? "text-[12.5px]" : "text-[15px]"
									}`}
								>
									{name}
								</span>
								{badge ? <SidebarBadge label={badge} /> : null}
								<CaretDownIcon
									size={compact ? 14 : 15}
									// `ml-auto` in both modes now: with a real width the caret has
									// to be pushed to the far end, or it sits against the name in
									// the middle of an otherwise empty button.
									className="ml-auto shrink-0 text-[var(--ink-30)] transition-colors group-hover:text-[var(--ink-60)]"
								/>
							</span>
						</PopoverTrigger>
						{onSearch ? (
							<button
								type="button"
								aria-label="Search"
								onClick={onSearch}
								className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--ink-30)] transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-70)]"
							>
								<MagnifyingGlassIcon size={15} />
							</button>
						) : null}
						{onNotifications ? (
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
						) : null}
					</div>
				</PopoverAnchor>
				<PopoverContent
					side="bottom"
					/**
					 * 🔴 `align="start"` with the frame's own 8px as the offset, so the
					 * popover's left edge lands on the SIDEBAR's left edge rather than on
					 * the window's.
					 *
					 * Centred, it hung past the left of the console and touched the edge
					 * of the screen — which on a floating layout reads as a panel that
					 * has escaped the app. Aligned to the trigger's start and pushed back
					 * by the 8px of frame padding, it lines up with the column beneath
					 * it.
					 *
					 * ⚠️ `alignOffset` is NEGATIVE and equals the HEADER's own padding.
					 * The header panel starts at the frame's 8px, and its contents start
					 * a further `px-3` (12px) inside it — so the trigger's left edge sits
					 * at 20px while the sidebar's sits at 8px. Pulling back by that 12px
					 * puts the two on the same line. Changing the header's padding means
					 * changing this.
					 */
					align="start"
					alignOffset={0}
					sideOffset={6}
					collisionPadding={8}
					aria-label="Switch context"
					/**
					 * 🔑 Sized and padded like a CARD rather than a menu strip.
					 *
					 * It was `w-56` with `p-1.5` and 11px type — a slender little box
					 * hanging off a control that is itself a raised card. A popover is
					 * the same object opened up, so it should carry the same weight: the
					 * panel radius, room around its contents, and text at the size the
					 * rest of the console uses.
					 */
					/**
					 * 🔑 The CURRENT thing is a filled block, not a row wearing a tick.
					 *
					 * A list where every entry looks the same and one carries a small
					 * check makes you read all of them to find out where you are. Giving
					 * the current one a surface answers that before anything is read —
					 * and it gives the menu a subject, which is what made the earlier
					 * version feel like a strip of links rather than a card.
					 */
					className="w-[17rem] rounded-xl border-[var(--console-line)] bg-[var(--console-pop)] p-1.5 shadow-2xl"
				>
					{/* 🔑 The quick switch. Moving between rehearsal and real money is
					    the one thing done repeatedly here, and it was otherwise buried
					    in workspace settings behind two navigations. */}
					{environment ? (
						<div className="mb-1 flex items-center gap-1 rounded-lg border border-[var(--console-line)] bg-[var(--console-bg)] p-0.5">
							{(["live", "test"] as const).map((mode) => {
								const on = environment === mode;
								return (
									<button
										key={mode}
										type="button"
										disabled={!onEnvironment || busy}
										onClick={() => {
											if (!onEnvironment) return;
											onEnvironment(mode);
											setOpen(false);
										}}
										style={on ? {} : undefined}
										className={`h-7 flex-1 rounded-md text-[11.5px] transition-colors disabled:cursor-not-allowed ${
											on
												? "border border-[var(--console-line)] bg-[var(--console-panel)] text-[var(--ink-90)]"
												: "text-[var(--ink-40)] enabled:hover:text-[var(--ink-75)] disabled:text-[var(--ink-20)]"
										}`}
									>
										{mode === "live" ? "Live" : "Sandbox"}
									</button>
								);
							})}
						</div>
					) : null}
					{current ? (
						<div className="mb-1 flex items-center gap-2.5 rounded-lg bg-[rgb(var(--console-ink)/0.06)] px-2 py-2">
							<InitialsAvatar
								label={current.name}
								shape="squircle"
								className="size-7 shrink-0 text-[10px]!"
							/>
							<span className="min-w-0 flex-1">
								<span className="flex min-w-0 items-center gap-1.5">
									<span className="min-w-0 truncate font-medium text-[12.5px] text-[var(--ink-90)]">
										{current.name}
									</span>
									{current.badge ? (
										<SidebarBadge label={current.badge} />
									) : null}
								</span>
								{current.secondary ? (
									<span className="mt-px block truncate text-[10.5px] text-[var(--ink-35)]">
										{current.secondary}
									</span>
								) : null}
							</span>
						</div>
					) : null}

					{environmentError ? (
						<p
							role="alert"
							className="mb-1 px-2.5 pb-1 text-[11.5px] text-[#e8b4b4] leading-[1.4]"
						>
							{environmentError}
						</p>
					) : null}

					{/* ⚠️ The search only appears once there are enough entries to need
					    it. A filter above a list of two is furniture. */}
					{items.length > 6 ? (
						<div className="mb-1 flex h-8 items-center gap-2 rounded-lg border border-[var(--console-line)] bg-[var(--console-bg)] px-2 text-[var(--ink-35)] focus-within:text-[var(--ink-60)]">
							<MagnifyingGlassIcon size={13} className="shrink-0" />
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder={searchLabel}
								className="min-w-0 flex-1 bg-transparent text-[11.5px] text-[var(--ink-80)] outline-none placeholder:text-[var(--ink-25)]"
							/>
						</div>
					) : null}

					<div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
						{others.length > 0 ? (
							others.map((item) => (
								<button
									key={item.id}
									type="button"
									onClick={() => {
										onSelect(item.id);
										setOpen(false);
									}}
									className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[var(--ink-55)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.055)] focus-visible:text-[var(--ink-90)]"
								>
									<InitialsAvatar
										label={item.name}
										shape="squircle"
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
											<span className="mt-px block truncate text-[10.5px] text-[var(--ink-30)]">
												{item.secondary}
											</span>
										) : null}
									</span>
								</button>
							))
						) : query ? (
							<p className="px-2 py-4 text-center text-[11.5px] text-[var(--ink-30)]">
								Nothing found
							</p>
						) : null}
					</div>

					<Link
						href={createHref}
						className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[12px] text-[var(--ink-55)] no-underline outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-90)]"
					>
						<PlusCircleIcon size={16} className="shrink-0" />
						{createLabel}
					</Link>
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
				className="h-16 w-[16.5rem] border-[var(--console-line)] bg-[var(--console-pop)] p-0 shadow-2xl"
			/>
		</Popover>
	);
}

/**
 * The bell, as a header control.
 *
 * 🔑 Extracted from `SidebarName` rather than copied. It was welded into the
 * workspace switcher row, so a console that wanted it in its header had two
 * bells or a hand-rolled second one — and the second one is always the one that
 * forgets the unread dot.
 */
export function ConsoleBell({
	count = 0,
	active = false,
	onClick,
}: {
	count?: number;
	active?: boolean;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={`Notifications${count > 0 ? " (new)" : ""}`}
			onClick={onClick}
			style={{}}
			className={`flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--console-line)] bg-[var(--console-panel)] transition-[box-shadow,color] duration-150 hover:text-[var(--ink-90)] active:translate-y-px ${
				active ? "text-[var(--ink-85)]" : "text-[var(--ink-40)]"
			}`}
		>
			<span className="relative inline-flex">
				<BellIcon size={17} />
				{count > 0 ? (
					<span
						aria-hidden="true"
						// ⚠️ Ringed in the surface it sits on, so the dot reads as raised
						// off the bell rather than as part of the glyph.
						className="-right-1.5 -top-1.5 absolute size-2 rounded-full bg-[#ff3b3b] shadow-[0_0_0_1px_var(--console-bg)]"
					/>
				) : null}
			</span>
		</button>
	);
}

/**
 * Light / dark / system, as ONE cycling button.
 *
 * 🔑 A three-segment control is right on a settings page, where the options are
 * being compared. In a header it is three targets to say one thing, and it would
 * dwarf the bell beside it. One button showing the CURRENT state and advancing
 * on click says the same thing in a ninth of the width.
 *
 * ⚠️ Not `ThemeSwitch` from this package. That one is built from the marketing
 * site's classes — `border-edge`, `bg-field`, `text-ink` — none of which exist
 * in the console's token set, so it renders unstyled here.
 *
 * The label names the NEXT state rather than the current one, because that is
 * what pressing it does; a button labelled with its own state reads as a status.
 */
/**
 * The assistant toggle.
 *
 * ⚠️ Shared rather than written in each console, because it is the pair to
 * `ConsoleBell` and the two have to look identical — a second hand-rolled
 * version is how one of them ends up a pixel taller than the other.
 */
export function ConsoleAssistant({
	open = false,
	onClick,
}: {
	open?: boolean;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			aria-label="Assistant"
			aria-pressed={open}
			onClick={onClick}
			style={{}}
			className={`flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--console-line)] bg-[var(--console-panel)] transition-[box-shadow,color] duration-150 active:translate-y-px ${
				open ? "text-[var(--ink-85)]" : "text-[var(--ink-40)]"
			}`}
		>
			<SparkleIcon size={17} weight={open ? "fill" : "regular"} />
		</button>
	);
}

/**
 * QuickTools.
 *
 * 🔑 `SquaresFour` because these are WIDGETS — small independent things laid out
 * together. A toolbox or a wrench would say "settings for the tool"; a grid of
 * squares says "several small things", which is what a widget surface is. It is
 * also the one icon in this header that is not a single object, so it does not
 * compete with the bell or the sparkle beside it.
 *
 * ⚠️ Shared with `ConsoleBell` and `ConsoleAssistant` rather than written per
 * console: three toggles that must look identical is exactly where a hand-rolled
 * fourth ends up a pixel out.
 */
/** What this workspace is plugged into. Shares the assistant's column. */
export function ConsoleIntegrations({
	open,
	onClick,
	/** How many services are connected, so an empty dock says so. */
	count = 0,
}: {
	open: boolean;
	onClick: () => void;
	count?: number;
}) {
	return (
		<button
			type="button"
			aria-label="Integrations"
			aria-pressed={open}
			title="Integrations"
			onClick={onClick}
			className={`relative flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--console-line)] bg-[var(--console-panel)] transition-colors duration-150 hover:text-[var(--ink-90)] active:translate-y-px ${
				open ? "text-[var(--ink-90)]" : "text-[var(--ink-40)]"
			}`}
		>
			<PlugsConnectedIcon size={15} />
			{/* Connected services are marked, none is not — the same rule the shop
			    button follows: badge the exception, never the normal state. */}
			{count > 0 ? (
				<span
					aria-hidden="true"
					className="-right-1 -top-1 absolute size-2 rounded-full bg-[#3fb950] shadow-[0_0_0_2px_var(--console-bg)]"
				/>
			) : null}
		</button>
	);
}

/** The developer console, along the bottom. */
export function ConsoleTerminal({
	open,
	onClick,
}: {
	open: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label="Developer console"
			aria-pressed={open}
			title="Developer console"
			onClick={onClick}
			className={`flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--console-line)] bg-[var(--console-panel)] transition-colors duration-150 hover:text-[var(--ink-90)] active:translate-y-px ${
				open ? "text-[var(--ink-90)]" : "text-[var(--ink-40)]"
			}`}
		>
			<TerminalWindowIcon size={15} />
		</button>
	);
}

export function ConsoleTools({
	open = false,
	onClick,
}: {
	open?: boolean;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			aria-label="QuickTools"
			aria-pressed={open}
			onClick={onClick}
			style={{}}
			className={`flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--console-line)] bg-[var(--console-panel)] transition-[box-shadow,color] duration-150 active:translate-y-px ${
				open ? "text-[var(--ink-85)]" : "text-[var(--ink-40)]"
			}`}
		>
			<SquaresFourIcon size={17} weight={open ? "fill" : "regular"} />
		</button>
	);
}

export function ConsoleTheme() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	// The resolved theme depends on a cookie and `matchMedia`, neither of which
	// exists on the first render pass. Showing the wrong icon for a frame is
	// worse than showing a stable one.
	useEffect(() => setMounted(true), []);
	const current = mounted ? theme : "dark";

	const next =
		current === "light" ? "dark" : current === "dark" ? "system" : "light";
	const Icon =
		current === "light" ? SunIcon : current === "dark" ? MoonIcon : DesktopIcon;

	return (
		<button
			type="button"
			aria-label={`Theme: ${current}. Switch to ${next}.`}
			onClick={() => setTheme(next)}
			style={{}}
			className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--console-line)] bg-[var(--console-panel)] text-[var(--ink-40)] transition-[box-shadow,color] duration-150 hover:text-[var(--ink-90)] active:translate-y-px"
		>
			<Icon size={16} />
		</button>
	);
}

export function SidebarAccount({
	name,
	planId,
	accountUrl,
	authUrl,
	onFeedback,
	onHelp,
	onSignOut,
	link: Link = AnchorLink,
	settingsHref,
	settingsLink,
	onSettings,
	email,
	compact = false,
}: {
	name: string;
	planId: string | null;
	accountUrl: string;
	authUrl: string;
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
	/**
	 * Opens settings in place instead of navigating to it.
	 *
	 * 🔑 Settings is somewhere you go mid-task and come straight back from, so a
	 * console that can show it without leaving the page passes this; one that
	 * cannot leaves it out and the row stays an ordinary link. Same shape as
	 * `onHelp` above, for the same reason.
	 */
	onSettings?: () => void;
	/** Rendered for that row alone — the other entries stay cross-origin. */
	settingsLink?: ConsoleLink;
	/** Shown under the name, where the plan otherwise goes. */
	email?: string;
	/**
	 * The header form: avatar only, opening downwards from the right.
	 *
	 * 🔑 The full row exists to fill the width at the foot of a sidebar, where a
	 * name and a plan have somewhere to sit. In a header there is no width to
	 * fill — the avatar IS the control, the way it is in every other console —
	 * and the name and plan move into the menu it opens, which already shows
	 * both.
	 */
	compact?: boolean;
}) {
	const SettingsLink = settingsLink ?? Link;
	const [open, setOpen] = useState(false);
	const plan = `${(planId || "free").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())} Plan`;
	const accountHref = (path: string) => `${accountUrl}${path}`;
	const signOutHref = `${authUrl}/signout?redirect=${encodeURIComponent(`${authUrl}/signin?signedout=1`)}`;

	const menuRow =
		"flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[12px] text-[var(--ink-55)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.055)] focus-visible:text-[var(--ink-90)]";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				aria-label="Account menu"
				style={compact ? {} : undefined}
				className={
					compact
						? "group flex h-9 shrink-0 items-center gap-2 rounded-md border border-[var(--console-line)] bg-[var(--console-panel)] pr-3 pl-1.5 outline-none transition-[box-shadow] duration-150 active:translate-y-px"
						: "group flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] focus-visible:bg-[rgb(var(--console-ink)/0.055)]"
				}
			>
				<InitialsAvatar
					label={name || "Account"}
					shape={compact ? "squircle" : "circle"}
					className={
						compact
							? "size-7 shrink-0 text-[10px]!"
							: "size-7 shrink-0 text-[10px]!"
					}
				/>
				{/* 🔑 The NAME, not just the mark. An avatar alone is a puzzle on a
				    product somebody may share a machine for — it says "an account",
				    not "your account". ⚠️ Capped and truncated: a long name must not
				    be allowed to push the search out of the centre of the window. */}
				{compact ? (
					<span className="max-w-[8rem] truncate text-[12.5px] text-[var(--ink-75)] transition-colors group-hover:text-[var(--ink-90)]">
						{name || "Account"}
					</span>
				) : null}
				{compact ? null : (
					<>
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
					</>
				)}
			</PopoverTrigger>
			<PopoverContent
				// ⚠️ A menu anchored at the foot of a sidebar has to open upwards; one
				// in the top-right has to open down and align to its right edge, or it
				// hangs off the window.
				side={compact ? "bottom" : "top"}
				align={compact ? "end" : "center"}
				/**
				 * ⚠️ The mirror of the switcher's, and the sign is NOT mirrored with
				 * it. `alignOffset` is measured from the chosen edge inward, so under
				 * `align="end"` a positive value pulls the panel LEFT — the opposite of
				 * what it does under `align="start"`. Both offsets are therefore -12,
				 * and both move the panel outward to the frame's edge: the switcher to
				 * the sidebar's left, this one to the outlet's right. The 12 is the
				 * header's own `px-3`; changing that means changing both.
				 */
				alignOffset={0}
				sideOffset={compact ? 6 : 8}
				collisionPadding={8}
				aria-label="Account menu"
				// The same card as the switcher's, at the same width: two menus opened
				// from the same bar that are different widths read as two components.
				className="flex w-[21rem] flex-col gap-0.5 rounded-xl border-[var(--console-line)] bg-[var(--console-pop)] p-1.5 shadow-2xl"
			>
				<Link
					href={accountHref("/settings/profile")}
					// The same filled block the switcher uses for its current entry:
					// this menu's subject is you, so you are the thing it opens with.
					className="mb-1 flex w-full items-center gap-2.5 rounded-lg bg-[rgb(var(--console-ink)/0.06)] px-2 py-2 text-[var(--ink-85)] no-underline outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.09)]"
				>
					<InitialsAvatar
						label={name || "Account"}
						shape="squircle"
						className="size-7 shrink-0 text-[10px]!"
					/>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-medium text-[12.5px] text-[var(--ink-90)]">
							{name || "Account"}
						</span>
						{/* ⚠️ The EMAIL where there is one, else the plan. An email says
						    which account you are signed in as, which is the question this
						    block exists to answer on a shared machine; the plan is a fact
						    about billing and belongs further down. */}
						<span className="mt-px block truncate text-[10.5px] text-[var(--ink-35)]">
							{email || plan}
						</span>
					</span>
				</Link>

				{/* 🔑 Grouped so LEAVING is a decision rather than a surprise.
				    Everything above the "Your account" heading stays where you are;
				    everything below changes surface. Somebody deep in a workspace
				    should never be thrown to another app by a menu row that looked
				    identical to the one above it. */}
				{onSettings ? (
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							onSettings();
						}}
						className={menuRow}
					>
						<GearSixIcon size={14} />
						<span>Settings</span>
					</button>
				) : (
					<SettingsLink
						href={settingsHref ?? accountHref("/settings/security")}
						className={menuRow}
					>
						<GearSixIcon size={14} />
						<span>Settings</span>
					</SettingsLink>
				)}
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
				<a href={signOutHref} onClick={onSignOut} className={menuRow}>
					<SignOutIcon size={14} />
					<span>Sign out</span>
				</a>
			</PopoverContent>
		</Popover>
	);
}

/** Shared authenticated frame. Account and QuickDash supply different sidebar
 * contents while retaining identical geometry and responsive behaviour. */
/**
 * Whether the console is in FOCUS MODE — chrome out of the way so one thing can
 * have the screen.
 *
 * 🔴 A context rather than a prop, because the thing that wants the space is
 * always several levels below the shell that owns the navigation. Threading a
 * prop from a route, through a module switch, into a view would make every
 * component in between carry a concern none of them have.
 *
 * ⚠️ Defaults to a no-op, so a surface that never calls it behaves exactly as
 * before and the account app needs no change at all.
 */
const FocusContext = createContext<{
	focused: boolean;
	setFocused: (value: boolean) => void;
}>({ focused: false, setFocused: () => {} });

export function useConsoleFocus() {
	return useContext(FocusContext);
}

/**
 * How wide the sidebar starts, and how far it can be dragged.
 *
 * 🔑 240px is exactly what it was before it detached — the card layout is the
 * change, not the proportions. Somebody who liked the old width should not have
 * to do anything to keep it.
 *
 * The bounds are the points either side of which the panel stops working: under
 * 200 the workspace name truncates before it has said anything useful, over 460
 * it is a column of mostly empty space next to the actual work.
 */
const RAIL_DEFAULT = 240;
/**
 * 🔴 The floor IS the default. It can be widened and never narrowed.
 *
 * 240 is the width every screen in both consoles was designed against, and it is
 * already the point where the workspace name starts truncating. Letting somebody
 * drag below it does not give them a tidier sidebar, it gives them a broken one —
 * and they would have done it to themselves, which is worse than the product
 * doing it.
 */
const RAIL_MIN = RAIL_DEFAULT;
const RAIL_MAX = 460;
const RAIL_KEY = "quickengine-console-rail";

/**
 * The assistant panel on the right.
 *
 * ⚠️ Wider than the navigation rail by default and allowed to go wider still.
 * Navigation is a list of short labels; this holds prose, and prose at 240px is
 * a column of two-word lines.
 */
const AIDE_DEFAULT = 360;
const AIDE_MIN = 300;
const AIDE_MAX = 620;
const AIDE_KEY = "quickengine-console-aide";

/**
 * QuickTools, across the bottom.
 *
 * ⚠️ Its height is WORKSPACE-SCOPED while the two rails are not. The rails are a
 * preference about how you like to work and should follow you everywhere; what
 * the tool bar holds is specific to the workspace, so how much room it needs is
 * too. `scope` is appended to this key and to nothing else.
 */
const TOOLS_DEFAULT = 224;
const TOOLS_MIN = 120;
/**
 * ⚠️ Raised from 520 for the developer console.
 *
 * 520px is right for a strip of widgets and useless for a webhook payload —
 * you drag it as tall as it goes and still cannot read a body. 78% of the
 * window lets it become a real reading surface and drag back down to a
 * two-line stream, which is the whole point of it being resizable.
 */
const TOOLS_MAX = Math.round(
	(typeof window === "undefined" ? 1200 : window.innerHeight) * 0.78,
);
const TOOLS_KEY = "quickengine-console-tools";

export function ConsoleShell({
	switcher,
	account,
	navTop,
	nav,
	navBottom,
	overlays,
	header,
	assistant,
	assistantOpen = false,
	integrations,
	integrationsOpen = false,
	tools,
	toolsOpen = false,
	bottom,
	bottomOpen = false,
	scope,
	contentMax,
	breadcrumb,
	children,
}: {
	switcher?: ReactNode;
	account?: ReactNode;
	navTop?: ReactNode;
	nav?: ReactNode;
	navBottom?: ReactNode;
	overlays?: ReactNode;
	/**
	 * The assistant column on the right.
	 *
	 * ⚠️ The console does NOT own whether it is open. The control that toggles it
	 * lives in the app's own header alongside its other actions, so the app holds
	 * the state — a shell that kept its own copy would need a way to read it back
	 * out for the button to show a pressed state.
	 */
	assistant?: ReactNode;
	assistantOpen?: boolean;
	/**
	 * What this workspace is connected to. Shares the assistant's column.
	 *
	 * 🔴 A peer of the assistant, not a section inside it — connecting a service
	 * has to work for somebody who never opens the AI at all.
	 */
	integrations?: ReactNode;
	integrationsOpen?: boolean;
	/**
	 * QuickTools, across the bottom.
	 *
	 * 🔑 Full width, under everything — the sidebar, the content and the
	 * assistant. It is the mirror of the header: the console's own bar, belonging
	 * to no single column, so nothing it holds is about "the page" or "the
	 * navigation" in particular.
	 *
	 * ⚠️ It PUSHES rather than overlays, like the header does. A tool surface that
	 * covered the bottom of a list would hide the rows somebody is about to act
	 * on, which is the one thing a tool bar must not do.
	 */
	tools?: ReactNode;
	toolsOpen?: boolean;
	/**
	 * The bottom region's contents — the developer console.
	 *
	 * Separate from `tools` because they are different shapes: this is docked
	 * and resizable, QuickTools is a tray that overlays and owns no space.
	 */
	bottom?: ReactNode;
	bottomOpen?: boolean;
	/**
	 * What the workspace-scoped preferences belong to — a workspace id, or an id
	 * and environment together.
	 *
	 * ⚠️ Only the tool bar's height uses it. The sidebar and assistant widths are
	 * about how somebody likes to work and should not reset when they change
	 * workspace.
	 */
	scope?: string;
	/**
	 * 🔴 THE FIX FOR STRETCHING AND SQUISHING.
	 *
	 * Everything else in this shell is fixed or fixed-by-choice: the rails have
	 * widths, the header has a height. The content column was the one thing that
	 * simply took whatever was left — so widening the sidebar, opening the
	 * assistant or resizing the window reflowed the page every time, and a table
	 * that reflows on every drag looks broken even when it is behaving.
	 *
	 * Given a cap, the leftover space becomes GUTTERS instead. The content holds
	 * one width and simply sits further from the edges; it only narrows once the
	 * gutters are gone, which is the point at which narrowing is genuinely the
	 * right answer.
	 *
	 * ⚠️ Opt-in, and it must stay that way. A console of full-width tables wants
	 * the width, and capping those would waste half the window to keep a number
	 * column from moving.
	 *
	 * A CSS length: `"72rem"`, `"1100px"`.
	 */
	contentMax?: string;
	/**
	 * Where you are, at the top-left of the CONTENT rather than in the header.
	 *
	 * 🔑 It belongs to the page, not to the console. In the header it sat beside
	 * the organisation switcher and the two read as one confused line — the
	 * switcher says which organisation, the breadcrumb says which page, and
	 * shoulder to shoulder neither was obviously either.
	 *
	 * ⚠️ Rendered INSIDE the width cap, so it lines up with the page's own first
	 * column rather than floating against the panel edge.
	 */
	breadcrumb?: ReactNode;
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
	 * 🔴 It is its own PANEL now, not a borderless strip on the content. When the
	 * sidebar detached, a header painted onto the page put the two halves of the
	 * chrome in different languages.
	 */
	header?: ReactNode;
	children: ReactNode;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [focused, setFocused] = useState(false);
	const focus = useMemo(() => ({ focused, setFocused }), [focused]);

	/**
	 * The draggable rails.
	 *
	 * 🔴 Written as a CSS CUSTOM PROPERTY on the frame, not as React state.
	 * Dragging fires at the pointer's frame rate, and putting the width in state
	 * would re-render the entire console — sidebar, header and every row of
	 * whatever list is open — on every one of those events. Setting a variable on
	 * one element moves the layout without React knowing anything happened.
	 *
	 * State is used only for what has to survive: the value is read once on
	 * mount and written once on release.
	 */
	const frameRef = useRef<HTMLDivElement>(null);

	/**
	 * Whichever of the two was opened last wins the column.
	 *
	 * ⚠️ Integrations first: pressing it while the assistant is open should
	 * SWITCH rather than do nothing, and the call site closes the other when it
	 * opens one. This ordering only decides what happens if both are somehow
	 * true at once.
	 */
	const aside = integrationsOpen
		? integrations
		: assistantOpen
			? assistant
			: null;
	/**
	 * ⚠️ The rail widths live on the FRAME, not on the row.
	 *
	 * The header is a SIBLING of the row, so a variable set there is out of scope
	 * for it — and the header's left group has to be exactly as wide as the
	 * sidebar. Set on the frame, both can read it.
	 */
	const rowRef = useRef<HTMLDivElement>(null);
	const railRef = useRef(RAIL_DEFAULT);
	const aideRef = useRef(AIDE_DEFAULT);
	const toolsRef = useRef(TOOLS_DEFAULT);

	/**
	 * One resizer, used by both rails.
	 *
	 * ⚠️ `direction` is what makes the right-hand panel work: dragging left has
	 * to make it WIDER, so its delta is negated. Written as one function rather
	 * than two because the persistence, the clamping and the pointer capture are
	 * the parts that go subtly wrong when duplicated.
	 */
	const makeRail = useCallback(
		(
			ref: React.MutableRefObject<number>,
			cssVar: string,
			storageKey: string,
			min: number,
			max: number,
			direction: 1 | -1,
			/** ⚠️ `y` for the tool bar, which is dragged by its top edge. */
			axis: "x" | "y" = "x",
		) => {
			const apply = (px: number) => {
				const clamped = Math.min(max, Math.max(min, Math.round(px)));
				ref.current = clamped;
				frameRef.current?.style.setProperty(cssVar, `${clamped}px`);
				return clamped;
			};

			const remember = (px: number) => {
				try {
					window.localStorage.setItem(storageKey, String(px));
				} catch {
					// It simply will not be remembered next time.
				}
			};

			return {
				apply,
				restore: () => {
					// ⚠️ Guarded: `localStorage` throws outright in a few real cases —
					// Safari with cookies blocked, some embedded webviews — and the
					// console must not fail to render because it could not recall a width.
					try {
						const stored = Number(window.localStorage.getItem(storageKey));
						if (Number.isFinite(stored) && stored > 0) apply(stored);
					} catch {
						// The CSS fallback is already the default.
					}
				},
				start: (event: React.PointerEvent<HTMLElement>) => {
					event.preventDefault();
					const startAt = axis === "x" ? event.clientX : event.clientY;
					const startWidth = ref.current;

					/**
					 * 🔴 Listeners on the WINDOW, not on the handle.
					 *
					 * They were on the handle with pointer capture, and capture can be
					 * lost — released outside the element, interrupted by the browser,
					 * cancelled by a gesture. When that happened `pointerup` never
					 * reached the handle, so `pointermove` was never removed, and the
					 * rail then resized on plain HOVER for the rest of the session. A
					 * drag that survives its own release is worse than one that ends
					 * early.
					 *
					 * The window always sees the release, whatever the pointer is over.
					 */
					const onMove = (move: PointerEvent) =>
						apply(
							startWidth +
								direction *
									((axis === "x" ? move.clientX : move.clientY) - startAt),
						);

					const onUp = () => {
						window.removeEventListener("pointermove", onMove);
						window.removeEventListener("pointerup", onUp);
						window.removeEventListener("pointercancel", onUp);
						// ⚠️ Also on blur: switching apps mid-drag fires neither a pointerup
						// nor a pointercancel, and the drag would resume on return.
						window.removeEventListener("blur", onUp);
						// 🔑 Written once, on release. Writing on every move would hit
						// storage sixty times a second to record values nobody chose.
						remember(ref.current);
					};

					window.addEventListener("pointermove", onMove);
					window.addEventListener("pointerup", onUp);
					window.addEventListener("pointercancel", onUp);
					window.addEventListener("blur", onUp);
				},
				nudge: (event: React.KeyboardEvent) => {
					const step = event.shiftKey ? 32 : 8;
					const [less, more] =
						axis === "x"
							? ["ArrowLeft", "ArrowRight"]
							: ["ArrowUp", "ArrowDown"];
					const by = event.key === less ? -step : event.key === more ? step : 0;
					if (!by) return;
					event.preventDefault();
					remember(apply(ref.current + direction * by));
				},
			};
		},
		[],
	);

	const rail = useMemo(
		() => makeRail(railRef, "--console-rail", RAIL_KEY, RAIL_MIN, RAIL_MAX, 1),
		[makeRail],
	);
	const aide = useMemo(
		() => makeRail(aideRef, "--console-aide", AIDE_KEY, AIDE_MIN, AIDE_MAX, -1),
		[makeRail],
	);
	const toolsRail = useMemo(
		() =>
			makeRail(
				toolsRef,
				"--console-tools",
				// 🔑 Scoped. Two workspaces can want very different amounts of bar.
				scope ? `${TOOLS_KEY}:${scope}` : TOOLS_KEY,
				TOOLS_MIN,
				TOOLS_MAX,
				// Dragging the top edge UP makes it taller, so the delta is inverted.
				-1,
				"y",
			),
		[makeRail, scope],
	);

	useEffect(() => {
		rail.restore();
		aide.restore();
		toolsRail.restore();
	}, [rail, aide, toolsRail]);

	const sidebar = (
		<>
			{switcher ? <div className="h-16 shrink-0">{switcher}</div> : null}
			{/* ⚠️ The top padding only exists when there is NO switcher. With one, its
			    `h-16` row is the sidebar's own breathing room; without one the first
			    nav item sat hard against the panel's rounded corner, which reads as
			    content that has been cropped rather than placed. */}
			<div
				className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
					switcher ? "" : "pt-3"
				}`}
			>
				{navTop}
				{nav}
			</div>
			{/* 🔴 IN the footer, not floating over it.
			    It used to be anchored with `bottom-full` so it overlaid the end of
			    the navigation and left the sidebar's proportions untouched. Two
			    things killed that: it read as laid on top rather than built in, and
			    it was wrapped in `{account ? …}` — so when the account row moved to
			    the header it stopped rendering entirely and nobody saw it again.

			    ⚠️ `empty:hidden` because a slot being PASSED is not the same as it
			    rendering something. `SidebarCard` decides for itself whether to
			    appear and is silent most of the time, which still satisfies
			    `navBottom ? …` — without this the padded wrapper drew a border
			    around nothing. */}
			{navBottom ? (
				<div className="shrink-0 p-2 empty:hidden">{navBottom}</div>
			) : null}
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
	const row = (
		<div
			ref={rowRef}
			/**
			 * ⚠️ `1.5px`, derived rather than picked: the space BETWEEN the panels has
			 * to measure the same as the space AROUND them. The padding is 6px and the
			 * grab bar takes 3px out of the middle, so each side gets `(6 - 3) / 2`.
			 * Changing either the padding or the bar's width means changing this too.
			 */
			style={{ gap: "1.5px" }}
			className="relative flex min-h-0 flex-1 overflow-hidden overscroll-none text-[var(--ink-90)]"
		>
			<aside
				/*
				 * 🔑 Hidden in focus mode, not merely narrowed.
				 *
				 * A preview of the customer's own website is the one thing in the
				 * console that is not console — it needs the width, and navigation
				 * beside it is chrome around chrome around a page.
				 */
				/**
				 * 🔴 DETACHED. It was welded to the content with a `border-r` and the
				 * same background, so the two were one slab and the hairline between
				 * them did all the work. It is now its own panel on the floor: a real
				 * surface with edges, corners and a shadow, which is what lets it read
				 * as navigation sitting beside the work rather than as a strip of the
				 * same page.
				 *
				 * ⚠️ It starts at exactly the width it was before it detached, and is
				 * DRAGGABLE from there. The card layout is the change; the proportions
				 * are the person's business. Width comes from `--console-rail` with the
				 * old value as the CSS fallback, so the first paint is right before the
				 * stored preference has been read.
				 *
				 * ⚠️ No `rounded-tl` special case any more. The panel is fully rounded
				 * in every state, so the banner has nothing to interact with.
				 */
				style={{
					boxShadow: "var(--console-lift)",
					width: "var(--console-rail, 240px)",
				}}
				className={`hidden shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--console-line)] bg-[var(--console-panel)] ${
					focused ? "" : "md:flex"
				}`}
			>
				{sidebar}
			</aside>

			{/*
			 * 🔑 The handle lives IN the gap. A zero-width flex item with an
			 * absolutely positioned hit area means the divider costs no layout at
			 * all beyond its own 3px, and the frame's gap falls either side of it.
			 *
			 * ⚠️ Hidden with the sidebar. Below `md` the panel is a drawer and there
			 * is nothing beside the content to resize.
			 */}
			{focused ? null : (
				/**
				 * 🔴 A real column, not a zero-width overlay.
				 *
				 * It used to be `w-0` with the grab area covering the whole gap, which
				 * meant the bar sat flush against the outlet: a gap on the sidebar side
				 * and none on the other. Giving it an actual 3px width and letting the
				 * frame's `gap` fall either side of it makes the spacing symmetrical —
				 * sidebar, gap, bar, gap, content — and pulls the content in by the
				 * width of the bar.
				 */
				<div className="relative hidden w-[3px] shrink-0 md:block">
					{/*
					 * ⚠️ A `button`, not a `div` with `role="separator"`. A focusable
					 * separator is required by ARIA to publish `aria-valuenow`, and the
					 * width deliberately never enters React state — there is no live
					 * value to publish. A button says what it does, is focusable and
					 * keyboard operable for free, and the arrow keys below give it the
					 * behaviour the separator role would only have described.
					 */}
					<button
						type="button"
						aria-label="Resize navigation. Use arrow keys to adjust, double click to reset."
						onPointerDown={rail.start}
						onKeyDown={rail.nudge}
						onDoubleClick={() => rail.apply(RAIL_DEFAULT)}
						/* ⚠️ The HIT AREA is wider than the bar, and overhangs both gaps.
						   A 3px target is a target nobody hits; `-inset-x-2` gives it
						   19px to aim at without taking any layout. */
						className="group -inset-x-2 absolute inset-y-0 flex cursor-col-resize items-center justify-center outline-none"
					>
						{/* Invisible until wanted. A permanent divider would undo the
						    detachment — the point is space between two panels, not a line
						    joining them. */}
						<span className="h-10 w-[3px] rounded-full bg-[rgb(var(--console-ink)/0.28)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
					</button>
				</div>
			)}

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

			{/*
			 * 🔴 The tool bar spans the CONTENT and the assistant, NOT the sidebar.
			 *
			 * It sat in the frame, under everything, which put a bar of workspace
			 * tools beneath the navigation too — and navigation is not something a
			 * tool acts on. Wrapping the content, the assistant and the bar in one
			 * column stops it at the sidebar's edge, so what it underlines is exactly
			 * what it applies to.
			 */}
			<div
				style={{ gap: "6px" }}
				className="flex min-w-0 flex-1 flex-col overflow-hidden"
			>
				<div style={{ gap: "1.5px" }} className="flex min-h-0 flex-1">
					{/*
					 * ⚠️ The scroller is a CHILD of the panel, not the panel itself. A
					 * rounded box cannot both clip its corners and scroll — `overflow`
					 * governs one or the other, and a scrolling rounded box loses its
					 * radius the moment content reaches the edge.
					 */}
					<main
						style={{ boxShadow: "var(--console-lift)" }}
						className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--console-line)] bg-[var(--console-bg)]"
					>
						{/*
						 * 🔴 A flex COLUMN, and this is what stops an empty page
						 * scrolling.
						 *
						 * Every page's own `<main>` carries `min-h-full` — 100% of this
						 * box — while the breadcrumb row sits above it as a sibling. So
						 * the contents came to `breadcrumb + 100%`, which overflows by
						 * exactly the height of the breadcrumb, on every page, forever.
						 * A list with two rows scrolled; so did one with none.
						 *
						 * Splitting it into a fixed-height header and a `grow` body means
						 * `min-h-full` resolves against the space that is actually LEFT,
						 * and the two together come to exactly one screen.
						 */}
						<div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
							{contentMax ? (
								<div
									className="mx-auto flex min-h-full w-full flex-col"
									style={{ maxWidth: contentMax }}
								>
									{breadcrumb ? (
										<div className="shrink-0 px-5 pt-5">{breadcrumb}</div>
									) : null}
									<div className="flex grow flex-col">{children}</div>
								</div>
							) : (
								<>
									{breadcrumb ? (
										<div className="shrink-0 px-5 pt-5">{breadcrumb}</div>
									) : null}
									<div className="flex grow flex-col">{children}</div>
								</>
							)}
						</div>
					</main>

					{/*
					 * 🔑 ONE right column, two tenants.
					 *
					 * The assistant and integrations are both things you CONSULT beside
					 * your work, and both want the same width — so they share a column
					 * rather than adding a fifth region. Opening one closes the other,
					 * which is also why integrations cost nothing to add: no new rail,
					 * no new width to remember, no further squeeze on the content.
					 *
					 * ⚠️ Integrations are NOT part of the assistant, deliberately.
					 * Somebody who never touches the AI still has to be able to connect
					 * Gmail and use it.
					 */}
					{aside && !focused ? (
						<>
							{/* Its own grab bar, on its LEFT — the edge it shares with the
					    content. Same 3px column and same overhanging hit area as the
					    navigation rail's, mirrored. */}
							<div className="relative hidden w-[3px] shrink-0 md:block">
								<button
									type="button"
									aria-label="Resize assistant. Use arrow keys to adjust, double click to reset."
									onPointerDown={aide.start}
									onKeyDown={aide.nudge}
									onDoubleClick={() => aide.apply(AIDE_DEFAULT)}
									className="group -inset-x-2 absolute inset-y-0 flex cursor-col-resize items-center justify-center outline-none"
								>
									<span className="h-10 w-[3px] rounded-full bg-[rgb(var(--console-ink)/0.28)] opacity-0 transition-opacity duration-150 group-focus-visible:opacity-100 group-hover:opacity-100" />
								</button>
							</div>

							{/*
							 * 🔑 The same panel treatment as the navigation rail, on the other
							 * side. Not a drawer floating over the content and not a dialog: it
							 * is a third column, so the page it is helping with stays fully
							 * visible and simply narrows. An assistant that covers the thing you
							 * are asking about is worse than no assistant.
							 */}
							<aside
								style={{
									boxShadow: "var(--console-lift)",
									width: "var(--console-aide, 360px)",
								}}
								className="hidden shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--console-line)] bg-[var(--console-panel)] md:flex"
							>
								{aside}
							</aside>
						</>
					) : null}
				</div>

				{/*
				 * The bottom region, and what lives in it.
				 *
				 * 🔴 It is NOT QuickTools any more. A region should be permanent only
				 * if its content is CONTINUOUS — navigation is, a conversation is, a
				 * log is. A calculator is not: you want it for nine seconds. So the
				 * widgets moved to a tray and this space is kept for the developer
				 * console, whose content genuinely streams.
				 *
				 * ⚠️ It stops at the sidebar deliberately. Navigation is how you reach
				 * the thing you are testing — you watch a delivery fail, then click
				 * through to the order it was about. Covering the sidebar would make
				 * this modal in practice even though it is not.
				 */}
				{bottom && bottomOpen && !focused ? (
					<>
						{/* The grab bar, on the tool bar's top edge — the one it shares with
					    the row above. Same 3px column and overhanging hit area as the
					    rails', turned on its side. */}
						{/* 🔴 `-my-[4.5px]` because the frame's `gap` falls on BOTH sides of
					    this handle: row, 6px, handle, 6px, tools — 15px where every other
					    gap in the console is 6. Pulling 4.5px back off each side collapses
					    the three into one: `6 - 4.5 + 3 - 4.5 + 6 = 6`.
					    ⚠️ Derived from the gap and the handle's width. Changing either
					    means recomputing this. */}
						<div className="-my-[4.5px] relative h-[3px] shrink-0">
							<button
								type="button"
								aria-label="Resize QuickTools. Use arrow keys to adjust, double click to reset."
								onPointerDown={toolsRail.start}
								onKeyDown={toolsRail.nudge}
								onDoubleClick={() => toolsRail.apply(TOOLS_DEFAULT)}
								className="group -inset-y-2 absolute inset-x-0 flex cursor-row-resize items-center justify-center outline-none"
							>
								<span className="h-[3px] w-10 rounded-full bg-[rgb(var(--console-ink)/0.28)] opacity-0 transition-opacity duration-150 group-focus-visible:opacity-100 group-hover:opacity-100" />
							</button>
						</div>

						<div
							style={{
								boxShadow: "var(--console-lift)",
								height: "var(--console-tools, 224px)",
							}}
							className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--console-line)] bg-[var(--console-bg)]"
						>
							{bottom}
						</div>
					</>
				) : null}
			</div>

			{overlays}
		</div>
	);

	/**
	 * 🔴 The header spans the FULL width, above the sidebar as well as the
	 * content.
	 *
	 * It used to sit inside the right-hand column, level with the workspace
	 * switcher. That put page actions beside the workspace name and made the two
	 * compete for the same line — and once the assistant opened as a third
	 * column, the header shrank with the content while the rails stayed put,
	 * which is exactly the stretching that had just been designed out.
	 *
	 * Spanning everything, it is the console's own bar: fixed height, unaffected
	 * by any rail, and the thing every panel hangs beneath.
	 *
	 * ⚠️ `h-12`, not `h-16`. A full-width bar carries far more visual weight than
	 * a panel-width one, so the height that felt right in a column feels heavy
	 * across the whole window.
	 */
	const frame = (
		<div
			ref={frameRef}
			style={{ gap: "6px" }}
			// ⚠️ Always `h-svh`. It used to be `flex-1` whenever a banner was showing,
			// which is what made entering sandbox move everything.
			className="relative flex h-svh min-h-0 flex-col overflow-hidden bg-[var(--console-floor)] p-1.5"
		>
			{header && !focused ? (
				/**
				 * The header is a panel like the others.
				 *
				 * ⚠️ Tried bare — controls floating directly on the floor — and the
				 * empty band either side of them read as unfinished. Tried as trays
				 * behind each group, which fixed that but boxed the buttons twice. The
				 * single card is the version that holds.
				 *
				 * 🔑 Its gap to the row below is the same 8px as everything else, set
				 * once on the frame's `gap` rather than as padding here, so the header
				 * cannot drift away from the panels it belongs with.
				 */
				<div
					style={{ boxShadow: "var(--console-lift)" }}
					className="flex h-14 shrink-0 items-center overflow-hidden rounded-2xl border border-[var(--console-line)] bg-[var(--console-bg)] px-2"
				>
					{header}
				</div>
			) : null}
			{row}
			{/*
			 * QuickTools: a TRAY, not a region.
			 *
			 * 🔑 It drops from the header button that opens it and overlays the
			 * content, so it costs no permanent space — a calculator does not earn
			 * a docked column. Widgets wrap into as many rows as they need, and one
			 * can be torn off to float wherever you want it.
			 *
			 * ⚠️ Offset by `--console-rail` so it starts where the content does. It
			 * hangs off the header, and the header is what it belongs to; covering
			 * the navigation would make reaching for a tool cost you your place.
			 */}
			{tools && toolsOpen && !focused ? (
				<div
					style={{
						boxShadow: "var(--console-lift)",
						left: "calc(var(--console-rail, 240px) + 12px)",
					}}
					/* ⚠️ `3.5rem + 12px` is DERIVED, not eyeballed: the frame's 6px
					   padding, the header's `h-14`, and the frame's 6px gap. It lands on
					   the row's top edge, so the tray lines up with the panels rather
					   than clipping the header by a couple of pixels. */
					className="absolute top-[calc(3.5rem+12px)] right-1.5 z-30 hidden max-h-[min(60vh,26rem)] overflow-y-auto rounded-2xl border border-[var(--console-line)] bg-[var(--console-pop)] md:block"
				>
					{tools}
				</div>
			) : null}
		</div>
	);

	return <FocusContext.Provider value={focus}>{frame}</FocusContext.Provider>;
}
