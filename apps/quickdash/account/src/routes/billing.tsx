import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { accountQueries, useActiveOrganization } from "../lib/account-api";

/**
 * `/billing`
 *
 * 🔴 Restored 2026-09-06. Stubbed on 2026-08-15 pending a billing redesign,
 * which left the product unable to be bought: the plans, prices and Stripe
 * endpoints all worked and the only screen that reaches them was an empty
 * `<main>`.
 *
 * ── What this page argues ────────────────────────────────────────────────────
 *
 * 🔑 Hard rule 4 bans third-party advertising and explicitly permits this:
 * telling your own users what your own product does is the product. So each tier
 * leads with what it INCLUDES rather than what it withholds, and the free tier is
 * described honestly as a complete business system rather than as a trial with
 * the good parts removed — because that is what it is.
 *
 * ⚠️ Prices come from Stripe through `/account/billing/pricing`, never from a
 * constant in the front end. A price written twice is a price that will disagree
 * with itself the first time it changes.
 */
const CENTS = (amount: number, currency: string) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
		maximumFractionDigits: 0,
	}).format(amount / 100);

/** What each tier is FOR, in the customer's words rather than the schema's. */
const PITCH: Record<string, { name: string; line: string }> = {
	free: {
		name: "Free",
		line: "Everything you sell on your own. Catalog, orders, payments, stock, invoices, bookings, contracts, projects and content.",
	},
	launch: {
		name: "Commerce",
		line: "Adds suppliers, purchase orders and partner payouts, so an order can involve somebody other than you and still settle correctly.",
	},
	grow: {
		name: "Grow",
		line: "The same, with more seats, more workspaces and higher allowances.",
	},
	scale: {
		name: "Scale",
		line: "For businesses running several brands or locations at volume.",
	},
};

function BillingPage() {
	const { active } = useActiveOrganization();
	const pricing = useQuery(accountQueries.pricing(active?.id ?? ""));

	const current = pricing.data?.currentPlanId;
	const plans = pricing.data?.pricing ?? [];

	return (
		<main className="mx-auto max-w-3xl space-y-8 p-6">
			<div>
				<h1 className="font-semibold text-2xl">Billing</h1>
				<p className="mt-1 text-muted-foreground">
					{current
						? `${PITCH[current]?.name ?? current} · ${active?.name}`
						: active?.name}
				</p>
			</div>

			{pricing.isPending && (
				<p className="text-muted-foreground text-sm">Loading plans…</p>
			)}
			{pricing.isError && (
				<p className="text-destructive text-sm">{pricing.error.message}</p>
			)}

			<div className="space-y-4">
				{plans.map((plan) => {
					const pitch = PITCH[plan.planId];
					const isCurrent = plan.planId === current;
					return (
						<section
							key={plan.planId}
							className="rounded-xl border p-5"
							aria-current={isCurrent ? "true" : undefined}
						>
							<div className="flex items-baseline justify-between gap-4">
								<h2 className="font-medium text-lg">
									{pitch?.name ?? plan.displayName}
								</h2>
								<p className="font-medium text-lg">
									{plan.free
										? "Free"
										: plan.monthly
											? `${CENTS(plan.monthly.amount, plan.monthly.currency)}/mo`
											: "—"}
								</p>
							</div>
							<p className="mt-2 text-muted-foreground text-sm">
								{pitch?.line ?? ""}
							</p>
							{plan.annual && !plan.free && (
								<p className="mt-1 text-muted-foreground text-xs">
									{CENTS(plan.annual.amount, plan.annual.currency)} billed
									yearly, which is two months off.
								</p>
							)}
							<div className="mt-4">
								{isCurrent ? (
									<p className="text-muted-foreground text-sm">
										Your current plan.
									</p>
								) : plan.free ? null : (
									<Link
										to="/billing/checkout"
										search={{ plan: plan.planId as never, cycle: "monthly" }}
										className="inline-block rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90"
									>
										Choose {pitch?.name ?? plan.displayName}
									</Link>
								)}
							</div>
						</section>
					);
				})}
			</div>

			<Link to="/billing/credits" className="block text-sm underline">
				AI credits
			</Link>
		</main>
	);
}

export const Route = createFileRoute("/billing")({ component: BillingPage });
