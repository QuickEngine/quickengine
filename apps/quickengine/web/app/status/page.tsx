import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata = buildMetadata({
	title: "Status",
	description:
		"QuickEngine system status — live uptime and incident history for our services.",
	path: "/status",
});

// PLACEHOLDER — a static status board. A real one would read live health checks.
const SYSTEMS = [
	{ name: "API", uptime: "99.99%" },
	{ name: "Dashboard", uptime: "99.98%" },
	{ name: "Authentication", uptime: "100%" },
	{ name: "Webhooks", uptime: "99.97%" },
	{ name: "Storage", uptime: "99.99%" },
	{ name: "Search", uptime: "99.98%" },
];

export default function StatusPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-24">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						System status
					</h1>
					<div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border px-5 py-3">
						<span className="size-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60" />
						<span className="text-foreground">All systems operational</span>
					</div>
				</section>

				<section className="page-gutter py-16">
					<div className="mx-auto max-w-3xl divide-y divide-border overflow-hidden rounded-xl border border-border">
						{SYSTEMS.map((system) => (
							<div
								key={system.name}
								className="flex items-center justify-between px-6 py-4"
							>
								<span className="text-foreground">{system.name}</span>
								<div className="flex items-center gap-6">
									<span className="text-muted-foreground text-sm">
										{system.uptime}
									</span>
									<span className="inline-flex items-center gap-2 text-muted-foreground text-sm">
										<span className="size-2 rounded-full bg-emerald-500" />
										Operational
									</span>
								</div>
							</div>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
