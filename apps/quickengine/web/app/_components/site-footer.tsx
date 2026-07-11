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
import { Logo } from "@quickengine/ui";
import { LanguageSelector } from "./language-selector";
import { ThemeSwitch } from "./theme-switch";

// Complete sitemap — mirrors the header's top-level nav (Products, Developers,
// Business, Resources, Company) plus Legal, with every subpage listed.
const COLUMNS = [
	{
		title: "Products",
		links: [
			{ label: "Overview", href: "/products" },
			{ label: "Workspaces", href: "/products/workspaces" },
			{ label: "Modules", href: "/products/modules" },
			{ label: "Marketplace", href: "/products/marketplace" },
			{ label: "Pricing", href: "/pricing" },
			{ label: "Changelog", href: "/changelog" },
		],
	},
	{
		title: "Developers",
		links: [
			{ label: "Documentation", href: "/docs" },
			{ label: "API reference", href: "/docs/api" },
			{ label: "SDKs", href: "/docs/sdks" },
			{ label: "CLI", href: "/docs/cli" },
			{ label: "Quickstarts", href: "/docs/quickstarts" },
			{ label: "Status", href: "/status" },
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
			{ label: "Partners", href: "/partners" },
		],
	},
	{
		title: "Resources",
		links: [
			{ label: "Blog", href: "/blog" },
			{ label: "Guides", href: "/guides" },
			{ label: "Tutorials", href: "/tutorials" },
			{ label: "Customers", href: "/customers" },
			{ label: "Support", href: "/support" },
			{ label: "Community", href: "/community" },
		],
	},
	{
		title: "Company",
		links: [
			{ label: "About", href: "/about" },
			{ label: "Careers", href: "/careers" },
			{ label: "Contact", href: "/contact" },
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

// Real handles where we have them. Placeholders flagged inline: LinkedIn is a
// personal profile until the org page exists; Instagram + Discord aren't set up
// yet (Discord username is quickengine, no server), so those URLs are guesses.
const SOCIALS = [
	{ label: "X", href: "https://x.com/QuickEngineSW", icon: faXTwitter },
	{
		label: "YouTube",
		href: "https://youtube.com/@QuickEngineSoftware",
		icon: faYoutube,
	},
	{
		label: "Product Hunt",
		href: "https://www.producthunt.com/@quickengine",
		icon: faProductHunt,
	},
	{
		// TODO: swap for the org page once created.
		label: "LinkedIn",
		href: "https://www.linkedin.com/in/quickengine-software-a98a3741b/",
		icon: faLinkedin,
	},
	{ label: "GitHub", href: "https://github.com/QuickEngine", icon: faGithub },
	{
		label: "Instagram",
		href: "https://www.instagram.com/quickengine",
		icon: faInstagram,
	},
	{
		label: "TikTok",
		href: "https://www.tiktok.com/@quickenginesoftware",
		icon: faTiktok,
	},
	{
		// TODO: swap for the invite once the server exists.
		label: "Discord",
		href: "https://discord.gg/quickengine",
		icon: faDiscord,
	},
];

const footerLink =
	"text-[13px] text-muted-foreground transition-colors hover:text-foreground";

// Site footer — anchors the bottom of every page. Top row: logo on the left,
// the full sitemap (right-aligned block, left-aligned content) on the right.
// Bottom bar: socials left, copyright centered, theme + language right.
export function SiteFooter() {
	return (
		<footer className="border-border border-t">
			<div className="page-gutter py-16">
				<div className="flex flex-col gap-12 sm:flex-row sm:items-start sm:justify-between">
					<a href="/" className="inline-flex w-fit items-center">
						<Logo className="size-6 text-foreground" />
					</a>

					<div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:w-fit sm:grid-cols-3 sm:gap-x-16 lg:grid-cols-6">
						{COLUMNS.map((column) => (
							<nav key={column.title} className="flex flex-col gap-3">
								<span className="text-[13px] text-foreground">
									{column.title}
								</span>
								{column.links.map((link) => (
									<a key={link.href} href={link.href} className={footerLink}>
										{link.label}
									</a>
								))}
							</nav>
						))}
					</div>
				</div>

				{/* Bottom bar: socials left · copyright center · theme + language right */}
				<div className="mt-16 grid grid-cols-1 items-center justify-items-center gap-6 sm:grid-cols-3">
					<div className="flex flex-wrap items-center gap-4 sm:justify-self-start">
						{SOCIALS.map((social) => (
							<a
								key={social.label}
								href={social.href}
								aria-label={social.label}
								target="_blank"
								rel="noreferrer noopener"
								className="text-muted-foreground transition-colors hover:text-foreground"
							>
								<FontAwesomeIcon icon={social.icon} className="h-4 w-auto" />
							</a>
						))}
					</div>

					<p className="text-center text-[13px] text-muted-foreground sm:justify-self-center">
						© {new Date().getFullYear()} QuickEngine Software. All rights
						reserved.
					</p>

					<div className="flex items-center gap-4 sm:justify-self-end">
						<ThemeSwitch />
						<LanguageSelector />
					</div>
				</div>
			</div>
		</footer>
	);
}
