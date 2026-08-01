import { CaretDoubleLeftIcon, ListIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import { Sidebar, SidebarInset, SidebarProvider } from "./ui/sidebar";

/**
 * The console layout, shared by QuickDash and Account.
 *
 * They are one product, so they get one shell. Keeping two copies in step by
 * hand is a promise nobody keeps — the second copy drifts the moment either is
 * touched, which is exactly what "identical layout" cannot survive.
 *
 * Everything structural lives here: the framed window, the permanent rail, the
 * floating header band, the scroll containment, the content measure. Callers
 * supply only what differs — which is content, never geometry.
 *
 * Notes worth keeping:
 *
 * · `h-svh overflow-hidden` locks the PAGE. Without it the whole layout scrolls
 *   and the floating band slides over the content. Scrolling belongs inside the
 *   rail and inside the panel, independently. `html, body, #root` must also be
 *   locked in each app's stylesheet — a wrapper alone cannot stop `body`
 *   scrolling when its child overflows.
 *
 * · `collapsible="none"` is required for a rail inside a clipped, rounded
 *   container — the default renders it `fixed`, which cannot be clipped. It also
 *   drops shadcn's mobile sheet, so mobile is built here explicitly: the rail is
 *   hidden below `md` and the same nav is rendered into a drawer instead. Nothing
 *   is duplicated; both surfaces receive the identical slots.
 *
 * · `--header-height` is what drops the rail below the band. Both read the same
 *   value so they cannot drift apart.
 */
export function ConsoleShell({
	switcher,
	breadcrumbs,
	actions,
	account,
	navTop,
	nav,
	navBottom,
	overlays,
	children,
}: {
	/** Rail-width cluster: avatar plus org or workspace switcher. */
	switcher: ReactNode;
	/** Starts on the panel's left edge. */
	breadcrumbs?: ReactNode;
	/** Right of the band: upgrade, search. */
	actions?: ReactNode;
	/** The account control. One node, two placements — last in the desktop
	    actions row, and the mobile drawer's footer. Kept out of `actions` so the
	    shell can put it in both without either app passing it twice. */
	account?: ReactNode;
	/** Pinned above the scroll region — the places you return to constantly. */
	navTop?: ReactNode;
	/** The scrolling middle. */
	nav?: ReactNode;
	/** Pinned to the bottom — visited occasionally, never as part of a task. */
	navBottom?: ReactNode;
	/** Floating panels: tours, checklists. Rendered last, outside the frame. */
	overlays?: ReactNode;
	children: ReactNode;
}) {
	const [menuOpen, setMenuOpen] = useState(false);

	// Navigation proper — the same nodes in the desktop rail and the mobile
	// drawer, so the two can never present different routes.
	const navigation = (
		<>
			{navTop}
			{nav}
		</>
	);

	return (
		<SidebarProvider
			open
			onOpenChange={() => {
				/* the desktop rail is permanent */
			}}
			className="relative h-svh overflow-hidden"
			style={{ "--header-height": "2.75rem" } as React.CSSProperties}
		>
			{/* `data-tauri-drag-region` makes the empty parts of the band grab the
			    window — with an overlay title bar and no visible chrome there is
			    otherwise nowhere else to drag from. Its children carry no such
			    attribute, so clicking a control never starts a drag.

			    🔴 The band must NOT be `pointer-events-none`. The drag region works by
			    receiving a mousedown, and an element that takes no pointer events never
			    gets one — the window simply could not be moved. It does not need to be
			    transparent to clicks anyway: the frame below starts exactly at this
			    band's bottom edge, so there is nothing underneath it to block.

			    The inset class is a no-op in a browser; it only resolves in the shell. */}
			<div
				data-tauri-drag-region
				className="native-titlebar-inset absolute inset-x-0 top-0 z-20 hidden h-[calc(2.75rem+var(--titlebar))] items-center pr-4 pl-4 md:flex"
			>
				<div className="flex w-[var(--sidebar-width)] items-center gap-2">
					{switcher}
				</div>

				{/* The cluster above ends on the rail's right border, so this starts on
				    the panel's left edge. */}
				<div className="min-w-0 pl-4">{breadcrumbs}</div>

				<div className="ml-auto flex items-center gap-2">
					{actions}
					{account}
				</div>
			</div>

			{/* One window holding the rail and the content, rather than a rail beside
			    a floating document. One border on all four sides is what makes it read
			    as a single application surface.

			    `--elevate` is a real shadow on light and almost nothing on dark: light
			    themes get depth from shadow, dark themes from tone. */}
			{/* Mobile bar. A real bar rather than the floating band: at this width the
			    panel fills the screen, so a control hovering over it would sit on top
			    of content instead of beside it.

			    The menu control plus the current page. Without the name a phone gives
			    no indication of where you are — the rail that carries the active state
			    on desktop is behind a drawer here, so the header has to say it.

			    `breadcrumbs` is reused rather than a separate prop: it already derives
			    the page from the route, so the two surfaces cannot disagree about what
			    this screen is called. */}
			<div
				data-tauri-drag-region
				className="native-titlebar-inset absolute inset-x-0 top-0 z-20 flex h-[calc(3rem+var(--titlebar))] items-center bg-void px-3 md:hidden"
			>
				<button
					type="button"
					aria-label="Open menu"
					onClick={() => setMenuOpen(true)}
					className="-ml-1 shrink-0 p-1.5 text-ink"
				>
					<ListIcon size={22} />
				</button>

				{/* Absolutely centred on the BAR, not between its children — otherwise
				    the title shifts left because the menu button only exists on one
				    side. `pointer-events-none` so it never intercepts a tap meant for
				    the button beneath it. */}
				<div className="pointer-events-none absolute inset-x-12 flex justify-center">
					<div className="min-w-0 truncate">{breadcrumbs}</div>
				</div>
			</div>

			{/* Navigation drawer. The actions cluster lives in here too — search,
			    upgrade and the account menu do not fit beside a switcher at 375px, and
			    hiding them would make the phone a lesser product rather than a smaller
			    one. */}
			<Sheet open={menuOpen} onOpenChange={setMenuOpen}>
				<SheetContent
					side="left"
					className="w-[17rem] gap-0 border-edge bg-void p-0 [&>button]:hidden"
				>
					<SheetTitle className="sr-only">Navigation</SheetTitle>

					{/* The same switcher the desktop band carries — org in Account,
					    workspace in QuickDash. It answers "what am I looking at" before
					    any navigation, which is why it heads the drawer rather than
					    sitting in it.

					    ⚠️ The middle is still cleared for design. `railContent` holds
					    every nav slot and the desktop rail renders it unchanged; the
					    drawer simply is not laying it out yet. `actions` is likewise
					    still passed by both apps and not yet placed. */}
					<div className="flex h-12 shrink-0 items-center gap-2 px-3">
						<div className="flex min-w-0 flex-1 items-center gap-2">
							{switcher}
						</div>
						<button
							type="button"
							aria-label="Close menu"
							onClick={() => setMenuOpen(false)}
							className="p-1.5 text-dim transition-colors hover:text-ink"
						>
							<CaretDoubleLeftIcon size={16} />
						</button>
					</div>

					{/* The same nav the desktop rail renders — modules in QuickDash,
					    organisation in Account. `railContent` is one set of nodes used in
					    both places, so the phone can never present different navigation
					    from the desktop.

					    Navigation only — the rail's bottom group lives in the account sheet
					    on this breakpoint, not here.

					    Closes on any click inside: everything in here navigates, and a
					    drawer left open over the page you just asked for is a bug. */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: a plain div, not a button — nesting links inside a button is invalid HTML. */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: no keyboard handler is needed. Every child is natively interactive, and keyboard-activating a link dispatches a click that bubbles here — adding one would create a second focusable control over the navigation. */}
					<div
						onClick={() => setMenuOpen(false)}
						className="flex min-h-0 flex-1 flex-col overflow-y-auto"
					>
						{navigation}
					</div>

					{/* The account control, full width — its own trigger carries the name,
					    tier and caret, and opens a bottom sheet holding everything the
					    rail pinned at its foot. */}
					{account ? <div className="shrink-0 p-2">{account}</div> : null}
				</SheetContent>
			</Sheet>

			<div
				style={{ boxShadow: "var(--elevate)" }}
				className="mt-[calc(3rem+var(--titlebar))] flex min-h-0 flex-1 overflow-hidden border-edge bg-field md:m-4 md:mt-[calc(2.75rem+var(--titlebar))] md:rounded-xl md:border"
			>
				<Sidebar
					variant="inset"
					collapsible="none"
					className="hidden w-64 shrink-0 border-edge border-r bg-void p-0 md:flex"
				>
					{navigation}
					{/* Desktop only. On mobile these fold into the account sheet instead —
					    rendering them here as well would list Feedback and Developers
					    twice on the same screen. */}
					{navBottom ? (
						<div className="mt-auto flex flex-col gap-1 px-2 pt-6 pb-2">
							{navBottom}
						</div>
					) : null}
				</Sidebar>

				<SidebarInset className="min-h-0 flex-1 overflow-hidden bg-field md:m-0! md:rounded-none! md:shadow-none!">
					<div className="relative min-h-0 flex-1 overflow-y-auto">
						{/* One measure for every route, applied here so a new page inherits
						    it and none of them can drift. The scroller stays full width so
						    the scrollbar sits on the panel edge, not the content's. */}
						<div className="mx-auto w-full max-w-6xl">{children}</div>
					</div>
				</SidebarInset>
			</div>

			{overlays}
		</SidebarProvider>
	);
}
