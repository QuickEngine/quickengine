import Image from "next/image";

// Company-site nav (QuickEngine Software, not the QuickDash app). Routes 404
// until each page is built. Research-backed set: ~5 items, Products + Solutions
// lead, then Pricing / Resources / Company. Blog, Docs, Support live under
// Resources; Get Started + Sign in are the two CTAs.
const NAV_LINKS = [
	{ label: "Products", href: "/products" },
	{ label: "Pricing", href: "/pricing" },
	{ label: "Resources", href: "/resources" },
	{ label: "Contact", href: "/contact" },
];

// Full opacity at rest; when any `.navlink` in the header is hovered, the others
// dim and the hovered one stays solid (`hover:opacity-100!` beats the group rule).
const navLink =
	"navlink text-[13px] text-foreground outline-none transition-opacity duration-200 group-has-[.navlink:hover]:opacity-40 hover:opacity-100! focus-visible:opacity-100!";

// Page links carry padding instead of a flex gap so their hit areas touch — no
// dead zone between them, so sweeping across doesn't reset the hover effect.
const pageLink = `${navLink} px-4 py-2`;

// Fixed, full-width frosted-glass header. Three zones: logo left, nav centered,
// auth right. `--control` is the shared height for the logo + pill button.
// Margins from `.page-gutter`.
export function Navbar() {
	// Auth lives on the separate auth app — link out to it (marketing hosts no auth).
	const authUrl =
		process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";
	return (
		<header className="fixed inset-x-0 top-0 z-50 bg-background/60 backdrop-blur-xl backdrop-saturate-150">
			<div className="page-gutter group grid h-16 grid-cols-[1fr_auto_1fr] items-center [--control:1.5rem]">
				<a
					href="/"
					className="-ml-1.5 inline-flex w-fit items-center gap-2.5 justify-self-start rounded outline-none focus-visible:ring-2 focus-visible:ring-white/30"
				>
					<Image
						src="/logo.svg"
						alt=""
						width={250}
						height={250}
						priority
						className="h-[var(--control)] w-[var(--control)]"
					/>
					<span className="font-normal text-[13px] text-foreground uppercase tracking-[0.08em]">
						QuickEngine
					</span>
				</a>

				<nav className="-mx-4 flex items-center justify-self-center">
					{NAV_LINKS.map((link) => (
						<a key={link.href} href={link.href} className={pageLink}>
							{link.label}
						</a>
					))}
				</nav>

				<div className="flex items-center gap-4 justify-self-end">
					<a href={`${authUrl}/sign-in`} className={navLink}>
						Sign in
					</a>
					<a
						href={`${authUrl}/sign-up`}
						className="inline-flex h-8 items-center rounded-full bg-white px-5 font-medium text-[13px] text-black outline-none transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/40"
					>
						Get Started
					</a>
				</div>
			</div>
		</header>
	);
}
