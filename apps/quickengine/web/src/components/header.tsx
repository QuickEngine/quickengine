import { CaretDownIcon, ListIcon, XIcon } from "@phosphor-icons/react";
import { Logo, STATUS_URL } from "@quickengine/ui";
import { useEffect, useRef, useState } from "react";
import { GREY, ICE, Pill } from "@/components/pill";
import { env } from "@/lib/env";

const AUTH_URL = env.VITE_AUTH_URL;

/**
 * The front-page header.
 *
 * Front-page only — the other marketing routes use `site-header.tsx`.
 *
 * ⚠️ Several `menu` destinations do not exist yet and will 404, the same as the
 * footer sitemap. That is deliberate — these menus are the working list of what
 * the marketing site owes — but every one has to be built or cut before launch.
 *
 * `Docs` and `Pricing` have no menu on purpose. A dropdown holding one link is
 * an extra click for nothing.
 */
const NAV_LINKS: {
	label: string;
	href: string;
	menu?: { title: string; links: { label: string; href: string }[] }[];
}[] = [
	{
		label: "Product",
		href: "/products",
		menu: [
			{
				title: "Platform",
				links: [
					{ label: "Overview", href: "/products" },
					{ label: "Workspaces", href: "/products/workspaces" },
					{ label: "Modules", href: "/products/modules" },
					{ label: "Marketplace", href: "/products/marketplace" },
				],
			},
			{
				title: "Foundation",
				links: [
					{ label: "Client records", href: "/products/modules/clients" },
					{ label: "Files & documents", href: "/products/modules/files" },
					{
						label: "Reporting & analytics",
						href: "/products/modules/reporting",
					},
				],
			},
			{
				title: "Getting paid",
				links: [
					{ label: "Invoicing", href: "/products/modules/invoicing" },
					{ label: "Payments", href: "/products/modules/payments" },
					{ label: "Quotes & estimates", href: "/products/modules/quotes" },
				],
			},
			{
				title: "Doing the work",
				links: [
					{ label: "Projects & tasks", href: "/products/modules/projects" },
					{ label: "Time tracking", href: "/products/modules/time" },
					{
						label: "Bookings & scheduling",
						href: "/products/modules/bookings",
					},
					{ label: "Contracts & e-sign", href: "/products/modules/contracts" },
				],
			},
			{
				title: "Selling",
				links: [
					{ label: "Products & services", href: "/products/modules/products" },
					{ label: "Orders", href: "/products/modules/orders" },
					{ label: "Inventory", href: "/products/modules/inventory" },
					{ label: "Shipping", href: "/products/modules/shipping" },
					{ label: "Fulfilment", href: "/products/modules/fulfillment" },
					{ label: "Content", href: "/products/modules/content" },
				],
			},
			{
				title: "Keeping up",
				links: [{ label: "Changelog", href: "/changelog" }],
			},
		],
	},
	{
		label: "Solutions",
		href: "/business",
		menu: [
			{
				title: "By business",
				links: [
					{ label: "E-commerce", href: "/business/ecommerce" },
					{ label: "Agencies", href: "/business/agencies" },
					{ label: "Freelancers", href: "/business/freelancers" },
					{ label: "Trades & services", href: "/business/trades" },
					{ label: "SaaS", href: "/business/saas" },
					{ label: "Enterprise", href: "/business/enterprise" },
				],
			},
			{
				title: "In practice",
				links: [],
			},
		],
	},
	{
		label: "Developers",
		href: "/docs",
		menu: [
			{
				title: "Build",
				links: [
					{ label: "Documentation", href: "/docs" },
					{ label: "Quickstarts", href: "/docs/quickstarts" },
					{ label: "API reference", href: "/docs/api" },
					{ label: "SDKs", href: "/docs/sdks" },
					{ label: "CLI", href: "/docs/cli" },
				],
			},
			{
				title: "Operate",
				links: [
					{ label: "Status", href: STATUS_URL },
					{ label: "Changelog", href: "/changelog" },
				],
			},
		],
	},
	{ label: "Pricing", href: "/pricing" },
	{
		label: "Resources",
		// ⚠️ Points at `/support`, not `/resources`. The resources hub was deleted
		// on 2026-08-10 along with the pages it indexed — every one of them was a
		// placeholder shelf. A top-level nav item still needs somewhere to go for
		// anyone who clicks the label instead of opening the menu.
		href: "/support",
		menu: [
			{
				title: "Get help",
				links: [
					{ label: "Support", href: "/support" },
					{ label: "Community", href: "/community" },
					{ label: "Contact", href: "/contact" },
				],
			},
			{
				title: "Company",
				links: [
					{ label: "About", href: "/about" },
					{ label: "Security", href: "/security" },
					{ label: "Brand", href: "/brand" },
				],
			},
		],
	},
];

export function Header() {
	const [open, setOpen] = useState(false);
	const [menu, setMenu] = useState<string | null>(null);

	// Lock the page behind the mobile panel. Without this the body keeps
	// scrolling under a full-screen overlay, which on iOS reads as the menu
	// itself scrolling and is the most common way a mobile menu feels broken.
	useEffect(() => {
		if (!open) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [open]);

	// Escape closes whichever layer is showing.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setOpen(false);
			setMenu(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const active = NAV_LINKS.find((link) => link.label === menu && link.menu);

	// The panel has to keep its contents while it animates SHUT. Rendering
	// straight from `active` empties it the instant the mouse leaves, so the
	// height would collapse around nothing and the close would read as a flicker
	// rather than as the header retracting.
	const [rendered, setRendered] = useState(active);
	useEffect(() => {
		if (active) setRendered(active);
	}, [active]);

	// ⚠️ Measured height, not a `grid-rows: 0fr → 1fr` trick.
	//
	// The grid version animates open and shut correctly, but `1fr` means "as tall
	// as the content" — so moving from a five-link menu to a twelve-link one
	// leaves the declared value unchanged and the browser has nothing to
	// transition. The panel snapped between sizes.
	//
	// A real pixel height changes on every switch, so the header grows and
	// shrinks smoothly whatever is inside it. The ResizeObserver keeps it honest
	// when the content reflows — a narrower window wrapping a column would
	// otherwise leave the wrapper clipping its own contents.
	const contentRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState(0);
	useEffect(() => {
		const element = contentRef.current;
		if (!element) return;
		const measure = () => setHeight(element.offsetHeight);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	// Freeze the page while a menu is open. Scrolling with the panel down drags
	// content up behind a fixed header that is no longer where it was, and on a
	// trackpad it is very easy to nudge by accident while reaching for a link.
	//
	// The padding swap compensates for the scrollbar's width where the platform
	// draws one that takes up space. Without it, removing the bar widens the page
	// by ~15px and the whole layout jumps sideways the instant a menu opens —
	// invisible on macOS overlay scrollbars, glaring on Windows.
	useEffect(() => {
		if (!active) return;
		const body = document.body;
		const previousOverflow = body.style.overflow;
		const previousPadding = body.style.paddingRight;
		const gap = window.innerWidth - document.documentElement.clientWidth;
		body.style.overflow = "hidden";
		if (gap > 0) body.style.paddingRight = `${gap}px`;
		return () => {
			body.style.overflow = previousOverflow;
			body.style.paddingRight = previousPadding;
		};
	}, [active]);

	return (
		<>
			{/* The page behind, blurred while a menu is open. A separate full-screen
			    layer rather than a filter on the page itself: `backdrop-filter`
			    blurs whatever is BEHIND the element, so this blurs everything under
			    it without any component below needing to know the menu exists.

			    z-40 puts it under the header container at z-50, which is what keeps
			    the bar and the panel sharp while everything else softens.

			    Always mounted and faded with opacity, mounting it on open would
			    apply the blur in one frame, which reads as a flash rather than as
			    the page receding. `pointer-events-none` throughout: the menus are
			    hover-driven and already close on mouse-leave, so a layer that
			    swallowed clicks would only ever get in the way. */}
			<div
				aria-hidden="true"
				className={`pointer-events-none fixed inset-0 z-40 hidden bg-black/25 backdrop-blur-lg backdrop-saturate-150 transition-opacity duration-300 ease-out motion-reduce:transition-none lg:block ${
					active ? "opacity-100" : "opacity-0"
				}`}
			/>

			{/* The fixed element is this CONTAINER, not the bar. The dropdown lives
			    inside it, so the header genuinely grows downward when a menu opens
			    rather than a card appearing near it, and it gives one element to
			    hang `onMouseLeave` on, so travelling from a nav item into the panel
			    never crosses a gap that would close it. */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: hover container for the menus; every control inside is focusable and Escape closes them */}
			<div
				className="fixed inset-x-0 top-[var(--banner-h)] z-50"
				onMouseLeave={() => setMenu(null)}
			>
				{/* Mark and nav together on the left. Centring held the nav on the
				    page's true midline but left a gap between it and the mark that read
				    as two unrelated groups. */}
				<header className="flex h-[var(--header-h)] items-center gap-10 bg-black site-gutter">
					<a href="/" aria-label="QuickEngine home" className="w-fit shrink-0">
						{/* ⚠️ h-6, and NOT matched to the 36px pills beside it. Matching the
					    button height was tried on 2026-08-10 and is far too big: the mark
					    is a solid square glyph, so at 36px it carries much more optical
					    weight than a pill of the same height, which is mostly padding
					    around small text. Equal measured height is not equal presence.

					    This is the master size for every mark on the site. */}
						<Logo className="h-6 w-auto text-ink" />
					</a>

					<nav className="hidden items-center gap-7 lg:flex">
						{NAV_LINKS.map((link) => (
							// Duration is asymmetric on purpose: 150ms out so it answers the
							// cursor immediately, 300ms back so it settles rather than
							// snapping.
							<a
								key={link.href}
								href={link.href}
								onMouseEnter={() => setMenu(link.menu ? link.label : null)}
								onFocus={() => setMenu(link.menu ? link.label : null)}
								className={`flex items-center gap-1.5 font-body font-light text-ink text-sm no-underline outline-none transition-opacity duration-300 ease-out hover:opacity-55 hover:duration-150 focus-visible:opacity-55 ${
									menu === link.label ? "opacity-55" : "opacity-100"
								}`}
							>
								{link.label}
								{link.menu ? (
									<CaretDownIcon
										size={10}
										weight="bold"
										className={`transition-transform duration-300 ease-out ${
											menu === link.label ? "rotate-180" : ""
										}`}
									/>
								) : null}
							</a>
						))}
					</nav>

					<div className="ms-auto flex shrink-0 items-center gap-2">
						{/* The pills appear at `lg`, the same breakpoint as the nav.
						    Between `sm` and `lg` the bar held a mark, two pills AND a menu
						    button, four controls fighting over about 700px. It is now
						    either complete or minimal, never half of each. */}
						<div className="hidden items-center gap-2 lg:flex">
							{/* Both carry the disc. The chevron stays on Log In because it
							    signals a menu rather than a destination, that is a different
							    job from the disc, which says "this goes somewhere". */}
							<Pill
								href={`${AUTH_URL}/signin`}
								variant="secondary"
								disc="caret"
							>
								Log In
							</Pill>
							<Pill href={`${AUTH_URL}/signup`} variant="primary" disc="arrow">
								Try QuickDash
							</Pill>
						</div>

						{/* ⚠️ This is why the mobile panel exists. The nav is
						    `hidden lg:flex`, so every viewport under 1024px, most phones
						    AND plenty of laptop windows, had no way to reach any of these
						    pages. 28px to match the mark exactly: they are the only two
						    things at the outer edges of the bar, and unequal weight there
						    reads as a misalignment. */}
						<button
							type="button"
							aria-label={open ? "Close menu" : "Open menu"}
							aria-expanded={open}
							onClick={() => setOpen((value) => !value)}
							className="-me-2.5 p-2.5 text-ink lg:hidden"
						>
							{open ? <XIcon size={28} /> : <ListIcon size={28} />}
						</button>
					</div>
				</header>

				{/* The extension. Same black as the bar with a hairline beneath it, so
				    it reads as the header getting taller rather than as a panel
				    floating under it. */}
				{/* The slide. Height is animated in pixels — see the note above the
				    measurement, and the content fades 75ms behind it, because opening
				    both at once looks like the links are being stretched into place
				    rather than arriving into a space that opened for them. */}
				<div
					aria-hidden={!active}
					style={{ height: active ? height : 0 }}
					className="hidden overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none lg:block"
				>
					<div ref={contentRef}>
						<div
							className={`border-white/10 border-b bg-black/65 pt-5 pb-14 backdrop-blur-2xl backdrop-saturate-150 transition-opacity duration-200 ease-out motion-reduce:transition-none site-gutter ${
								active ? "opacity-100 delay-75" : "opacity-0"
							}`}
						>
							{/* A sitemap, not a wall of tiles. Boxed items with hover fills
							    made a handful of links look like products competing for a
							    decision; grouped text reads as an index you scan. The
							    section name on the left says where you are before you read
							    a single link. */}
							<div className="flex flex-col gap-8 lg:flex-row lg:gap-20">
								<div className="shrink-0 font-body font-normal text-[11px] text-white/30 uppercase tracking-[0.16em] lg:w-40">
									{rendered?.label}
								</div>

								<div className="grid flex-1 grid-cols-2 gap-x-16 gap-y-10 lg:grid-cols-3">
									{rendered?.menu?.map((group) => (
										<div key={group.title}>
											<div className="font-body font-normal text-[11px] text-white/30 uppercase tracking-[0.16em]">
												{group.title}
											</div>
											<div className="mt-4 flex flex-col">
												{group.links.map((item) => (
													<a
														key={item.href}
														href={item.href}
														onClick={() => setMenu(null)}
														// `tabIndex` follows the panel: a closed menu must
														// not hold focus stops, or tabbing through the
														// header walks into links nobody can see.
														tabIndex={active ? undefined : -1}
														className="w-fit py-1.5 font-body font-light text-[1rem] text-white/55 no-underline transition-colors duration-300 ease-out hover:text-white hover:duration-150 focus-visible:text-white"
													>
														{item.label}
													</a>
												))}
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Below the header, not over it, so the mark and the close button stay
			    visible and reachable while it is open. */}
			{open ? (
				<div className="fixed inset-x-0 top-[var(--header-h)] bottom-0 z-40 flex flex-col bg-black px-6 pt-4 pb-10 lg:hidden">
					<nav className="flex flex-col">
						{NAV_LINKS.map((link) => (
							<a
								key={link.href}
								href={link.href}
								onClick={() => setOpen(false)}
								className="border-white/10 border-b py-5 font-body font-light text-[1.375rem] text-ink no-underline"
							>
								{link.label}
							</a>
						))}
					</nav>

					{/* Full width and stacked, because a thumb reaching the bottom of a
					    phone screen should not have to aim. */}
					<div className="mt-auto flex flex-col gap-3 pt-10">
						<a
							href={`${AUTH_URL}/signup`}
							style={{ backgroundColor: ICE, color: "#000000" }}
							className="inline-flex h-12 items-center justify-center rounded-full font-body font-light text-[15px] no-underline"
						>
							Try QuickDash
						</a>
						<a
							href={`${AUTH_URL}/signin`}
							style={{ backgroundColor: GREY, color: ICE }}
							className="inline-flex h-12 items-center justify-center rounded-full font-body font-light text-[15px] no-underline"
						>
							Log In
						</a>
					</div>
				</div>
			) : null}
		</>
	);
}
