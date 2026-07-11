import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Tutorials" };

// PLACEHOLDER — short, task-focused how-tos.
const TUTORIALS = [
	{
		title: "Send a welcome email on signup",
		desc: "Trigger a transactional email from an auth event.",
		time: "10 min",
	},
	{
		title: "Build a booking flow",
		desc: "Scheduling + payments for an appointments app.",
		time: "20 min",
	},
	{
		title: "Add a customer portal",
		desc: "Let users manage their own subscription.",
		time: "15 min",
	},
	{
		title: "Export a workspace",
		desc: "Pull all your data out — no lock-in.",
		time: "8 min",
	},
	{
		title: "Set up webhooks",
		desc: "React to events inside your own systems.",
		time: "12 min",
	},
	{
		title: "Migrate from your old stack",
		desc: "Move auth, billing, and storage over.",
		time: "30 min",
	},
];

export default function TutorialsPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-24">
					<h1 className="font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Tutorials
					</h1>
					<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Short, focused how-tos for a specific task.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{TUTORIALS.map((tutorial) => (
							<div
								key={tutorial.title}
								className="flex flex-col rounded-xl border border-border p-6"
							>
								<h2 className="font-display text-foreground text-lg">
									{tutorial.title}
								</h2>
								<p className="mt-2 flex-1 text-muted-foreground text-sm leading-relaxed">
									{tutorial.desc}
								</p>
								<span className="mt-4 text-muted-foreground text-xs">
									{tutorial.time}
								</span>
							</div>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
