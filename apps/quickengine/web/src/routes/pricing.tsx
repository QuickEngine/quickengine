import { createFileRoute } from "@tanstack/react-router";
import { PricingHero } from "@/components/pricing-hero";
import { PricingTiers } from "@/components/pricing-tiers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

function PricingPage() {
	return (
		<>
			<SiteHeader />
			<main className="pt-16">
				<PricingHero />
				<PricingTiers />
				{/* Comparison table + FAQ come next. */}
			</main>
			<SiteFooter />
		</>
	);
}

export const Route = createFileRoute("/pricing")({
	component: PricingPage,
});
