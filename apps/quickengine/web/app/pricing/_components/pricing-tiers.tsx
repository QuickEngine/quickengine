"use client";

import { Check } from "@phosphor-icons/react";
import { useBillingCycle } from "./pricing-hero";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

type Tier = {
	name: string;
	tagline: string;
	price: { monthly: number; annual: number } | "custom";
	cta: { label: string; href: string };
	features: string[];
	recommended?: boolean;
};

// PLACEHOLDER — tier names, prices, and features are all provisional (annual
// prices are the per-month amount when billed yearly, ~20% off monthly). Real
// prices resolve from Stripe (see @quickengine/billing/plans.ts); these are just
// display numbers so the page works now.
const TIERS: Tier[] = [
	{
		name: "Free",
		tagline: "For trying it out.",
		price: { monthly: 0, annual: 0 },
		cta: { label: "Start free", href: `${AUTH_URL}/signup` },
		features: [
			"1 workspace",
			"1 seat",
			"1,000 actions / mo",
			"1 GB storage",
			"Community support",
		],
	},
	{
		name: "Starter",
		tagline: "For solo builders.",
		price: { monthly: 19, annual: 15 },
		cta: { label: "Get started", href: `${AUTH_URL}/signup` },
		features: [
			"1 workspace",
			"3 seats",
			"25,000 actions / mo",
			"10 GB storage",
			"Email support",
		],
	},
	{
		name: "Pro",
		tagline: "For growing teams.",
		price: { monthly: 49, annual: 39 },
		cta: { label: "Get started", href: `${AUTH_URL}/signup` },
		recommended: true,
		features: [
			"3 workspaces",
			"10 seats",
			"250,000 actions / mo",
			"100 GB storage",
			"Priority support",
		],
	},
	{
		name: "Growth",
		tagline: "For scaling businesses.",
		price: { monthly: 99, annual: 79 },
		cta: { label: "Get started", href: `${AUTH_URL}/signup` },
		features: [
			"10 workspaces",
			"25 seats",
			"1M actions / mo",
			"500 GB storage",
			"Priority support",
		],
	},
	{
		name: "Team",
		tagline: "For larger operations.",
		price: { monthly: 199, annual: 159 },
		cta: { label: "Get started", href: `${AUTH_URL}/signup` },
		features: [
			"25 workspaces",
			"Unlimited seats",
			"5M actions / mo",
			"2 TB storage",
			"SSO + dedicated support",
		],
	},
	{
		name: "Enterprise",
		tagline: "For custom needs.",
		price: "custom",
		cta: { label: "Contact sales", href: "/contact" },
		features: [
			"Unlimited workspaces",
			"Custom limits",
			"SSO / SAML + SCIM",
			"SLA + dedicated CSM",
			"Security review",
		],
	},
];

const filledCta =
	"mt-6 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 font-normal text-background text-sm transition-opacity hover:opacity-90";
const outlineCta =
	"mt-6 inline-flex h-10 items-center justify-center rounded-full border border-border px-5 font-normal text-foreground text-sm transition-colors hover:bg-foreground/5";

export function PricingTiers() {
	const [cycle] = useBillingCycle();

	return (
		<section className="page-gutter pb-32">
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{TIERS.map((tier) => (
					<div
						key={tier.name}
						className={`relative flex flex-col rounded-2xl border p-6 ${
							tier.recommended ? "border-foreground" : "border-border"
						}`}
					>
						{tier.recommended ? (
							<span className="-top-3 absolute left-6 rounded-full bg-foreground px-3 py-1 text-[11px] text-background uppercase tracking-wider">
								Recommended
							</span>
						) : null}

						<h3 className="font-display text-foreground text-xl">
							{tier.name}
						</h3>
						<p className="mt-1 text-muted-foreground text-sm">{tier.tagline}</p>

						<div className="mt-6 flex items-baseline gap-1">
							{tier.price === "custom" ? (
								<span className="font-display text-4xl text-foreground">
									Custom
								</span>
							) : (
								<>
									<span className="font-display text-4xl text-foreground">
										${tier.price[cycle]}
									</span>
									<span className="text-muted-foreground text-sm">/mo</span>
								</>
							)}
						</div>
						<p className="mt-1 h-4 text-muted-foreground text-xs">
							{tier.price !== "custom" &&
							cycle === "annual" &&
							tier.price.annual > 0
								? "billed annually"
								: ""}
						</p>

						<a
							href={tier.cta.href}
							className={tier.recommended ? filledCta : outlineCta}
						>
							{tier.cta.label}
						</a>

						<ul className="mt-6 flex flex-col gap-3">
							{tier.features.map((feature) => (
								<li
									key={feature}
									className="flex items-start gap-2 text-muted-foreground text-sm"
								>
									<Check
										className="mt-0.5 size-4 shrink-0 text-foreground"
										weight="bold"
									/>
									{feature}
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
		</section>
	);
}
