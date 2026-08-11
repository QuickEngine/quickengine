import { createFileRoute, notFound } from "@tanstack/react-router";
import { ICE, Pill } from "@/components/pill";
import { TextPage, TextSection, textProse } from "@/components/text-page";
import { BILLING_LABEL, moduleBySlug } from "@/lib/modules";

/**
 * A page for every module.
 *
 * ⚠️ ONE PER REAL MODULE, keyed by the same slug the catalog and the header
 * menu use. It replaced six invented GROUPINGS (commerce, billing, files…) that
 * bundled several modules under a name nothing in the product uses.
 *
 * All content comes from `@/lib/modules` so the catalog, these pages and the
 * header menu cannot disagree about what exists. Adding a module means adding it
 * there and to the menu in the same change — nothing else.
 *
 * 🔴 A `caveat` is printed prominently and must never be dropped to make a page
 * read better. It is where Payments admits PayPal is unproven, Shipping admits
 * carrier labels are unfinished, and Content admits it is half-built.
 */
function ModulePage() {
	const { module: slug } = Route.useParams();
	const module = moduleBySlug(slug);

	if (!module) throw notFound();

	return (
		<TextPage title={module.title} lede={module.lede}>
			<TextSection title="What it does">
				<div className="flex flex-col">
					{module.capabilities.map((capability) => (
						<div
							key={capability.name}
							className="flex flex-col gap-1.5 border-white/[0.07] border-b py-5 first:pt-0 last:border-b-0 sm:flex-row sm:gap-8"
						>
							<span className="shrink-0 font-body font-normal text-[0.9375rem] text-white sm:w-52">
								{capability.name}
							</span>
							<span className="font-body font-light text-[0.9375rem] text-white/60 leading-[1.6]">
								{capability.what}
							</span>
						</div>
					))}
				</div>
			</TextSection>

			{/* ⚠️ Deliberately its own section rather than a footnote. Somebody
			    evaluating a module needs to meet its limits at the same weight as its
			    features, not below the fold in smaller text. */}
			{module.caveat ? (
				<TextSection title="Worth knowing">
					<div className={textProse}>
						<p>{module.caveat}</p>
					</div>
				</TextSection>
			) : null}

			<TextSection title="How it is charged">
				<div className="flex flex-wrap gap-2.5">
					{module.billing.map((mark) => (
						<span
							key={mark}
							style={
								mark === "free"
									? { borderColor: `${ICE}33`, color: ICE }
									: undefined
							}
							className={`rounded-full border px-3.5 py-1.5 font-body font-light text-[0.8125rem] ${
								mark === "free" ? "" : "border-white/15 text-white/45"
							}`}
						>
							{BILLING_LABEL[mark]}
						</span>
					))}
				</div>
				<div className={`mt-5 ${textProse}`}>
					<p>
						Unlocked capabilities are paid once on your plan and then unlimited
						never per record, per customer or per invoice. Metered ones are
						charged on the resource they genuinely consume.{" "}
						<a href="/pricing">Pricing</a> sets out where the line sits.
					</p>
				</div>
			</TextSection>

			{module.needs?.length ? (
				<TextSection title="Works with">
					<div className="flex flex-wrap gap-2.5">
						{module.needs.map((need) => {
							const other = moduleBySlug(need);
							if (!other) return null;
							return (
								<a
									key={need}
									href={`/products/modules/${other.slug}`}
									className="rounded-full border border-white/15 px-3.5 py-1.5 font-body font-light text-[0.8125rem] text-white/70 no-underline transition-colors hover:border-white/30 hover:text-white"
								>
									{other.name}
								</a>
							);
						})}
					</div>
					<div className={`mt-5 ${textProse}`}>
						<p>
							Modules are wired to each other rather than synced. That is the
							part a folder of separate tools cannot do however good each one
							is.
						</p>
					</div>
				</TextSection>
			) : null}

			<TextSection title="Next">
				<div className="flex flex-col gap-3 sm:flex-row">
					<Pill
						href="/products/modules"
						variant="primary"
						size="lg"
						disc="arrow"
					>
						Every module
					</Pill>
					<Pill href="/pricing" variant="secondary" size="lg" disc="arrow">
						What it costs
					</Pill>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/products/modules/$module")({
	component: ModulePage,
});
