import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata = buildMetadata({
	title: "Resources",
	description:
		"QuickEngine resources — guides, tutorials, customer stories, and more to help you build.",
	path: "/resources",
});

// PLACEHOLDER — copy is provisional; several targets don't exist as pages yet.
const GROUPS = [
	{
		title: "Learn",
		items: [
			{
				label: "Blog",
				desc: "Product news, engineering deep-dives, and the occasional rant.",
				href: "/blog",
			},
			{
				label: "Guides",
				desc: "Step-by-step walkthroughs for the most common builds.",
				href: "/guides",
			},
			{
				label: "Tutorials",
				desc: "Short, focused how-tos for a specific task.",
				href: "/tutorials",
			},
			{
				label: "Webinars",
				desc: "Live and recorded sessions with the team.",
				href: "/webinars",
			},
		],
	},
	{
		title: "Proof",
		items: [
			{
				label: "Customers",
				desc: "Businesses already building on QuickEngine.",
				href: "/customers",
			},
			{
				label: "Case studies",
				desc: "How real teams ship faster on one backend.",
				href: "/case-studies",
			},
			{
				label: "Events",
				desc: "Where to find us, in person and online.",
				href: "/events",
			},
		],
	},
	{
		title: "Help",
		items: [
			{
				label: "Support",
				desc: "Get answers from our team.",
				href: "/support",
			},
			{
				label: "Community",
				desc: "Join the Discord and build alongside others.",
				href: "/community",
			},
			{ label: "Contact", desc: "Talk to a human.", href: "/contact" },
		],
	},
];

export default function ResourcesPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				{/* Hero */}
				<section className="page-gutter flex flex-col items-center border-border border-b py-32 text-center">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Resources
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Everything you need to build, learn, and get help — in one place.
					</p>
				</section>

				{/* Groups */}
				{GROUPS.map((group) => (
					<section
						key={group.title}
						className="page-gutter border-border border-b py-24"
					>
						<h2 className="font-display font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
							{group.title}
						</h2>
						<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{group.items.map((item) => (
								<a
									key={item.label}
									href={item.href}
									className="rounded-xl border border-border p-6 transition-colors hover:bg-foreground/5"
								>
									<h3 className="font-display text-foreground text-lg">
										{item.label}
									</h3>
									<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
										{item.desc}
									</p>
								</a>
							))}
						</div>
					</section>
				))}
			</main>
			<SiteFooter />
		</>
	);
}
