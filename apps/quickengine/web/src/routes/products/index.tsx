import { createFileRoute } from "@tanstack/react-router";
import { ICE, Pill } from "@/components/pill";
import { TextPage, TextSection, textProse } from "@/components/text-page";

/**
 * The product overview.
 *
 * ⚠️ This page's job is to explain the SHAPE of QuickDash — workspace, modules,
 * one API, your own frontend — and hand off. It deliberately does not restate
 * the module list or the plan ladder; `/products/modules` and `/pricing` own
 * those, and a third copy is a third thing to keep in step.
 */

const PILLARS = [
	{
		name: "A workspace",
		what: "The boundary everything lives inside. One per business, sealed from every other, with its own data, modules, people and keys.",
		href: "/products/workspaces",
		link: "How workspaces work",
	},
	{
		name: "Modules",
		what: "Sixteen of them, all built. Clients, invoicing, payments, orders, stock, shipping, bookings, contracts, time, projects, files, reporting. Switch on what you need.",
		href: "/products/modules",
		link: "See the catalog",
	},
	{
		name: "One API",
		what: "Everything the dashboard can do, your code can do. There is no private interface we kept back, and the specification is generated from the routes themselves.",
		href: "/docs/api",
		link: "Read the contract",
	},
	{
		name: "Your own frontend",
		what: "QuickConnect bridges any site you already own to your workspace. Your design, your domain, your hosting. We never host your code.",
		href: "/docs/quickstarts",
		link: "Connect a site",
	},
];

function ProductsPage() {
	return (
		<TextPage
			title="The backend, already built."
			lede="Every business runs on the same machinery. QuickDash is that machinery, done once and configured per business rather than rebuilt per business."
		>
			<TextSection title="What it is made of">
				<div className="flex flex-col">
					{PILLARS.map((pillar) => (
						<div
							key={pillar.name}
							className="border-white/[0.07] border-b py-7 first:pt-0 last:border-b-0"
						>
							<h3
								style={{ color: ICE }}
								className="font-body font-normal text-[1rem]"
							>
								{pillar.name}
							</h3>
							<p className="mt-2.5 max-w-[64ch] font-body font-light text-[1rem] text-white/65 leading-[1.65]">
								{pillar.what}
							</p>
							<a
								href={pillar.href}
								className="mt-4 inline-block font-body font-light text-[0.875rem] text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white/70"
							>
								{pillar.link}
							</a>
						</div>
					))}
				</div>
			</TextSection>

			<TextSection title="Why one system rather than six">
				<div className={textProse}>
					<p>
						The parts are wired to each other, which is the thing a folder of
						separate tools cannot do however well each one works. Time entries
						become invoice lines that cannot be billed twice. An accepted quote
						converts exactly once. An order holds stock the moment it exists,
						and cannot be marked fulfilled before its delivery is.
					</p>
					<p>
						None of that is an integration you configure or a nightly sync you
						hope ran. There is nothing between the parts to fall out of step.
					</p>
				</div>
			</TextSection>

			<TextSection title="Writes that cannot half-happen">
				<div className={textProse}>
					<p>
						A write commits your data, its idempotency key, its audit entry and
						its outbound event in a single transaction. A retried request
						replays rather than duplicating, so a double-tapped button cannot
						become two orders and a repeated webhook cannot take payment twice.
					</p>
					<p>
						<a href="/security">The security page</a> covers the rest, including
						what we do not have yet.
					</p>
				</div>
			</TextSection>

			<TextSection title="What it costs">
				<div className={textProse}>
					<p>
						We meter what costs us real infrastructure, storage, email,
						automation, API volume. We never charge for an outcome your business
						earned: no fee per customer, no fee per invoice, no fee for creating
						a record.
					</p>
				</div>
				<div className="mt-6 flex flex-col gap-3 sm:flex-row">
					<Pill href="/pricing" variant="primary" size="lg" disc="arrow">
						See pricing
					</Pill>
					<Pill href="/business" variant="secondary" size="lg" disc="arrow">
						Find your setup
					</Pill>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/products/")({
	component: ProductsPage,
});
