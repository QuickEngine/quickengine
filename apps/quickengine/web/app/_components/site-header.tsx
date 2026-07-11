"use client";

import { List, Plus, X } from "@phosphor-icons/react";
import { Logo } from "@quickengine/ui";
import { useEffect, useState } from "react";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

type MenuColumn = { title: string; links: { label: string; href: string }[] };

// Nav items. Those with `menu` open a mega panel on hover; the rest are plain
// links (Company = low-traffic hub, Pricing = single high-intent destination).
const NAV_LINKS: { label: string; href: string; menu?: string }[] = [
	{ label: "Products", href: "/products", menu: "products" },
	{ label: "Developers", href: "/developers", menu: "developers" },
	{ label: "Business", href: "/business", menu: "business" },
	{ label: "Resources", href: "/resources", menu: "resources" },
	{ label: "Company", href: "/company" },
	{ label: "Pricing", href: "/pricing" },
];

// Mega-menu content wired to real pages. The leading "Overview" link in each
// menu points at the hub, so mobile (where the parent is an accordion toggle,
// not a link) can still reach it.
const MENUS: Record<string, MenuColumn[]> = {
	products: [
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
			title: "Popular modules",
			links: [
				{ label: "Auth", href: "/products/modules/auth" },
				{ label: "Billing", href: "/products/modules/billing" },
				{ label: "Storage", href: "/products/modules/storage" },
				{ label: "Search", href: "/products/modules/search" },
			],
		},
		{
			title: "More modules",
			links: [
				{ label: "Jobs", href: "/products/modules/jobs" },
				{ label: "Realtime", href: "/products/modules/realtime" },
				{ label: "Analytics", href: "/products/modules/analytics" },
				{ label: "Webhooks", href: "/products/modules/webhooks" },
			],
		},
	],
	developers: [
		{
			title: "Build",
			links: [
				{ label: "Overview", href: "/developers" },
				{ label: "Documentation", href: "/docs" },
				{ label: "API reference", href: "/docs/api" },
				{ label: "SDKs", href: "/docs/sdks" },
				{ label: "CLI", href: "/docs/cli" },
			],
		},
		{
			title: "Explore",
			links: [
				{ label: "Quickstarts", href: "/docs/quickstarts" },
				{ label: "Examples", href: "/docs/examples" },
				{ label: "Changelog", href: "/changelog" },
				{ label: "Status", href: "/status" },
			],
		},
		{
			title: "Community",
			links: [
				{ label: "GitHub", href: "https://github.com/QuickEngine" },
				{ label: "Discord", href: "/community" },
				{ label: "Support", href: "/support" },
			],
		},
	],
	business: [
		{
			title: "By business type",
			links: [
				{ label: "Overview", href: "/business" },
				{ label: "E-commerce", href: "/business/ecommerce" },
				{ label: "Agencies", href: "/business/agencies" },
				{ label: "Freelancers", href: "/business/freelancers" },
				{ label: "SaaS", href: "/business/saas" },
			],
		},
		{
			title: "By stage",
			links: [
				{ label: "Startups", href: "/business/startups" },
				{ label: "Scale-ups", href: "/business/scale-ups" },
				{ label: "Enterprise", href: "/business/enterprise" },
				{ label: "Migrations", href: "/business/migrations" },
			],
		},
		{
			title: "Programs",
			links: [
				{ label: "Partners", href: "/partners" },
				{ label: "Startup program", href: "/startup-program" },
				{ label: "Talk to sales", href: "/contact" },
			],
		},
	],
	resources: [
		{
			title: "Learn",
			links: [
				{ label: "Overview", href: "/resources" },
				{ label: "Blog", href: "/blog" },
				{ label: "Guides", href: "/guides" },
				{ label: "Tutorials", href: "/tutorials" },
				{ label: "Webinars", href: "/webinars" },
			],
		},
		{
			title: "Proof",
			links: [
				{ label: "Customers", href: "/customers" },
				{ label: "Case studies", href: "/case-studies" },
				{ label: "Events", href: "/events" },
			],
		},
		{
			title: "Help",
			links: [
				{ label: "Support", href: "/support" },
				{ label: "Community", href: "/community" },
				{ label: "Contact", href: "/contact" },
			],
		},
	],
};

// Hover-dim: when any .navlink in the top bar is hovered, the others dim and the
// hovered one stays solid. px on each link makes the hit areas touch (no dead
// zone between them, so sweeping across doesn't reset the effect).
const navLink =
	"navlink text-foreground text-[13px] outline-none transition-opacity duration-200 group-has-[.navlink:hover]:opacity-40 hover:opacity-100! focus-visible:opacity-100!";
const pageLink = `${navLink} px-4 py-2`;

const menuColHeading = "text-[13px] text-foreground";
const menuLink =
	"text-[13px] text-muted-foreground transition-colors hover:text-foreground";

// Frosted-glass site header. The header is one continuous glass surface: the top
// bar sits at h-16, and hovering a nav item with a menu expands a full-bleed
// panel *within the same surface* — the header just grows downward, so there's
// no seam, and the bottom border rides to the panel's bottom edge.
export function SiteHeader() {
	const [active, setActive] = useState<string | null>(null);
	const [mobileOpen, setMobileOpen] = useState(false);
	const [openSection, setOpenSection] = useState<string | null>(null);
	const [scrolled, setScrolled] = useState(false);

	// Header border fades in once scrolled off the top, and back out at the top.
	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 8);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	// Lock page scroll while any panel is open (desktop mega-menu or mobile
	// menu). Compensates for the scrollbar width so desktop content doesn't jump.
	useEffect(() => {
		if (active === null && !mobileOpen) return;
		const scrollbarWidth =
			window.innerWidth - document.documentElement.clientWidth;
		const { overflow, paddingRight } = document.body.style;
		document.body.style.overflow = "hidden";
		if (scrollbarWidth > 0) {
			document.body.style.paddingRight = `${scrollbarWidth}px`;
		}
		return () => {
			document.body.style.overflow = overflow;
			document.body.style.paddingRight = paddingRight;
		};
	}, [active, mobileOpen]);

	const activeMenu = active ? MENUS[active] : null;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: onMouseLeave only closes the hover mega-menu; keyboard users open via focus and dismiss by tabbing away. Full keyboard/escape dismissal is a planned follow-up.
		<header
			onMouseLeave={() => setActive(null)}
			className={`fixed inset-x-0 top-0 z-50 border-b bg-background/60 backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 ${
				scrolled || active || mobileOpen
					? "border-border"
					: "border-transparent"
			}`}
		>
			<div className="page-gutter group flex h-16 items-center justify-between">
				<div className="flex items-center gap-6">
					<a
						href="/"
						onMouseEnter={() => setActive(null)}
						className="inline-flex w-fit items-center"
					>
						<Logo className="size-6 text-foreground" />
					</a>

					<nav className="-mx-4 hidden items-center lg:flex">
						{NAV_LINKS.map((link) => (
							<a
								key={link.href}
								href={link.href}
								onMouseEnter={() => setActive(link.menu ?? null)}
								onFocus={() => setActive(link.menu ?? null)}
								className={pageLink}
							>
								{link.label}
							</a>
						))}
					</nav>
				</div>

				<div className="flex items-center gap-5">
					<a
						href={`${AUTH_URL}/signin`}
						onMouseEnter={() => setActive(null)}
						className={`${navLink} hidden font-normal lg:inline`}
					>
						Sign in
					</a>
					<a
						href={`${AUTH_URL}/signup`}
						onMouseEnter={() => setActive(null)}
						className="hidden h-8 items-center rounded-md bg-foreground px-4 font-normal text-background text-[13px] transition-opacity hover:opacity-90 lg:inline-flex"
					>
						Get Started
					</a>
					<button
						type="button"
						aria-label={mobileOpen ? "Close menu" : "Open menu"}
						aria-expanded={mobileOpen}
						onClick={() => setMobileOpen((o) => !o)}
						className="text-foreground lg:hidden"
					>
						{mobileOpen ? (
							<X className="size-6" />
						) : (
							<List className="size-6" />
						)}
					</button>
				</div>
			</div>

			{/* Mega panel — collapses via a grid 0fr→1fr height transition so the
			    header appears to grow/shrink. Full-bleed content, capped at 50vh. */}
			<div
				className={`hidden transition-[grid-template-rows] duration-300 ease-out lg:grid ${
					active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
				}`}
			>
				<div className="overflow-hidden">
					<div className="page-gutter max-h-[50vh] overflow-y-auto py-10">
						{activeMenu ? (
							<div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-4">
								{activeMenu.map((column) => (
									<div key={column.title} className="flex flex-col gap-3">
										<span className={menuColHeading}>{column.title}</span>
										{column.links.map((link) => (
											<a key={link.label} href={link.href} className={menuLink}>
												{link.label}
											</a>
										))}
									</div>
								))}
							</div>
						) : null}
					</div>
				</div>
			</div>

			{/* Mobile menu — drops from the header like the desktop panels (grid
			    0fr→1fr). Empty for now; content is next. */}
			<div
				className={`grid transition-[grid-template-rows] duration-300 ease-out lg:hidden ${
					mobileOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
				}`}
			>
				<div className="overflow-hidden">
					<div className="page-gutter flex min-h-[calc(100dvh-4rem)] flex-col justify-between border-border border-b py-6">
						<nav className="flex flex-col">
							{NAV_LINKS.map((link) => {
								const menu = link.menu ? MENUS[link.menu] : null;

								// Direct link (no mega-menu): Company, Pricing.
								if (!menu || !link.menu) {
									return (
										<a
											key={link.href}
											href={link.href}
											onClick={() => setMobileOpen(false)}
											className="border-border border-b py-3 text-base text-foreground"
										>
											{link.label}
										</a>
									);
								}

								// Accordion: reveals the menu's full subpage list.
								const open = openSection === link.menu;
								const menuKey = link.menu;
								return (
									<div key={link.href} className="border-border border-b">
										<button
											type="button"
											aria-expanded={open}
											onClick={() => setOpenSection(open ? null : menuKey)}
											className="flex w-full items-center justify-between py-3 text-base text-foreground"
										>
											{link.label}
											<Plus
												className={`size-4 transition-transform duration-300 ${
													open ? "rotate-45" : ""
												}`}
											/>
										</button>
										<div
											className={`grid transition-[grid-template-rows] duration-300 ease-out ${
												open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
											}`}
										>
											<div className="overflow-hidden">
												<div className="flex flex-col gap-1 pb-4 pl-3">
													{menu
														.flatMap((col) => col.links)
														.map((sub) => (
															<a
																key={sub.label}
																href={sub.href}
																onClick={() => setMobileOpen(false)}
																className="py-1.5 text-muted-foreground text-sm"
															>
																{sub.label}
															</a>
														))}
												</div>
											</div>
										</div>
									</div>
								);
							})}
						</nav>

						<div className="flex flex-col gap-3">
							<a
								href={`${AUTH_URL}/signin`}
								onClick={() => setMobileOpen(false)}
								className="inline-flex h-11 items-center justify-center rounded-md border border-border font-normal text-foreground text-sm"
							>
								Sign in
							</a>
							<a
								href={`${AUTH_URL}/signup`}
								onClick={() => setMobileOpen(false)}
								className="inline-flex h-11 items-center justify-center rounded-md bg-foreground font-normal text-background text-sm"
							>
								Get Started
							</a>
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}
