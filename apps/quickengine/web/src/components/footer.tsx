import {
	faDiscord,
	faGithub,
	faInstagram,
	faLinkedin,
	faProductHunt,
	faTiktok,
	faXTwitter,
	faYoutube,
} from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Logo, STATUS_URL, StatusIndicator } from "@quickengine/ui";
import { LanguageSelector } from "@/components/language-selector";
import { GREY } from "@/components/pill";

/**
 * The front-page footer.
 *
 * Front-page only — the other marketing routes still use `site-footer.tsx`.
 *
 * ⚠️ The sitemap below is the PLANNED one, not the built one. Several routes do
 * not exist yet and will 404 until they do. That is deliberate: the footer is
 * the working list of what the marketing site owes, so a missing page is visible
 * here rather than forgotten. Every link that 404s must be built or cut before
 * launch — a dead link in the footer is the cheapest way to look unfinished.
 */
type FooterLink = { label: string; href: string; external?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
	{
		// Singular, matching the header nav — the two must not drift.
		title: "Product",
		links: [
			{ label: "Overview", href: "/products" },
			{ label: "Workspaces", href: "/products/workspaces" },
			{ label: "Modules", href: "/products/modules" },
			{ label: "Marketplace", href: "/products/marketplace" },
			{ label: "Pricing", href: "/pricing" },
		],
	},
	{
		title: "Developers",
		links: [
			{ label: "API reference", href: "/docs/api" },
			{ label: "SDKs", href: "/docs/sdks" },
			{ label: "CLI", href: "/docs/cli" },
			{ label: "Quickstarts", href: "/docs/quickstarts" },
		],
	},
	{
		title: "Business",
		links: [
			{ label: "E-commerce", href: "/business/ecommerce" },
			{ label: "Agencies", href: "/business/agencies" },
			{ label: "Freelancers", href: "/business/freelancers" },
			{ label: "SaaS", href: "/business/saas" },
			{ label: "Enterprise", href: "/business/enterprise" },
		],
	},
	{
		// ⚠️ Rebuilt from what EXISTS, 2026-08-10. Guides, Tutorials, Customers and
		// Case studies were removed — all four were placeholder shelves, and
		// between them they carried twelve links to pages that were never written.
		// What is left all resolves.
		title: "Resources",
		links: [
			{ label: "Documentation", href: "/docs" },
			{ label: "Changelog", href: "/changelog" },
			{ label: "Support", href: "/support" },
			{ label: "Community", href: "/community" },
			// Off-site: Statuspage is hosted independently so it survives an outage
			// that takes us down.
			{ label: "Status", href: STATUS_URL, external: true },
		],
	},
	{
		title: "Company",
		links: [
			{ label: "About", href: "/about" },
			{ label: "Contact", href: "/contact" },
			{ label: "Security", href: "/security" },
			{ label: "Brand", href: "/brand" },
		],
	},
	{
		title: "Legal",
		links: [
			{ label: "Terms", href: "/terms" },
			{ label: "Privacy", href: "/privacy" },
			{ label: "Cookies", href: "/cookies" },
			{ label: "Refund", href: "/refund" },
		],
	},
];

/**
 * ⚠️ `live: false` accounts are NOT rendered. They are kept here rather than
 * deleted so the set is a complete record of where QuickEngine is meant to
 * exist — a channel that is missing from the code is a channel nobody remembers
 * to launch. Flip the flag when the destination is real.
 *
 * A social icon that leads somewhere empty is worse than no icon: it is a
 * public, checkable signal that the company is not running.
 */
const SOCIALS = [
	{
		label: "X",
		href: "https://x.com/QuickEngineSW",
		icon: faXTwitter,
		live: true,
	},
	{
		label: "Instagram",
		href: "https://www.instagram.com/quickengine/",
		icon: faInstagram,
		live: true,
	},
	{
		label: "TikTok",
		href: "https://www.tiktok.com/@quickenginesoftware",
		icon: faTiktok,
		live: true,
	},
	{
		label: "YouTube",
		href: "https://www.youtube.com/channel/UCRg9n2iiE9szp2KeIvxJw9A",
		icon: faYoutube,
		live: true,
	},
	{
		// TODO: personal profile, not a company page. Swap when the org page exists.
		label: "LinkedIn",
		href: "https://www.linkedin.com/in/quickengine-software-a98a3741b/",
		icon: faLinkedin,
		live: true,
	},
	{
		label: "Product Hunt",
		href: "https://www.producthunt.com/@quickengine",
		icon: faProductHunt,
		live: true,
	},
	{
		// Held back deliberately: the repository is private and stays that way for
		// now. This is a business decision, not a missing URL.
		label: "GitHub",
		href: "https://github.com/QuickEngine",
		icon: faGithub,
		live: false,
	},
	{
		// No server exists yet. The href is a placeholder — replace it with the
		// invite link, do not ship this one as is.
		label: "Discord",
		href: "https://discord.com/",
		icon: faDiscord,
		live: false,
	},
];

export function Footer() {
	return (
		<footer className="pt-36 pb-20 site-gutter">
			{/* Mark left, sitemap right. `justify-between` does the separating, which
			    is why the grid is `w-fit`, a full-width grid would have nothing to
			    push against and the two would sit flush. */}
			<div className="flex flex-col gap-16 sm:flex-row sm:items-start sm:justify-between">
				<a href="/" aria-label="QuickEngine home" className="w-fit shrink-0">
					{/* ⚠️ Matches the header, which is the master for every mark on the
					    site. These were 28px and 24px once, nothing reveals that on one
					    screenful, and it is plain the moment you scroll from the top of
					    the page to the bottom of it. Keep the two equal. */}
					<Logo className="h-6 w-auto text-ink" />
				</a>

				{/* All six across on desktop, one row, no wrap. Text stays left-aligned
				    inside each column, the BLOCK moves right, its contents do not
				    follow it. Two columns on small screens because six of them at
				    phone width is unreadable, not because it is stacking by choice. */}
				<div className="grid grid-cols-2 gap-x-10 gap-y-12 sm:w-fit lg:grid-cols-6">
					{COLUMNS.map((column) => (
						<nav key={column.title} className="flex flex-col items-start gap-4">
							<span className="font-body font-normal text-[13px] text-white">
								{column.title}
							</span>
							{column.links.map((link) => (
								// Same asymmetric timing as the header nav — 150ms out, 300ms
								// back — so every link on the page answers the cursor the same
								// way.
								<a
									key={link.href}
									href={link.href}
									target={link.external ? "_blank" : undefined}
									rel={link.external ? "noreferrer noopener" : undefined}
									className="font-body font-light text-[13px] text-white/45 no-underline transition-colors duration-300 ease-out hover:text-white hover:duration-150 focus-visible:text-white"
								>
									{link.label}
								</a>
							))}
						</nav>
					))}
				</div>
			</div>

			{/* One row, three cells: socials, copyright, controls — all on the same
			    centre line. Three columns rather than `justify-between` because
			    `between` centres the middle item between its NEIGHBOURS, not on the
			    page, so the copyright would sit off-centre by half the difference in
			    width between the socials and the pills. */}
			<div className="mt-28 grid grid-cols-1 items-center justify-items-center gap-8 sm:grid-cols-3">
				<div className="flex flex-wrap items-center gap-5 sm:justify-self-start">
					{SOCIALS.filter((social) => social.live).map((social) => (
						<a
							key={social.label}
							href={social.href}
							aria-label={social.label}
							target="_blank"
							rel="noreferrer noopener"
							className="text-white/40 transition-colors duration-300 ease-out hover:text-white hover:duration-150 focus-visible:text-white"
						>
							<FontAwesomeIcon icon={social.icon} className="h-[17px] w-auto" />
						</a>
					))}
				</div>

				{/* The year is read at render rather than written into the string, so
				    it is correct on 1 January without anyone remembering to change
				    it. */}
				<p className="text-center font-body font-light text-[13px] text-white/40">
					© {new Date().getFullYear()} QuickEngine Software. All rights
					reserved.
				</p>

				{/* Each in its own pill, sharing the secondary button's fill and
				    height, so the two controls read as controls rather than as two
				    more bits of footer text, and match the buttons in the header. */}
				<div className="flex flex-wrap items-center gap-2 sm:justify-self-end">
					<div
						style={{ backgroundColor: GREY }}
						className="inline-flex h-8 items-center rounded-full px-4"
					>
						<StatusIndicator className="text-[13px]" />
					</div>
					<div
						style={{ backgroundColor: GREY }}
						className="inline-flex h-8 items-center rounded-full px-4"
					>
						<LanguageSelector className="text-[13px]" />
					</div>
				</div>
			</div>
		</footer>
	);
}
