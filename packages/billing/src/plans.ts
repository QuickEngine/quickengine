import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for plans.
//
// ⚠️ Tier NAMES are placeholders (subject to change) and PRICES are TBD. Rename a
// tier or wire a price by editing THIS file only — nothing else hardcodes tier
// names. Amounts never live in code: each paid tier points at a Stripe price via
// an env var (STRIPE_PRICE_<PLAN>_<CYCLE>), so prices are set in Stripe and can
// change without a code change. Any of these env vars may be unset pre-launch.
// ─────────────────────────────────────────────────────────────────────────────

// 🔴 REVISED 2026-09-06. Two axes, and keeping them separate is the whole design.
//
//  1. **The boolean gate decides free or paid.** Is there a second party on this
//     workspace's orders: a supplier, a fulfiller, a partner who gets paid. It
//     unlocks on the CHEAPEST paid tier on purpose, because the gate's job is to
//     convert free into paying, and putting it higher only buys hesitation.
//  2. **Volume decides how much you pay once you are paying.** A solo merchant
//     with one supplier must not pay what a twenty seat operation pays. An
//     earlier draft of this file had a single paid price and called it
//     simplicity; it was mispricing.
//
// ⚠️ **Free is feature complete and volume tight**, which is a deliberate change
// from "free is the entire single merchant system". That version had exactly one
// upgrade trigger, so a happy solo merchant never paid anything, ever. This one
// has two: you took on a second party, or you outgrew the volume.
//
// 🔴 **`aiActions` is the one number that cannot be generous.** Every other limit
// spends our own infrastructure at roughly $0.0001 a request, which is close
// enough to free at this scale. An AI action buys tokens from a third party at
// roughly thirty times that. Free gets 25: enough for a few meaningful tasks, not
// enough to work in it all day on somebody else's money.
//
// Per-plan usage limits. Metered PER ACCOUNT (one budget shared across all the
// account's workspaces). `actions` is a COUNTER (an allowance that refills each
// billing period); the rest are GAUGES (a current-total cap that never resets).
// `null` = unlimited. ⚠️ These numbers are PLACEHOLDERS, like prices — tune here.
export type PlanLimits = {
	/**
	 * Counter: included API requests per billing period.
	 *
	 * Separate from `aiActions` because they are different costs to us. A request
	 * consumes our own infrastructure — a function invocation, database compute, a
	 * connection — at roughly $0.0001. An AI action buys tokens from Anthropic at
	 * roughly $0.003, some thirty times more. One shared allowance could be spent
	 * either way, so the same number on a pricing page would mean wildly different
	 * cost to us and could not be priced honestly.
	 */
	apiRequests: number | null;
	/**
	 * Counter: included AI operations per billing period.
	 *
	 * An AI-triggered request increments **both** meters, and that is correct
	 * rather than double-billing: it genuinely consumes our infrastructure *and*
	 * a third party's, the same way a file upload consumes a request and storage.
	 */
	aiActions: number | null;
	/**
	 * Counter: orders placed this billing period.
	 *
	 * 🔴 A CEILING, never a fee, and the distinction is the whole of hard rule 7.
	 * Passing it does not produce a charge per order, an invoice line, or a cent
	 * of usage billing: `OVERAGE.ordersPerMonth` is `null` and must stay `null`.
	 * It means "this plan is no longer the right plan", the same way running out
	 * of workspaces does. We never bill a business outcome the customer earned.
	 *
	 * ⚠️ It exists because the alternative was worse. Metering only API, storage
	 * and AI let a real shop run on Free forever: a single merchant doing steady
	 * retail never comes near 25k requests, so nothing ever asked them to pay.
	 * Orders is the one number that tracks whether this is somebody's actual
	 * business rather than somebody trying it out.
	 */
	ordersPerMonth: number | null;
	/**
	 * Counters: the business records each module exists to create.
	 *
	 * 🔴 Every module, not just commerce. Capping orders and products alone meant
	 * a consultancy running bookings, invoices, contracts and time tracking hit
	 * NO limit and paid nothing forever, while an identical-sized shop paid.
	 * That is not a free tier, it is a free tier for everyone except the one
	 * business type we most want as a customer.
	 *
	 * ⚠️ Same rule as orders throughout: capped and priced on FREE ONLY, uncapped
	 * and unpriced on every plan somebody pays for. A paying customer is never
	 * charged for the work they did.
	 */
	bookingsPerMonth: number | null;
	invoicesPerMonth: number | null;
	contractsPerMonth: number | null;
	quotesPerMonth: number | null;
	projectsPerMonth: number | null;
	timeEntriesPerMonth: number | null;
	shipmentsPerMonth: number | null;
	clientsPerMonth: number | null;
	/**
	 * Gauge: products currently listed for sale.
	 *
	 * The catalog-side twin of `ordersPerMonth`, and the same rule applies: a
	 * ceiling, never a fee. A tester lists a handful; a real shop lists hundreds.
	 * Katana caps its free tier the same way, at roughly thirty SKUs.
	 */
	activeProducts: number | null;
	/** Gauge: total bytes stored across the account. */
	storageBytes: number | null;
	/** Gauge: team members. */
	seats: number | null;
	/** Gauge: number of workspaces. */
	workspaces: number | null;
	/**
	 * Counter: outbound webhook attempts, retries included.
	 *
	 * ⚠️ `null` on every tier today — **counted, not capped.** The allowance rule
	 * in `STEP_9_AUDIT.md` is that an included amount must be predictable to a
	 * customer, and nobody can predict a number nobody has measured. Real volume
	 * comes first; the limits come after.
	 */
	webhookDeliveries: number | null;
};

/**
 * What a plan UNLOCKS, as opposed to how much of it you get.
 *
 * 🔴 Deliberately a short list of capabilities rather than a plan-by-module
 * matrix. Every module is available on every tier: a business running on its own
 * gets the whole single-merchant system for nothing, because none of it costs us
 * anything to run and a crippled free tier teaches people the product is mean.
 *
 * The line is drawn where the work actually is. `second-party` covers suppliers,
 * purchase orders and partner payouts — the settlement machinery that decides who
 * is owed what when somebody other than the merchant is involved. That is the
 * expensive thing to build, the hard thing to replace, and the point at which a
 * business is making enough money to have partners.
 *
 * ⚠️ Add a capability here only when it names a real cost or a real boundary. A
 * matrix of fifteen module toggles is how pricing pages become unreadable.
 */
export type PlanCapability = "second-party";

export type PlanDefinition = {
	id: QuickEnginePlanId;
	/** Display label — a placeholder, safe to rename. */
	displayName: string;
	/** True for the default no-cost tier (no Stripe price). */
	free: boolean;
	/** Env var names holding the Stripe price IDs, by billing cycle. */
	priceEnv: Partial<Record<QuickEngineBillingCycle, string>>;
	/**
	 * Usage caps for this tier.
	 *
	 * ⚠️ For a plan with `perSeat: true` these are the allowances **per seat**,
	 * not the account total. Always read them through `getPlanLimits`, which
	 * multiplies; reading `.limits` directly would silently apply one seat's
	 * worth to an entire company.
	 */
	limits: PlanLimits;
	/**
	 * Capabilities unlocked, beyond the numeric allowances above.
	 *
	 * Absent means none. `free` deliberately has none.
	 */
	capabilities?: readonly PlanCapability[];
	/** True when `limits` are per seat and scale with the billed quantity. */
	perSeat?: boolean;
	/**
	 * Internal tier — assigned by hand, never sold.
	 *
	 * Anything that shows a customer what they can buy must read
	 * `SELLABLE_PLANS`, not `PLANS`. Filtering at each call site instead would
	 * mean every new pricing surface is one forgotten `.filter()` away from
	 * advertising a free unlimited plan.
	 */
	internal?: boolean;
};

const GB = 1024 ** 3;

const priceEnvKey = (plan: string, cycle: QuickEngineBillingCycle): string =>
	`STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`;

const paidPlan = (
	id: QuickEnginePlanId,
	displayName: string,
	limits: PlanLimits,
): PlanDefinition => ({
	id,
	displayName,
	free: false,
	priceEnv: {
		monthly: priceEnvKey(id, "monthly"),
		annual: priceEnvKey(id, "annual"),
	},
	limits,
	// Every paid tier settles with a second party. That is what paying buys.
	capabilities: ["second-party"],
});

export const PLANS: readonly PlanDefinition[] = [
	{
		id: "free",
		// "Free", not "Solo". Solo implies a plan somebody chose; this is the floor
		// everyone starts on, and naming it honestly matters more now that it is
		// a metered tier rather than a walled one.
		displayName: "Free",
		free: true,
		priceEnv: {},
		limits: {
			apiRequests: 25_000,
			aiActions: 25,
			// 🔴 The two walls that make Free a place you TRY the product rather
			// than a place you run a business from forever.
			//
			// ⚠️ 25, lowered from 40 on external review before any of this shipped.
			// Forty is still a soft month for a shop doing any consistent volume,
			// and starting too high is the exact failure being escaped: a limit
			// nobody reaches never asks anybody to pay. Twenty-five leaves a
			// tester, a side project or a quiet month working, and a real shop
			// meets it inside a month or two. Raise it later WITH DATA; there is
			// none today.
			ordersPerMonth: 25,
			activeProducts: 25,
			bookingsPerMonth: 25,
			invoicesPerMonth: 25,
			contractsPerMonth: 25,
			quotesPerMonth: 25,
			projectsPerMonth: 25,
			timeEntriesPerMonth: 25,
			shipmentsPerMonth: 25,
			clientsPerMonth: 25,
			storageBytes: 2 * GB,
			seats: 1,
			workspaces: 1,
			webhookDeliveries: null,
		},
	},
	// 🔴 THE rung. Everything below it is the free single merchant system;
	// everything above is the same product with more room. Priced against Cin7
	// Core Standard ($349/month for five users of inventory alone) and Katana
	// Core ($299), NOT against Shopify. Two earlier drafts anchored on Shopify's
	// $39 to $105 storefront tiers and landed at $25 to $75, which `DECISIONS.md`
	// had already rejected in writing before either was written.
	paidPlan("commerce", "Commerce", {
		apiRequests: 1_000_000,
		aiActions: 1_500,
		// Uncapped from here up. The ceiling was never the product.
		ordersPerMonth: null,
		activeProducts: null,
		bookingsPerMonth: null,
		invoicesPerMonth: null,
		contractsPerMonth: null,
		quotesPerMonth: null,
		projectsPerMonth: null,
		timeEntriesPerMonth: null,
		shipmentsPerMonth: null,
		clientsPerMonth: null,
		storageBytes: 100 * GB,
		seats: 5,
		workspaces: 3,
		webhookDeliveries: null,
	}),
	// ⚠️ RETIRED 2026-09-06. Kept ONLY until stored rows are migrated (launch to
	// commerce, grow to scale). Never shown, never sold, no Stripe price. They
	// stay so an existing subscription still resolves to real limits instead of
	// silently falling back to Free, which is what deleting them early would do.
	paidPlan("launch", "Launch", {
		apiRequests: 250_000,
		aiActions: 500,
		// Retired, and never capped when sold. Leave them uncapped.
		ordersPerMonth: null,
		activeProducts: null,
		bookingsPerMonth: null,
		invoicesPerMonth: null,
		contractsPerMonth: null,
		quotesPerMonth: null,
		projectsPerMonth: null,
		timeEntriesPerMonth: null,
		shipmentsPerMonth: null,
		clientsPerMonth: null,
		storageBytes: 25 * GB,
		seats: 3,
		workspaces: 2,
		webhookDeliveries: null,
	}),
	paidPlan("grow", "Grow", {
		apiRequests: 1_000_000,
		aiActions: 2_500,
		// Retired, and never capped when sold. Leave them uncapped.
		ordersPerMonth: null,
		activeProducts: null,
		bookingsPerMonth: null,
		invoicesPerMonth: null,
		contractsPerMonth: null,
		quotesPerMonth: null,
		projectsPerMonth: null,
		timeEntriesPerMonth: null,
		shipmentsPerMonth: null,
		clientsPerMonth: null,
		storageBytes: 150 * GB,
		seats: 8,
		workspaces: 5,
		webhookDeliveries: null,
	}),
	paidPlan("scale", "Scale", {
		apiRequests: 5_000_000,
		aiActions: 6_000,
		ordersPerMonth: null,
		activeProducts: null,
		bookingsPerMonth: null,
		invoicesPerMonth: null,
		contractsPerMonth: null,
		quotesPerMonth: null,
		projectsPerMonth: null,
		timeEntriesPerMonth: null,
		shipmentsPerMonth: null,
		clientsPerMonth: null,
		storageBytes: 500 * GB,
		seats: 15,
		workspaces: 10,
		webhookDeliveries: null,
	}),
	// 🔴 Teams is the only PER-SEAT tier. Launch, Grow and Scale are flat prices
	// with a seat ceiling; Teams bills $30 x quantity, where the quantity IS the
	// member count. `seats: null` therefore means "not a ceiling" here, not
	// "unlimited and free" — every seat is charged, the opposite of what that
	// value means on every other row. Read it together with `TEAMS_MIN_SEATS`.
	{
		id: "teams",
		// Stored id stays `teams`; only the label changed. The ladder is a verb of
		// progression at every other rung — Launch, Grow, Scale — and "Teams" was a
		// noun describing who is on it, which broke the rhythm at the top.
		displayName: "Expand",
		free: false,
		priceEnv: {
			monthly: priceEnvKey("teams", "monthly"),
			annual: priceEnvKey("teams", "annual"),
		},
		capabilities: ["second-party"],
		perSeat: true,
		limits: {
			// PER SEAT, not per account. At the 16 seat floor this is 8M requests,
			// 16k AI actions and 1.6 TB, against Scale's 5M / 5k / 500 GB, because
			// moving UP a tier must never cost a customer capacity.
			//
			// 🔴 An 8 seat floor was proposed on 2026-09-06 and REJECTED: 500k x 8 is
			// 4M, which is LESS than Scale's 5M, so the upgrade would have taken a
			// million requests away. The invariant test caught it. It also priced
			// Expand at $392 against Scale's $349, which is pure arbitrage and would
			// have meant nobody rational ever bought Scale.
			apiRequests: 500_000,
			aiActions: 1_500,
			// Uncapped, and NOT scaled per seat: a ceiling that grew with the team
			// would be meaningless, and there is no ceiling above Commerce anyway.
			ordersPerMonth: null,
			activeProducts: null,
			bookingsPerMonth: null,
			invoicesPerMonth: null,
			contractsPerMonth: null,
			quotesPerMonth: null,
			projectsPerMonth: null,
			timeEntriesPerMonth: null,
			shipmentsPerMonth: null,
			clientsPerMonth: null,
			storageBytes: 100 * GB,
			// Not a ceiling. Every seat is billed, so there is nothing to cap.
			seats: null,
			workspaces: null,
			webhookDeliveries: null,
		},
	},
	// 🔴 INTERNAL. `enterprise` is the STORED id for what the ladder calls
	// "Custom" — see the note on `QuickEnginePlanId`. Custom is a conversation,
	// not self-serve checkout, so it carries no price and never appears in a
	// pricing list.
	//
	// It needs an entry all the same. `getPlanLimits` falls back to `PLANS[0]`
	// for an unknown id, and `PLANS[0]` is Free — so without this row the first
	// real Custom customer would silently be enforced at 10,000 requests and one
	// seat. The largest account on the smallest allowance.
	//
	// Limits are unlimited because they are agreed in the contract, not in code.
	// AI stays capped for the same reason as Bypass: the Anthropic pool is
	// prepaid and shared, so no tier gets an infinite claim on it.
	{
		id: "enterprise",
		displayName: "Custom",
		free: false,
		internal: true,
		priceEnv: {},
		limits: {
			apiRequests: null,
			aiActions: 100_000,
			ordersPerMonth: null,
			activeProducts: null,
			bookingsPerMonth: null,
			invoicesPerMonth: null,
			contractsPerMonth: null,
			quotesPerMonth: null,
			projectsPerMonth: null,
			timeEntriesPerMonth: null,
			shipmentsPerMonth: null,
			clientsPerMonth: null,
			storageBytes: null,
			seats: null,
			workspaces: null,
			webhookDeliveries: null,
		},
	},

	// 🔴 INTERNAL. Never sold, never listed, assigned by hand — for the team,
	// for family and friends, and for testing against real limits without
	// hitting them.
	//
	// `free: true` because there is no Stripe price and no checkout path; it is
	// not a tier anyone can reach. Filter it out of any pricing UI by id.
	//
	// ⚠️ `aiActions` is CAPPED, and generously rather than infinitely, which is
	// the one number here that is not an oversight. Anthropic is PREPAID from a
	// pool shared by every customer, so the failure mode is not an unpaid bill —
	// it is the pool emptying and AI breaking for paying customers at the same
	// moment. An unmetered internal tier handed to friends and family is exactly
	// the shape of that accident. Everything that costs us only our own
	// infrastructure is genuinely unlimited.
	{
		id: "bypass",
		displayName: "Bypass",
		free: true,
		internal: true,
		priceEnv: {},
		limits: {
			apiRequests: null,
			aiActions: 25_000,
			ordersPerMonth: null,
			activeProducts: null,
			bookingsPerMonth: null,
			invoicesPerMonth: null,
			contractsPerMonth: null,
			quotesPerMonth: null,
			projectsPerMonth: null,
			timeEntriesPerMonth: null,
			shipmentsPerMonth: null,
			clientsPerMonth: null,
			storageBytes: null,
			seats: null,
			workspaces: null,
			webhookDeliveries: null,
		},
	},
] as const;

/**
 * The plans a customer may actually be shown or sold.
 *
 * `PLANS` is the full ladder including internal tiers, and is what enforcement
 * and lookups read — an account ON `bypass` still has to resolve its limits.
 * Anything customer-facing reads this instead.
 */
export const SELLABLE_PLANS: readonly PlanDefinition[] = PLANS.filter(
	(plan) => !plan.internal,
);

/**
 * The smallest Teams subscription that can be bought.
 *
 * 16 because Scale caps at 15, so the ladder is continuous: no headcount that
 * two tiers both serve, none that neither does.
 *
 * It is a usability guard, not a pricing control. At $30 a seat Teams is never
 * cheaper than the flat tier already serving the same headcount, so nothing
 * breaks if this is bypassed — a customer would simply be paying more than they
 * need to. An earlier $25 was rejected precisely because it made this floor
 * load-bearing. See DECISIONS.md, 2026-08-01.
 *
 * Enforced here because Stripe has no concept of a minimum quantity.
 */
export const TEAMS_MIN_SEATS = 16;

/** True when the plan bills per seat rather than at a flat rate. */
export const isPerSeatPlan = (id: QuickEnginePlanId): boolean => id === "teams";

/**
 * How many seats a per-seat subscription should be billed for.
 *
 * Never fewer than the floor, so a team that drops to 12 members keeps a valid
 * subscription rather than one Stripe would price below the tier's entry point.
 */
export const billableSeats = (memberCount: number): number =>
	Math.max(TEAMS_MIN_SEATS, memberCount);

/** The meters the engine tracks. */
export type MeterKey = keyof PlanLimits;

/** Which meters refill each period (counters) vs. are a current total (gauges). */
/**
 * What one unit past the included allowance costs, in cents.
 *
 * 🔴 Two different reasons a meter is priced, and keeping them apart is the
 * whole design.
 *
 * **Things that cost us money** are billed on EVERY plan: API requests, AI
 * actions, storage. Recovering a cost is not the same as taxing success.
 *
 * **Things that cost us nothing** are billed on FREE ONLY, and never on a plan
 * somebody pays for. Orders and products cost us nothing to hold, so on a paid
 * tier they carry no price at all: that is what keeps "we take 0% of your
 * sales" true for every paying customer. On free they are priced because the
 * alternative is worse. Blocking a shop mid-month teaches them the product is
 * unreliable; letting them keep trading and pay for what they use turns the
 * free tier into a ramp toward Commerce instead of a wall in front of it.
 *
 * ⚠️ This narrows hard rule 7 rather than breaking it. The rule exists so
 * nobody is charged for the business they built; a paying customer never is.
 * A free account is choosing to keep operating past a limit, and the price is
 * what makes that choice available at all.
 *
 * ⚠️ Priced per BLOCK, not per unit, because a bill that reads "$1.00 per 10,000
 * requests" is one a customer can predict and "$0.0001 per request" is one they
 * have to do arithmetic on. `null` means the meter is counted and capped but
 * never charged.
 */
export type OveragePrice = {
	/** How many units one charge covers. */
	blockSize: number;
	/** Cents per block. */
	cents: number;
};

export const OVERAGE: Record<MeterKey, OveragePrice | null> = {
	apiRequests: { blockSize: 10_000, cents: 100 },
	aiActions: { blockSize: 100, cents: 200 },
	// 🔴 Storage is the one gauge that IS charged, because it is the only cost
	// that recurs for as long as the bytes exist. Per gigabyte, so somebody 3 GB
	// over pays for 3 GB.
	//
	// ⚠️ 5 cents a gigabyte is EXACTLY the pack price of $5 per 100 GB, and that
	// is deliberate. If overage cost more than buying the pack, somebody who
	// simply used the product would be paying a penalty for not having predicted
	// their own month. Our cost is $0.015/GB, so this is a 3.3x margin without
	// being the dollar a gigabyte some providers charge.
	storageBytes: { blockSize: 1024 ** 3, cents: 5 },
	// Counted, never capped, and not charged until real volume says what it costs.
	webhookDeliveries: null,
	// 🔴 Priced on FREE ONLY. See `overageFor`, which is the function anything
	// billing must call: reading this table directly would charge a paying
	// customer for their own orders.
	ordersPerMonth: null,
	activeProducts: null,
	bookingsPerMonth: null,
	invoicesPerMonth: null,
	contractsPerMonth: null,
	quotesPerMonth: null,
	projectsPerMonth: null,
	timeEntriesPerMonth: null,
	shipmentsPerMonth: null,
	clientsPerMonth: null,
	// A ceiling, not consumption. Passing one is a reason to change plan rather
	// than a line on an invoice, and neither can be bought by the unit.
	seats: null,
	workspaces: null,
};

export const METER_KIND: Record<MeterKey, "counter" | "gauge"> = {
	apiRequests: "counter",
	aiActions: "counter",
	// Refills each period: this month's trading, not a lifetime total.
	ordersPerMonth: "counter",
	bookingsPerMonth: "counter",
	invoicesPerMonth: "counter",
	contractsPerMonth: "counter",
	quotesPerMonth: "counter",
	projectsPerMonth: "counter",
	timeEntriesPerMonth: "counter",
	shipmentsPerMonth: "counter",
	clientsPerMonth: "counter",
	// A running total of what is listed right now, so delisting frees room.
	activeProducts: "gauge",
	storageBytes: "gauge",
	seats: "gauge",
	workspaces: "gauge",
	webhookDeliveries: "counter",
};

/**
 * What one unit past the allowance costs on a GIVEN PLAN.
 *
 * 🔴 The only correct way to price overage. Reading `OVERAGE` directly bills a
 * paying customer for their own orders and products, which is exactly what the
 * ladder promises never to do.
 *
 * ⚠️ Free-only meters are the ones that cost us nothing to hold. On a paid plan
 * they are uncapped, so there is no allowance to exceed and nothing to charge;
 * on free they are the mechanism that lets somebody keep trading past the cap
 * instead of being shut off until the month rolls over.
 */
const FREE_ONLY_METERS: ReadonlySet<MeterKey> = new Set([
	"ordersPerMonth",
	"activeProducts",
	"bookingsPerMonth",
	"invoicesPerMonth",
	"contractsPerMonth",
	"quotesPerMonth",
	"projectsPerMonth",
	"timeEntriesPerMonth",
	"shipmentsPerMonth",
	"clientsPerMonth",
]);

/** What a free account pays for the meters that only free is charged for. */
const FREE_ONLY_PRICES: Partial<Record<MeterKey, OveragePrice>> = {
	// 25 cents an order and 50 an item, chosen so the bill ARRIVES at the
	// Commerce price for a business that has genuinely outgrown free rather
	// than punishing a quiet month. A shop doing 250 orders and 120 products
	// pays about $153, at which point the plan is plainly better value; one
	// doing 40 orders pays about $9, which is the accessible tier nobody had
	// to invent.
	ordersPerMonth: { blockSize: 1, cents: 25 },
	activeProducts: { blockSize: 1, cents: 50 },
	// ⚠️ One rate across every module, deliberately. A booking is worth the same
	// to us as an order, and pricing them differently would make some business
	// types cheaper to run on free than others, which is the exact unfairness
	// this replaces.
	bookingsPerMonth: { blockSize: 1, cents: 25 },
	invoicesPerMonth: { blockSize: 1, cents: 25 },
	contractsPerMonth: { blockSize: 1, cents: 25 },
	quotesPerMonth: { blockSize: 1, cents: 25 },
	projectsPerMonth: { blockSize: 1, cents: 25 },
	timeEntriesPerMonth: { blockSize: 1, cents: 25 },
	shipmentsPerMonth: { blockSize: 1, cents: 25 },
	clientsPerMonth: { blockSize: 1, cents: 25 },
};

/**
 * The most a free account can run up in overage before it has to choose.
 *
 * 🔴 This is what stops free being a permanent home, and it does the job that
 * raising the per-unit price would otherwise have to do. At 25 cents an order
 * the bill only reaches the Commerce price somewhere past 600 orders a month,
 * so without a ceiling a real business could sit on free indefinitely paying
 * less than the plan. Raising the price to close that gap would mean charging
 * about 5% of a ten dollar order, which is worse than the transaction fee we
 * refuse to take.
 *
 * ⚠️ Set BELOW the Commerce price on purpose. Somebody who reaches it is told
 * that the plan costs less than the overage they are about to keep paying,
 * which is a true sentence and an easy decision. A cap above the plan price
 * would just be an expensive way to say the same thing.
 *
 * ⚠️ It is also a protection. Nobody on a free tier should be able to run up an
 * unbounded bill by having a good month.
 */
export const FREE_OVERAGE_CAP_CENTS = 9_900;

export function overageFor(
	planId: QuickEnginePlanId,
	meter: MeterKey,
): OveragePrice | null {
	if (FREE_ONLY_METERS.has(meter)) {
		return planId === "free" ? (FREE_ONLY_PRICES[meter] ?? null) : null;
	}
	return OVERAGE[meter];
}

export const getPlan = (id: QuickEnginePlanId): PlanDefinition | undefined =>
	PLANS.find((plan) => plan.id === id);

/** A plan's usage limits, falling back to Free for an unknown id. */
/**
 * The limits that apply to an account.
 *
 * 🔴 `seats` is REQUIRED for a per-seat plan and ignored for every other one.
 * Omitting it on Teams falls back to the 16-seat floor, which under-grants a
 * larger team rather than over-granting it — a throttled customer is a visible
 * bug, an unmetered one is a silent revenue hole. Enforcement resolves seats
 * through `getAccountLimits` so the fallback is never reached in practice.
 */
export const getPlanLimits = (
	id: QuickEnginePlanId,
	seats?: number,
): PlanLimits => {
	const plan = PLANS.find((entry) => entry.id === id) ?? PLANS[0];
	if (!plan.perSeat) return plan.limits;
	const quantity = billableSeats(seats ?? 0);
	const scale = (value: number | null): number | null =>
		value === null ? null : value * quantity;
	return {
		apiRequests: scale(plan.limits.apiRequests),
		aiActions: scale(plan.limits.aiActions),
		// 🔴 Deliberately NOT scaled. These are ceilings that only exist on Free,
		// and Free is not per seat, so multiplying them by a team size would
		// invent a limit where the plan says there is none.
		ordersPerMonth: plan.limits.ordersPerMonth,
		activeProducts: plan.limits.activeProducts,
		bookingsPerMonth: plan.limits.bookingsPerMonth,
		invoicesPerMonth: plan.limits.invoicesPerMonth,
		contractsPerMonth: plan.limits.contractsPerMonth,
		quotesPerMonth: plan.limits.quotesPerMonth,
		projectsPerMonth: plan.limits.projectsPerMonth,
		timeEntriesPerMonth: plan.limits.timeEntriesPerMonth,
		shipmentsPerMonth: plan.limits.shipmentsPerMonth,
		clientsPerMonth: plan.limits.clientsPerMonth,
		storageBytes: scale(plan.limits.storageBytes),
		webhookDeliveries: scale(plan.limits.webhookDeliveries),
		seats: plan.limits.seats,
		workspaces: plan.limits.workspaces,
	};
};

/** Resolve the Stripe price ID for a plan + cycle, or undefined if unset. */
export const getStripePriceId = (
	planId: QuickEnginePlanId,
	cycle: QuickEngineBillingCycle,
): string | undefined => {
	const envKey = getPlan(planId)?.priceEnv[cycle];
	return envKey ? process.env[envKey] : undefined;
};

/** Reverse-map a Stripe price ID back to our plan ID (used by the webhook). */
export const planIdForPriceId = (
	priceId: string,
): QuickEnginePlanId | undefined => {
	for (const plan of PLANS) {
		for (const envKey of Object.values(plan.priceEnv)) {
			if (envKey && process.env[envKey] === priceId) {
				return plan.id;
			}
		}
	}
	return undefined;
};
