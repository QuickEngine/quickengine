import { createFileRoute } from "@tanstack/react-router";
import { TextPage, TextSection, textProse } from "@/components/text-page";

/**
 * The business-type hub.
 *
 * ⚠️ The list is derived from `SOLUTIONS` in `business/$type.tsx` rather than
 * retyped here. The two disagreed in the previous version — the hub offered five
 * types and the detail route defined eight — which is exactly what a second copy
 * of a list always does. One source, so a type cannot exist in one place and not
 * the other.
 */
import { SOLUTIONS } from "@/lib/solutions";

// ⚠️ Explicit order, not `Object.keys`. The sequence is a sales decision — the
// broadest markets first, enterprise last because it is the page that says no —
// and object key order is not something to entrust that to.
const ORDER = [
	"ecommerce",
	"agencies",
	"freelancers",
	"trades",
	"saas",
	"enterprise",
];

function BusinessPage() {
	return (
		<TextPage
			title="One backend, shaped to your work."
			lede="The same modules underneath, switched on differently. A shop needs stock and shipping; an agency needs hours and contracts. Nobody needs all sixteen."
		>
			<TextSection title="Pick the closest">
				<div className="flex flex-col">
					{ORDER.map((slug) => {
						const solution = SOLUTIONS[slug];
						if (!solution) return null;
						return (
							<a
								key={slug}
								href={`/business/${slug}`}
								className="group flex flex-col gap-2 border-white/[0.07] border-b py-7 no-underline first:pt-0 last:border-b-0"
							>
								<span className="font-display font-light text-[1.375rem] text-white leading-tight tracking-[-0.02em] transition-opacity duration-300 group-hover:opacity-70">
									{solution.name}
								</span>
								<span className="max-w-[62ch] font-body font-light text-[0.9375rem] text-white/55 leading-[1.6]">
									{solution.lede}
								</span>
							</a>
						);
					})}
				</div>
			</TextSection>

			<TextSection title="If none of them fit">
				<div className={textProse}>
					<p>
						These are starting points, not categories you are locked into. The
						business type sets which modules are on by default and nothing else
						you can switch any of them on or off afterwards, and a workspace
						that looks like nothing on this list is fine.
					</p>
					<p>
						Not sure which is closest?{" "}
						<a href="/contact">Describe what you run</a> and we will tell you
						straight whether QuickDash fits.
					</p>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/business/")({
	component: BusinessPage,
});
