import { createFileRoute } from "@tanstack/react-router";
import { ICE } from "@/components/pill";
import { TextPage, TextSection, textProse } from "@/components/text-page";
import { BILLING_LABEL, type Billing, GROUPS, MODULES } from "@/lib/modules";

/**
 * The module catalog.
 *
 * 🔴 THIS LIST AND ITS BILLING MARKS COME FROM `internal/product/MODULES.md`,
 * which is the single source for what a module is and how it is charged. Do not
 * invent a module, and do not guess a billing mark — the same source drives the
 * pricing page, and the two disagreeing is how a customer ends up billed for
 * something a page told them was free.
 *
 * Sixteen modules exist in `packages/modules`. Every one below is real and
 * shipped.
 */

function Tag({ billing }: { billing: Billing }) {
	return (
		<span
			style={
				billing === "free" ? { borderColor: `${ICE}33`, color: ICE } : undefined
			}
			className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 font-body font-light text-[0.6875rem] ${
				billing === "free" ? "" : "border-white/15 text-white/45"
			}`}
		>
			{BILLING_LABEL[billing]}
		</span>
	);
}

function ModulesPage() {
	return (
		<TextPage
			title="Sixteen modules, so far."
			lede="Sixteen are built today and more are coming. A workspace starts with the set its business type suggests, and you change it whenever you like."
		>
			{GROUPS.map((group) => (
				<TextSection key={group} title={group}>
					<div className="flex flex-col">
						{MODULES.filter((module) => module.group === group).map(
							(module) => (
								<div
									key={module.slug}
									className="flex flex-col gap-2 border-white/[0.07] border-b py-5 first:pt-0 last:border-b-0"
								>
									<div className="flex flex-wrap items-center gap-3">
										<h3 className="font-body font-normal text-[1rem] text-white">
											{module.name}
										</h3>
										{module.billing.map((mark) => (
											<Tag key={mark} billing={mark} />
										))}
									</div>
									<p className="max-w-[64ch] font-body font-light text-[0.9375rem] text-white/60 leading-[1.6]">
										{module.what}
									</p>
								</div>
							),
						)}
					</div>
				</TextSection>
			))}

			<TextSection title="How the marks work">
				<div className={textProse}>
					<ul>
						<li>
							<strong>Free</strong>, included, with no usage fee attached.
						</li>
						<li>
							<strong>Unlock once</strong>, paid on your plan, then unlimited.
							Not per record, not per customer, not per invoice.
						</li>
						<li>
							<strong>Metered</strong>, charged on the resource it genuinely
							consumes, such as stored bytes or a carrier rate call.
						</li>
					</ul>
					<p>
						Most modules meter nothing at all. We charge for infrastructure we
						pay for, never for an outcome your business earned{" "}
						<a href="/pricing">pricing</a> sets out exactly where that line
						sits.
					</p>
				</div>
			</TextSection>

			<TextSection title="They are wired to each other">
				<div className={textProse}>
					<p>
						This is the part a folder of separate tools cannot do. Time entries
						become invoice lines that cannot be billed twice. An accepted quote
						converts to an invoice or an order exactly once. An order reserves
						stock, and cannot be marked fulfilled before its delivery is.
					</p>
					<p>
						None of that is an integration you configure. It is one system, so
						there is nothing between the parts to fall out of step.
					</p>
				</div>
			</TextSection>
		</TextPage>
	);
}

export const Route = createFileRoute("/products/modules/")({
	component: ModulesPage,
});
