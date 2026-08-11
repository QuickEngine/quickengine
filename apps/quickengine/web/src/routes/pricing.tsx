import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Pricing } from "@/components/pricing";

/**
 * Pricing — stripped to a blank canvas on 2026-08-10, the same way the front
 * page was, so it gets rebuilt rather than retrofitted.
 *
 * `PricingHero` and `PricingTiers` are still on disk and still hold the old
 * placeholder ladder. They are not rendered. Nothing was deleted.
 *
 * ⚠️ Whatever gets built here, the numbers come from `packages/billing/plans.ts`
 * — the file that calls itself the single source of truth — and NOT from a
 * second list typed into a component. `pricing-tiers.tsx` did exactly that and
 * its tiers (Free / Starter / Pro) do not even match the real ladder
 * (Free / Launch / Grow / Scale / Expand / Custom).
 *
 * Prices themselves are not in the codebase at all: each paid tier points at a
 * Stripe price through an env var, and those are unset pre-launch.
 */
function PricingPage() {
	return (
		// `Header` is fixed and contributes no height of its own, so the page below
		// has to offset by exactly as much. Both read `--header-h`.
		<div className="relative isolate min-h-dvh bg-black">
			<Header />
			<Pricing />
			<Footer />
		</div>
	);
}

export const Route = createFileRoute("/pricing")({
	component: PricingPage,
});
