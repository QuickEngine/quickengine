import { createFileRoute } from "@tanstack/react-router";
import { TextPage, TextSection, textProse } from "@/components/text-page";

/**
 * Marketplace.
 *
 * 🔴 THE MARKETPLACE DOES NOT EXIST. There is no third-party module, no
 * submission process and no revenue share. The previous version described all
 * three as though they were live.
 *
 * ⚠️ This page is kept because the concept is real and reserved in the module
 * registry, and because deleting it would silently drop it from the plan. It
 * says plainly that it is not open. Do not add a "browse extensions" grid, a
 * "coming soon" countdown, or a developer waitlist form that goes nowhere.
 */
function MarketplacePage() {
	return (
		<TextPage
			title="Not open yet."
			lede="A marketplace for modules other people build is where QuickDash is going. It is not there today, and this page will not pretend otherwise."
		>
			<TextSection title="What exists now">
				<div className={textProse}>
					<p>
						Sixteen modules, all built by us, all switched on and off per
						workspace. <a href="/products/modules">The catalog</a> lists every
						one.
					</p>
					<p>
						The architecture underneath is already modular in the way it would
						need to be, modules declare what they are, what they depend on and
						how they are billed, and the platform reads that rather than hard
						coding it. That is the groundwork, not the product.
					</p>
				</div>
			</TextSection>

			<TextSection title="What is missing">
				<div className={textProse}>
					<ul>
						<li>No way for anyone outside QuickEngine to publish a module.</li>
						<li>No review process, and no sandbox to run untrusted code in.</li>
						<li>No billing split, and no revenue share agreement.</li>
					</ul>
					<p>
						Each of those is a serious piece of work, and the sandboxing one is
						the reason this is not close. Running somebody else's code against
						your customers' data is not a feature to rush.
					</p>
				</div>
			</TextSection>

			<TextSection title="If you were going to build one">
				<div className={textProse}>
					<p>
						You do not have to wait. Everything the dashboard does is reachable
						over <a href="/docs/api">the API</a>, so a tool that reads and
						writes a workspace can be built today and run wherever you like, it
						simply is not distributed through us.
					</p>
					<p>
						If that is what you are doing, <a href="/contact">tell us</a>. What
						people build outside the marketplace is what should decide its
						shape.
					</p>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/products/marketplace")({
	component: MarketplacePage,
});
