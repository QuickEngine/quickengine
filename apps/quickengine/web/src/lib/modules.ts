/**
 * The module catalog, and the content of every module page.
 *
 * 🔴 THE LIST AND ITS BILLING MARKS COME FROM `internal/product/MODULES.md`, the
 * single source for what a module is and how it is charged. The pricing page
 * reads the same source; the two disagreeing is how somebody gets billed for
 * something a page called free.
 *
 * 🔴 SIXTEEN IS WHAT IS BUILT, NOT A CAP. More modules are planned. Never write
 * copy that implies the set is complete.
 *
 * 🔴 EVERY CAPABILITY BELOW IS SHIPPED. No roadmap items and no "coming soon".
 * If a module is only partly built it carries `partial`, and its own page says
 * what works — Content is the current example. A module listed beside finished
 * ones with no mark reads as finished.
 *
 * ⚠️ In a plain module, not a route file. `autoCodeSplitting` rewrites route
 * modules and may drop exports that are not part of the route contract, so a
 * value imported out of one can work in dev and vanish from a production build.
 */

export type Billing = "free" | "unlock" | "metered";

export const BILLING_LABEL: Record<Billing, string> = {
	free: "Free",
	unlock: "Unlock once",
	metered: "Metered",
};

export type Module = {
	/** URL slug. `/products/modules/<slug>` */
	slug: string;
	name: string;
	group: string;
	/** One line, used in the catalog list. */
	what: string;
	billing: Billing[];
	/** Shipped but incomplete. Says so on the catalog and on its own page. */
	partial?: boolean;

	// ── The module's own page ────────────────────────────────────────────────
	title: string;
	lede: string;
	capabilities: { name: string; what: string }[];
	/** Anything genuinely unfinished or provider-blocked. Optional, and honest. */
	caveat?: string;
	/** Modules this one leans on, by slug. */
	needs?: string[];

	/**
	 * The lowest plan that includes this module.
	 *
	 * 🔴 FROM `internal/planning/PRICING_DESIGN.md`, which decides the split:
	 * nine modules free forever, six behind a plan. That document also sets the
	 * structural rule that matters most, so it is repeated here:
	 *
	 * 🔴 REVERSAL, 2026-08-11. `PRICING_DESIGN.md` gives Free NINE modules on the
	 * argument that nobody should "hit a wall doing the thing they came for".
	 * Asher reversed that: too much value at the bottom, no reason to climb, and
	 * a population that settles on Free and Launch forever.
	 *
	 * The ladder is now four rungs with a distinct identity each:
	 *
	 *   Free   (4)  — bill somebody and get paid. Real, and obviously bounded.
	 *   Launch (+4) — a service business: propose, work, track time, invoice.
	 *   Grow   (+5) — you sell things and hand them over.
	 *   Scale  (+3) — you operate the business rather than doing the work.
	 *
	 * ⚠️ `PRICING_DESIGN.md` still carries the old nine-free split and now
	 * disagrees with this file. It has to be updated, not left as two competing
	 * sources.
	 *
	 * ⚠️ EARLIER REDISTRIBUTION, 2026-08-11. The first attempt put all six paid modules at
	 * Launch and Grow, which left **Scale adding nothing over Grow** — same
	 * modules, more capacity, no reason to buy it. The ladder now escalates by
	 * what a business is DOING rather than by how much of it there is:
	 *
	 *   Launch  — you have customers and bill for your time.
	 *   Grow    — you sell things that must be counted and shipped.
	 *   Scale   — you are running the business rather than doing the work.
	 *
	 * 🔴 This overrides the split in `internal/planning/PRICING_DESIGN.md`, which
	 * has Grow as "everything built". That document predates noticing the Scale
	 * problem and needs updating to match.
	 *
	 *   **The free nine are frozen. The list never expands.** Every module built
	 *   from here ships paid. That bounds what the free tier costs us, makes each
	 *   new module revenue, and means no existing user ever loses something they
	 *   already had.
	 *
	 * ⚠️ This is presentation only. Nothing in `packages/billing` enforces module
	 * access yet — `plans.ts` carries usage limits and no entitlements at all. A
	 * page claiming a module is gated while the API serves it to everyone is a
	 * different lie from the one we just fixed. Wire the enforcement, or say so.
	 */
	tier: "free" | "launch" | "grow" | "scale";
};

export const MODULES: Module[] = [
	// ── Foundation ──────────────────────────────────────────────────────────
	{
		slug: "clients",
		name: "Client records",
		group: "Foundation",
		tier: "free",
		what: "The shared list of people and businesses you deal with. Everything else points at it.",
		billing: ["free"],
		title: "One list everything points at.",
		lede: "Contacts and companies, with the history attached: what you quoted, what you invoiced, what you delivered.",
		capabilities: [
			{
				name: "People and companies",
				what: "Both, with addresses, and the relationships between them.",
			},
			{
				name: "The spine",
				what: "Invoices, quotes, projects, bookings and orders reference a client rather than repeating their details.",
			},
			{
				name: "No per-client fee",
				what: "Adding a customer costs nothing. It is an outcome you earned, not a billable event.",
			},
		],
	},
	{
		slug: "files",
		name: "Files & documents",
		group: "Foundation",
		tier: "free",
		what: "Versioned contracts, deliverables and assets. Attach the latest version, or pin one, to any record.",
		billing: ["free", "metered"],
		title: "Documents with a history.",
		lede: "Versioned files attached to the record they belong to, instead of a shared drive nobody maintains.",
		capabilities: [
			{
				name: "Versions, not copies",
				what: "Attach the latest version of a document, or pin a specific one, to any record.",
			},
			{
				name: "Folders and tags",
				what: "Organised how you organise, not how a filesystem forces you to.",
			},
			{
				name: "Private by default",
				what: "Stored privately and served through short-lived authorised links, never a public URL somebody can guess.",
			},
			{
				name: "Metered on bytes",
				what: "You pay for storage we actually pay for, and nothing for the act of uploading.",
			},
		],
	},
	{
		slug: "reporting",
		name: "Reporting & analytics",
		group: "Foundation",
		tier: "scale",
		what: "Revenue, operations and privacy-minimal traffic, aware of which modules you actually run.",
		billing: ["unlock"],
		title: "Numbers that match the money.",
		lede: "Read from what actually happened, and honest about the modules you do not run.",
		capabilities: [
			{
				name: "Reconciled to payments",
				what: "Revenue comes from settled payments, not from invoices you hoped would be paid.",
			},
			{
				name: "Never summed across currencies",
				what: "Figures are reported per currency. Adding them together produces a number that means nothing.",
			},
			{
				name: "Module-aware",
				what: "It does not invent a shipping report for a business that does not ship.",
			},
			{
				name: "Privacy-minimal traffic",
				what: "Enough to see what is working, without building a profile of your visitors.",
			},
		],
	},

	// ── Getting paid ────────────────────────────────────────────────────────
	{
		slug: "invoicing",
		name: "Invoicing",
		group: "Getting paid",
		tier: "free",
		what: "Draft, send and track invoices. Recurring, branding, reminders and multi-currency are the paid half.",
		billing: ["free", "unlock"],
		needs: ["clients"],
		title: "Invoices that reconcile themselves.",
		lede: "Draft, send and track. The status follows the money rather than somebody remembering to change it.",
		capabilities: [
			{
				name: "Paid when it is paid",
				what: "An invoice reaches paid when collected payments meet its total, and reverts to sent on a refund or dispute.",
			},
			{
				name: "Overpayment guarded",
				what: "You cannot collect more than the invoice is worth, or refund more than was collected.",
			},
			{
				name: "Append-only history",
				what: "What changed and when is a record, not a field that got overwritten.",
			},
			{
				name: "Sending is free",
				what: "No fee per invoice, ever. Recurring schedules, branding, reminders and multi-currency are the paid half.",
			},
		],
	},
	{
		slug: "payments",
		name: "Payments",
		group: "Getting paid",
		tier: "free",
		what: "Collect money through a provider-neutral boundary. Connecting a provider and getting paid is free.",
		billing: ["free", "unlock"],
		needs: ["invoicing"],
		title: "Take money without picking sides.",
		lede: "Stripe and PayPal behind one interface, so the provider is a setting rather than a rewrite.",
		capabilities: [
			{
				name: "Provider-neutral",
				what: "One interface, several providers. Historical settlement keeps the provider it was taken with.",
			},
			{
				name: "Idempotent capture",
				what: "A webhook a provider sends twice cannot take the money twice.",
			},
			{
				name: "One default per workspace",
				what: "Checkout uses the account you chose, and the browser cannot redirect a capture somewhere else.",
			},
			{
				name: "Refunds and disputes",
				what: "Both flow back into the invoice and the reporting rather than living in a provider dashboard.",
			},
		],
		caveat:
			"PayPal is implemented and has not been proven end to end against a live sandbox yet. Stripe is the tested path.",
	},
	{
		slug: "quotes",
		name: "Quotes & estimates",
		group: "Getting paid",
		tier: "launch",
		what: "Proposals that convert into an invoice or an order exactly once, with the totals asserted.",
		billing: ["free", "unlock"],
		needs: ["clients"],
		title: "A number that becomes the invoice.",
		lede: "Send a proposal, and when it is accepted it converts once. Nobody retypes a total.",
		capabilities: [
			{
				name: "Convert exactly once",
				what: "An accepted quote becomes an invoice or an order a single time, tracked by the record it created.",
			},
			{
				name: "Totals asserted",
				what: "The converted document has to match the quote. A mismatch is refused rather than quietly accepted.",
			},
			{
				name: "Accepted only",
				what: "A draft or rejected quote cannot be converted at all.",
			},
		],
	},

	// ── Doing the work ──────────────────────────────────────────────────────
	{
		slug: "projects",
		name: "Projects & tasks",
		group: "Doing the work",
		tier: "launch",
		what: "Client or internal projects with milestones, nested tasks, deliverables and deadlines.",
		billing: ["free", "unlock"],
		needs: ["clients"],
		title: "The work, against the client.",
		lede: "Projects with milestones, nested tasks and deadlines, attached to whoever the work is for.",
		capabilities: [
			{
				name: "Nested tasks",
				what: "Real hierarchy, not a flat list pretending to be one.",
			},
			{
				name: "Milestones and deadlines",
				what: "What has to be true by when, and what is late.",
			},
			{
				name: "Client or internal",
				what: "A project does not have to belong to somebody outside the business.",
			},
		],
	},
	{
		slug: "time",
		name: "Time tracking",
		group: "Doing the work",
		tier: "launch",
		what: "Timers and manual entries against projects, becoming approved invoice lines that cannot be billed twice.",
		billing: ["unlock"],
		needs: ["projects", "invoicing"],
		title: "Hours that become invoice lines.",
		lede: "Track against a project, approve, and bill. Nobody exports a timesheet and retypes a total.",
		capabilities: [
			{
				name: "Timers and manual entry",
				what: "Live timers, or hours added after the fact.",
			},
			{
				name: "Approved before billed",
				what: "Only approved, billable entries reach an invoice, and the currency and client have to match.",
			},
			{
				name: "Impossible to double-bill",
				what: "Enforced at two levels by a unique constraint on the source record, not by a check somebody remembered to write.",
			},
			{
				name: "Detach cleanly",
				what: "Removing an entry from a draft invoice reverses it completely.",
			},
		],
	},
	{
		slug: "bookings",
		name: "Bookings & scheduling",
		group: "Doing the work",
		tier: "scale",
		what: "Appointments across independent staff and resource lanes.",
		billing: ["unlock"],
		needs: ["clients", "products"],
		title: "Appointments that respect reality.",
		lede: "Independent schedules per person and per resource, so two things that cannot happen at once never both get booked.",
		capabilities: [
			{
				name: "Separate lanes",
				what: "Staff and resources hold their own availability. A room and the person in it are two constraints, not one.",
			},
			{
				name: "Tied to a client",
				what: "A booking belongs to somebody, and carries into invoicing without being retyped.",
			},
			{
				name: "Priced from services",
				what: "What it costs comes from your service catalog rather than a number typed at the time.",
			},
		],
	},
	{
		slug: "contracts",
		name: "Contracts & e-sign",
		group: "Doing the work",
		tier: "launch",
		what: "File-backed agreements with multiple signers, explicit consent and a revision history that cannot be edited after the fact.",
		billing: ["unlock"],
		needs: ["clients", "files"],
		title: "Agreements you can stand behind.",
		lede: "Signed by real people, backed by the file they signed, with a history nobody can quietly rewrite.",
		capabilities: [
			{
				name: "Multiple signers",
				what: "Each with their own consent and their own signature, in their own time.",
			},
			{
				name: "Explicit consent",
				what: "Recorded as an act, not implied by a checkbox somewhere on a page.",
			},
			{
				name: "Immutable revisions",
				what: "What was signed stays exactly as it was signed. A new version is a new revision.",
			},
		],
	},

	// ── Selling ─────────────────────────────────────────────────────────────
	{
		slug: "products",
		name: "Products & services",
		group: "Selling",
		tier: "grow",
		what: "Physical goods, digital goods, services, packages, rentals and real option variants with their own SKUs.",
		billing: ["free", "unlock"],
		title: "Everything you sell, priced once.",
		lede: "Goods, digital downloads, services, packages and rentals in one catalog, with variants that are real records.",
		capabilities: [
			{
				name: "Six kinds of thing",
				what: "Physical, digital, service, package, rental and variant, rather than one shape bent to fit.",
			},
			{
				name: "Concrete variants",
				what: "A size and colour is its own record with its own SKU and price, not an attribute guessed at checkout.",
			},
			{
				name: "One source of price",
				what: "Checkout, quotes, bookings and invoices all read the same catalog.",
			},
		],
	},
	{
		slug: "orders",
		name: "Orders",
		group: "Selling",
		tier: "grow",
		what: "Immutable line snapshots and a lifecycle from placement to fulfilment, tied to a client.",
		billing: ["free", "unlock"],
		needs: ["clients", "products", "fulfillment"],
		title: "The record everything hangs off.",
		lede: "What was bought, at the price it was bought for, moving through a lifecycle that other modules follow.",
		capabilities: [
			{
				name: "Immutable lines",
				what: "Line items are snapshotted at purchase. Changing a price later never rewrites what somebody paid.",
			},
			{
				name: "A real lifecycle",
				what: "Placed, paid, fulfilled, closed, and an order cannot be marked fulfilled before its delivery is.",
			},
			{
				name: "Cancellation cascades",
				what: "Cancelling reverses what it should and leaves the history intact.",
			},
		],
	},
	{
		slug: "inventory",
		name: "Inventory",
		group: "Selling",
		tier: "grow",
		what: "On-hand and reserved stock, low-stock alerts, and adjustments that leave an audit trail.",
		billing: ["unlock"],
		needs: ["products"],
		title: "Stock that holds itself.",
		lede: "On-hand and reserved counted separately, so nothing oversells while a payment is still in flight.",
		capabilities: [
			{
				name: "Reserved is not sold",
				what: "An order holds stock the moment it exists, and releases it if the order does not complete.",
			},
			{
				name: "Per variant",
				what: "Counted against the exact thing you sell, not a parent product that has three sizes.",
			},
			{
				name: "Auditable adjustments",
				what: "Every correction records who made it and why. Stock does not silently change.",
			},
			{
				name: "Low-stock alerts",
				what: "Told before you run out, on the item rather than in aggregate.",
			},
		],
	},
	{
		slug: "shipping",
		name: "Shipping",
		group: "Selling",
		tier: "scale",
		what: "Zones, flat or weight-based rates, free thresholds, split shipments, parcels and tracking.",
		billing: ["unlock", "metered"],
		needs: ["orders"],
		title: "Rates you control, deliveries you can trace.",
		lede: "Zones and rules you define, an immutable snapshot of what the customer was quoted, and parcels that can leave separately.",
		capabilities: [
			{
				name: "Deterministic zones",
				what: "Country and region zones, evaluated the same way every time.",
			},
			{
				name: "Flat, weight or value",
				what: "Rate by weight, by order value band, or a flat charge, including free over a threshold.",
			},
			{
				name: "Snapshotted at checkout",
				what: "What the customer was quoted is stored. Changing a rate later does not rewrite their order.",
			},
			{
				name: "Split shipments",
				what: "One order can leave in several parcels, each with its own tracking, and the state follows.",
			},
		],
		caveat:
			"Live carrier rating and label purchase are provider work that is not finished. Rates you define yourself are complete.",
	},
	{
		slug: "fulfillment",
		name: "Fulfilment",
		group: "Selling",
		tier: "grow",
		what: "The universal deliver-the-thing module, whatever the thing is.",
		billing: ["free"],
		title: "Deliver the thing.",
		lede: "Whatever the thing is. A parcel, a file, a booked hour, fulfilment is the module that says it happened.",
		capabilities: [
			{
				name: "Not just parcels",
				what: "A digital download and a service delivered are fulfilment too, and use the same record.",
			},
			{
				name: "Created once",
				what: "An order gets exactly one fulfilment, guaranteed by the database rather than by a check.",
			},
			{
				name: "Over-allocation blocked",
				what: "You cannot ship more of a line than the order contains.",
			},
		],
	},
	{
		slug: "content",
		name: "Content",
		group: "Selling",
		tier: "grow",
		what: "The words on your own website, edited here and read by your site through QuickConnect.",
		billing: ["free"],
		partial: true,
		title: "Edit your website's words.",
		lede: "Your developer declares the slots. You edit them here, and your own site reads them, without touching the code.",
		capabilities: [
			{
				name: "Slots your developer declared",
				what: "Grouped as they grouped them, with the label and hint they wrote.",
			},
			{
				name: "Publish per slot",
				what: "A draft stays a draft until you publish it, one slot at a time.",
			},
			{
				name: "Read by your own site",
				what: "Fetched through QuickConnect as a flat map, so the site keeps its own design entirely.",
			},
		],
		caveat:
			"This module is not finished. Editing and publishing work; repeating lists are edited as structured text for now, and more is coming.",
	},
];

export const GROUPS = [
	"Foundation",
	"Getting paid",
	"Doing the work",
	"Selling",
];

export function moduleBySlug(slug: string): Module | undefined {
	return MODULES.find((module) => module.slug === slug);
}
