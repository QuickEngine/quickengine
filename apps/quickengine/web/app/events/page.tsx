import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata = buildMetadata({
	title: "Events",
	description:
		"QuickEngine events — webinars, meetups, and launches for the community.",
	path: "/events",
});

// PLACEHOLDER events.
const EVENTS = [
	{
		name: "QuickEngine Launch Day",
		date: "Sep 3, 2026",
		location: "Online",
		desc: "The public launch, live — demos, roadmap, and Q&A.",
	},
	{
		name: "Backend Builders Meetup",
		date: "Aug 21, 2026",
		location: "Calgary, AB",
		desc: "An evening with founders building on QuickEngine.",
	},
	{
		name: "Office Hours",
		date: "Weekly",
		location: "Discord",
		desc: "Drop in, ask anything, build alongside the team.",
	},
];

export default function EventsPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-24">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Events
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Where to find us, in person and online.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
						{EVENTS.map((event) => (
							<div
								key={event.name}
								className="flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
							>
								<div>
									<p className="font-display text-foreground text-lg">
										{event.name}
									</p>
									<p className="mt-1 text-muted-foreground text-sm">
										{event.desc}
									</p>
								</div>
								<div className="text-muted-foreground text-sm sm:shrink-0 sm:text-right">
									<p className="text-foreground">{event.date}</p>
									<p>{event.location}</p>
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
