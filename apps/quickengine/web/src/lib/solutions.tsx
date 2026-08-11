import { TextSection, textProse } from "@/components/text-page";

/**
 * The business-type content, in a plain module rather than in the route file.
 *
 * 🔴 It lived in `routes/business/$type.tsx` and was imported from
 * `routes/business/index.tsx`. That is fragile: `autoCodeSplitting` rewrites
 * route modules and is entitled to drop anything that is not part of the route
 * contract, so a value imported out of one can be present in dev and missing
 * from a production build.
 *
 * A route file should export a route. Shared data belongs somewhere neither page
 * owns.
 */

type Solution = {
	name: string;
	title: string;
	lede: string;
	/** Real modules, in the order this kind of business meets them. */
	modules: { name: string; why: string }[];
	body: React.ReactNode;
};

export const SOLUTIONS: Record<string, Solution> = {
	ecommerce: {
		name: "E-commerce",
		title: "Sell from the site you already have.",
		lede: "Keep the storefront you designed. Put orders, stock, payments and shipping behind it, in one place that agrees with itself.",
		modules: [
			{ name: "Products", why: "Your catalog, priced and described once." },
			{
				name: "Inventory",
				why: "Stock that reserves itself the moment an order exists.",
			},
			{ name: "Orders", why: "The record everything else hangs off." },
			{ name: "Payments", why: "Card or transfer, captured idempotently." },
			{ name: "Shipping", why: "Rates, labels and tracking." },
			{ name: "Fulfilment", why: "What has actually left the building." },
		],
		body: (
			<TextSection title="Why it holds together">
				<div className={textProse}>
					<p>
						Stock is held the moment an order is placed, so nothing oversells
						while a payment is still in flight. The capture is idempotent, so a
						webhook a provider sends twice cannot take the money twice. The
						invoice is issued from the order that earned it, with the lines
						already filled in.
					</p>
					<p>
						None of that is an integration you configure. It is one system, so
						there is nothing between the parts to fall out of sync.
					</p>
				</div>
			</TextSection>
		),
	},

	agencies: {
		name: "Agencies",
		title: "Pitch to invoice, in one thread.",
		lede: "Client work is a chain: quote, contract, project, hours, invoice. Break it across five tools and you spend your margin reconciling them.",
		modules: [
			{
				name: "Client records",
				why: "Everyone you work with, and their history.",
			},
			{
				name: "Quotes & estimates",
				why: "What you proposed, and what they accepted.",
			},
			{
				name: "Contracts & e-sign",
				why: "Signed, stored, and attached to the client.",
			},
			{ name: "Projects & tasks", why: "The work itself." },
			{
				name: "Time tracking",
				why: "Hours against the project that used them.",
			},
			{
				name: "Invoicing",
				why: "Billed from the hours, not retyped from them.",
			},
		],
		body: (
			<TextSection title="The part that usually leaks">
				<div className={textProse}>
					<p>
						Hours are logged against a project, and the invoice is raised from
						those hours. Nobody exports a timesheet, nobody retypes a total, and
						the number on the invoice can be traced back to the day it was
						worked.
					</p>
					<p>
						You are not charged per client or per invoice. An agency that
						doubles its client list does not double its software bill.
					</p>
				</div>
			</TextSection>
		),
	},

	freelancers: {
		name: "Freelancers",
		title: "The business half, without a second job.",
		lede: "You already do the work. This is the paperwork around it, in one place, without a subscription for each part.",
		modules: [
			{ name: "Client records", why: "Who they are and what you agreed." },
			{
				name: "Quotes & estimates",
				why: "Send a number that becomes the invoice.",
			},
			{ name: "Contracts & e-sign", why: "Signed before the work starts." },
			{ name: "Time tracking", why: "If you bill by the hour." },
			{ name: "Invoicing", why: "Issued, sent and chased." },
			{
				name: "Files",
				why: "Deliverables and paperwork, kept with the client.",
			},
		],
		body: (
			<TextSection title="What it costs you">
				<div className={textProse}>
					<p>
						Nothing per invoice, nothing per client. Most freelance tools charge
						by the number of clients you have or take a slice of what you bill,
						which is a fee for getting busier.
					</p>
					<p>
						We charge for infrastructure we actually pay for, storage, email,
						automation. Sending an invoice is free, and it is going to stay
						free.
					</p>
				</div>
			</TextSection>
		),
	},

	saas: {
		name: "SaaS",
		title: "The back office you did not build.",
		lede: "You built the product. The customer records, billing history, documents and reporting around it are the part nobody wants to build twice.",
		modules: [
			{ name: "Client records", why: "Accounts and the humans in them." },
			{ name: "Payments", why: "What was charged, captured and refunded." },
			{
				name: "Invoicing",
				why: "Documents your customers can produce at audit.",
			},
			{ name: "Files", why: "Contracts, exports and anything you generate." },
			{ name: "Reporting", why: "Reconciled to real payments, per currency." },
		],
		body: (
			<TextSection title="Reachable from your code">
				<div className={textProse}>
					<p>
						Everything is one documented API, and everything the dashboard can
						do your code can do, there is no private interface we kept back.
						Writes take an idempotency key, and outbound webhooks are signed so
						you can verify a delivery came from us.
					</p>
					<p>
						<a href="/docs">The documentation</a> covers the client for both the
						browser and your server.
					</p>
				</div>
			</TextSection>
		),
	},

	trades: {
		name: "Trades & services",
		title: "Booked, done, invoiced.",
		lede: "Work that happens at somebody else's address. The job gets booked, the work gets done, the invoice follows it, without a clipboard in between.",
		modules: [
			{ name: "Bookings", why: "The appointment, and who is taking it." },
			{
				name: "Client records",
				why: "Addresses, history, and what you did last time.",
			},
			{
				name: "Quotes & estimates",
				why: "Priced before the visit, accepted in writing.",
			},
			{ name: "Products & services", why: "Rates and parts, priced once." },
			{ name: "Invoicing", why: "Raised from the job, not from memory." },
			{
				name: "Files",
				why: "Photos, certificates and paperwork against the job.",
			},
		],
		body: (
			<TextSection title="Built around the visit">
				<div className={textProse}>
					<p>
						The booking is the record. The quote, the parts used, the photos and
						the invoice all attach to it, so the job has one history rather than
						being reconstructed later from a calendar and a notebook.
					</p>
					<p>
						No fee per job and no fee per invoice. A busier month costs you the
						same as a quiet one.
					</p>
				</div>
			</TextSection>
		),
	},

	enterprise: {
		name: "Enterprise",
		title: "What exists today, and what does not.",
		lede: "We would rather lose you here than during procurement. This is an accurate account of where QuickDash stands for a larger organisation.",
		modules: [
			{
				name: "Custom roles",
				why: "Define roles by any name, with any permission set.",
			},
			{ name: "Audit", why: "Every write records who did it and when." },
			{
				name: "Reporting",
				why: "Reconciled figures, never summed across currencies.",
			},
		],
		body: (
			<>
				<TextSection title="What is real">
					<div className={textProse}>
						<p>
							Workspace isolation is enforced in the API and proven on every
							build by tests that attack each route with another tenant's
							credentials. Writes are transactional and audited. Provider
							credentials are encrypted at rest. Full detail is on{" "}
							<a href="/security">the security page</a>.
						</p>
						<p>
							Roles are not fixed tiers. An organisation defines its own, with
							whatever permissions it decides, enforced server-side.
						</p>
					</div>
				</TextSection>

				<TextSection title="What does not exist yet">
					<div className={textProse}>
						<ul>
							<li>
								<strong>No SSO or SAML.</strong> It is designed for and it is
								not built. Sign-in today is email code, Google, GitHub or a
								passkey.
							</li>
							<li>
								<strong>No SOC 2 or ISO 27001.</strong> Neither has been
								started.
							</li>
							<li>
								<strong>No contractual SLA.</strong> Status is published; there
								is no uptime guarantee behind it.
							</li>
							<li>
								<strong>No dedicated or on-premise deployment.</strong>
							</li>
						</ul>
						<p>
							If your review requires any of those today, we are not the right
							fit yet. Tell us which ones and we will tell you honestly whether
							they are close.
						</p>
					</div>
				</TextSection>
			</>
		),
	},
};
