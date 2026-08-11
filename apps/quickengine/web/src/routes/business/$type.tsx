import { createFileRoute, notFound } from "@tanstack/react-router";
import { ICE, Pill } from "@/components/pill";
import { TextPage, TextSection } from "@/components/text-page";
import { SOLUTIONS } from "@/lib/solutions";

/**
 * One page per kind of business.
 *
 * ⚠️ `businessType` is FREE TEXT in the schema — there is no fixed enum of
 * business types in the product. These pages are a marketing construct, and the
 * honest thing they can do is map a kind of business onto modules that actually
 * exist. Every module named below is a real directory in `packages/modules`.
 *
 * 🔴 The previous version carried EIGHT types, three of which (Startups,
 * Scale-ups, Migrations) were linked from nowhere and marked `PLACEHOLDER`. Only
 * the five the navigation offers are kept. Adding a sixth means adding it to the
 * nav in the same change, or it is another orphan.
 *
 * 🔴 Enterprise is the one to be careful with. SSO and SAML DO NOT EXIST, and
 * neither does SOC 2. That page says so plainly. Do not soften it — a buyer who
 * discovers it during procurement has been misled, and that is a worse outcome
 * than losing them at the marketing page.
 */

function SolutionPage() {
	const { type } = Route.useParams();
	const solution = SOLUTIONS[type];

	if (!solution) throw notFound();

	return (
		<TextPage title={solution.title} lede={solution.lede}>
			<TextSection title="The modules involved">
				{/* Named, not illustrated. Somebody evaluating this wants to know which
				    parts they are switching on, and a diagram would say less. */}
				<div className="flex flex-col">
					{solution.modules.map((module) => (
						<div
							key={module.name}
							className="flex flex-col gap-1 border-white/[0.07] border-b py-4 first:pt-0 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-6"
						>
							<span
								style={{ color: ICE }}
								className="shrink-0 font-body font-normal text-[0.9375rem] sm:w-48"
							>
								{module.name}
							</span>
							<span className="font-body font-light text-[0.9375rem] text-white/60 leading-[1.6]">
								{module.why}
							</span>
						</div>
					))}
				</div>
			</TextSection>

			{solution.body}

			<TextSection title="Start">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-3 sm:flex-row">
						<Pill href="/pricing" variant="primary" size="lg" disc="arrow">
							See pricing
						</Pill>
						<Pill href="/contact" variant="secondary" size="lg" disc="arrow">
							Ask us anything
						</Pill>
					</div>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/business/$type")({
	component: SolutionPage,
});
