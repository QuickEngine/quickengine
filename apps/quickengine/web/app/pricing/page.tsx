import { buildMetadata } from "@/app/_lib/seo";
import { SiteFooter } from "../_components/site-footer";
import { SiteHeader } from "../_components/site-header";
import { PricingHero } from "./_components/pricing-hero";
import { PricingTiers } from "./_components/pricing-tiers";

export const metadata = buildMetadata({
	title: "Pricing",
	description:
		"QuickEngine pricing — start free and scale as you grow. Plans metered by usage, with no lock-in.",
	path: "/pricing",
});

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
