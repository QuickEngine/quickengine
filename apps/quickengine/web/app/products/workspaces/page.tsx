import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../../_components/site-footer";
import { SiteHeader } from "../../_components/site-header";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

export const metadata = buildMetadata({
	title: "Workspaces",
	description:
		"QuickEngine workspaces — one backend scoped to your business type, from e-commerce to agencies to SaaS.",
	path: "/products/workspaces",
});

const POINTS = [
	{
		title: "Pick a business type",
		desc: "A workspace is scoped to how your business runs — e-commerce, agency, freelancer, SaaS — with the right modules already on.",
	},
	{
		title: "Isolated and billable",
		desc: "Each workspace is its own backend. Run one, or run many — perfect for agencies operating a workspace per client.",
	},
	{
		title: "Bring your own frontend",
		desc: "Point any frontend at one clean API and ship. Web, mobile, native — you own the interface, we run the backend.",
	},
];

export default function WorkspacesPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-32">
					<p className="text-[13px] text-muted-foreground uppercase tracking-[0.2em]">
						QuickDash
					</p>
					<h1 className="mt-6 max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						One backend, shaped to your business.
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						Workspaces are how QuickDash configures itself around the way you
						actually operate. Spin one up and the right modules are already
						running.
					</p>
					<div className="mt-10">
						<a
							href={`${AUTH_URL}/signup`}
							className="inline-flex h-11 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
						>
							Create a workspace
						</a>
					</div>
				</section>

				<section className="page-gutter py-24">
					<div className="grid gap-10 lg:grid-cols-3">
						{POINTS.map((point) => (
							<div key={point.title}>
								<h2 className="font-display text-foreground text-xl">
									{point.title}
								</h2>
								<p className="mt-3 text-muted-foreground leading-relaxed">
									{point.desc}
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
