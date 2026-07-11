import type { Metadata } from "next";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";
import { PricingHero } from "./_components/pricing-hero";
import { PricingTiers } from "./_components/pricing-tiers";

export const metadata: Metadata = {
	title: "Pricing",
};

export default function PricingPage() {
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
