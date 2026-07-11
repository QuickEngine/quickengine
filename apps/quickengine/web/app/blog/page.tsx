import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Blog" };

// PLACEHOLDER posts — a blog index. Each would link to /blog/<slug>.
const POSTS = [
	{
		title: "Introducing QuickDash",
		category: "Product",
		date: "Jul 2026",
		excerpt: "One backend for your whole business — what we built and why.",
	},
	{
		title: "Why we collapsed eight tools into one",
		category: "Engineering",
		date: "Jul 2026",
		excerpt: "The case against stitching your stack together, and what we did.",
	},
	{
		title: "Workspaces, explained",
		category: "Product",
		date: "Jun 2026",
		excerpt: "How a single recipe shapes a backend to your business type.",
	},
	{
		title: "Own your data: our stance on lock-in",
		category: "Company",
		date: "Jun 2026",
		excerpt: "It's your Postgres. Here's how we keep it that way.",
	},
	{
		title: "Metering without surprise bills",
		category: "Product",
		date: "Jun 2026",
		excerpt: "How usage-based pricing actually works on QuickEngine.",
	},
	{
		title: "Building in the open",
		category: "Company",
		date: "May 2026",
		excerpt: "Our roadmap, our changelog, and how to follow along.",
	},
];

export default function BlogPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-24">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Blog
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Product news, engineering deep-dives, and the occasional rant.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{POSTS.map((post) => (
							<div
								key={post.title}
								className="flex flex-col rounded-xl border border-border p-6"
							>
								<div className="flex items-center gap-3 text-muted-foreground text-xs">
									<span className="uppercase tracking-wider">
										{post.category}
									</span>
									<span>·</span>
									<span>{post.date}</span>
								</div>
								<h2 className="mt-3 font-display text-foreground text-xl">
									{post.title}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{post.excerpt}
								</p>
							</div>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
