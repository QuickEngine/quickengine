import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Webinars" };

// PLACEHOLDER webinars.
const WEBINARS = [
	{
		title: "Building a backend in an afternoon",
		date: "Aug 14, 2026",
		desc: "A live build: workspace to shipped API in one sitting.",
		status: "Upcoming",
	},
	{
		title: "Usage-based billing, end to end",
		date: "Jul 30, 2026",
		desc: "Metering, plans, and checkout with the Billing module.",
		status: "Watch",
	},
	{
		title: "Auth done right",
		date: "Jul 9, 2026",
		desc: "Passkeys, 2FA, and SSO without the headache.",
		status: "Watch",
	},
];

export default function WebinarsPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-24">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Webinars
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Live and recorded sessions with the team — building, deep-dives, and
						Q&amp;A.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
						{WEBINARS.map((webinar) => (
							<div
								key={webinar.title}
								className="flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
							>
								<div>
									<p className="font-display text-foreground text-lg">
										{webinar.title}
									</p>
									<p className="mt-1 text-muted-foreground text-sm">
										{webinar.desc}
									</p>
								</div>
								<div className="text-muted-foreground text-sm sm:shrink-0 sm:text-right">
									<p>{webinar.date}</p>
									<p className="text-foreground">{webinar.status}</p>
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
