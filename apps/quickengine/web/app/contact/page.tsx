import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Contact" };

// PLACEHOLDER contact routes. Emails are provisional.
const METHODS = [
	{
		title: "General",
		desc: "Questions, feedback, or just saying hi.",
		action: "hello@quickengine.xyz",
		href: "mailto:hello@quickengine.xyz",
	},
	{
		title: "Sales",
		desc: "Plans, Enterprise, and volume pricing.",
		action: "sales@quickengine.xyz",
		href: "mailto:sales@quickengine.xyz",
	},
	{
		title: "Support",
		desc: "Help with your account or a workspace.",
		action: "Visit the help center",
		href: "/support",
	},
	{
		title: "Press",
		desc: "Media, brand, and partnerships.",
		action: "press@quickengine.xyz",
		href: "mailto:press@quickengine.xyz",
	},
];

export default function ContactPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<section className="page-gutter border-border border-b py-32">
					<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
						Get in touch.
					</h1>
					<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						Pick the right door below and we'll get back to you.
					</p>
				</section>

				<section className="page-gutter py-16">
					<div className="grid gap-6 sm:grid-cols-2">
						{METHODS.map((method) => (
							<div
								key={method.title}
								className="flex flex-col rounded-xl border border-border p-6"
							>
								<h2 className="font-display text-foreground text-lg">
									{method.title}
								</h2>
								<p className="mt-2 flex-1 text-muted-foreground text-sm leading-relaxed">
									{method.desc}
								</p>
								<a
									href={method.href}
									className="mt-4 text-foreground text-sm underline-offset-4 hover:underline"
								>
									{method.action}
								</a>
							</div>
						))}
					</div>
				</section>
			</main>
			<SiteFooter />
		</>
	);
}
