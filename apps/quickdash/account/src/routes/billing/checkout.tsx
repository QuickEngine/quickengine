import {
	Elements,
	PaymentElement,
	useElements,
	useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";
import { clientEnv } from "../../lib/env";

/**
 * `/billing/checkout`
 *
 * 🔴 Restored 2026-09-06. This page was stubbed on 2026-08-15 pending a billing
 * redesign, which meant the API could take money and no customer could give it
 * any: pricing, plans and the Stripe endpoints all worked, and the only screen
 * that turns them into revenue was an empty `<main>`.
 *
 * ── Why the subscription is no longer created on mount ───────────────────────
 *
 * The previous version fired the subscription as soon as the page loaded. A
 * discount can only be attached when the subscription is CREATED, so
 * auto-creating it made a promotion code impossible to offer: by the time
 * anywhere existed to type one, the price was already fixed. The code is asked
 * for first, then one action creates the subscription and reveals the card
 * fields.
 */
const searchSchema = z.object({
	plan: z.enum(["launch", "grow", "scale"]).catch("launch"),
	cycle: z.enum(["monthly", "annual"]).catch("monthly"),
	/** Prefilled from a campaign link, still editable. */
	code: z.string().trim().max(64).optional(),
});

const PLAN_LABEL: Record<string, string> = {
	launch: "Commerce",
	grow: "Grow",
	scale: "Scale",
};

const publishableKey = clientEnv.STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

/**
 * Dress Stripe's card fields in our own tokens.
 *
 * 🔴 The fields render inside a Stripe IFRAME, so our stylesheet does not reach
 * them and `var(--text)` resolves to nothing in there. The values have to be
 * READ from the live document and passed across as concrete colours.
 *
 * ⚠️ Read at mount rather than subscribed to. A theme change mid-payment is not
 * worth a re-render of a mounted PaymentElement, which would remount the card
 * fields and lose whatever the customer had typed.
 *
 * Falls back to Stripe's own dark theme if a token is missing, which is better
 * than passing empty strings and getting unstyled fields.
 */
function appearanceFromTokens(): Record<string, unknown> {
	if (typeof window === "undefined") return { theme: "night" };
	const root = getComputedStyle(document.documentElement);
	const token = (name: string) => root.getPropertyValue(name).trim();

	const surface = token("--surface-card") || token("--surface");
	const text = token("--text");
	const dim = token("--text-dim");
	const edge = token("--edge-shade") || token("--border");
	const accent = token("--accent");
	if (!surface || !text) return { theme: "night" };

	return {
		// `night` or `stripe` decides the BASE, then variables override it. Picking
		// the base from our own background means an unset variable degrades to
		// something close rather than to the opposite scheme.
		theme: token("--color-invert") ? "night" : "stripe",
		variables: {
			colorBackground: surface,
			colorText: text,
			colorTextSecondary: dim || text,
			colorPrimary: accent || text,
			colorDanger: token("--danger") || undefined,
			borderRadius: token("--radius") || "0.5rem",
			fontFamily: root.getPropertyValue("font-family").trim() || undefined,
		},
		rules: {
			".Input": { border: `1px solid ${edge}` },
			".Input:focus": {
				border: `1px solid ${accent || text}`,
				boxShadow: "none",
			},
			".Label": { color: dim || text },
		},
	};
}

function CheckoutPage() {
	const { plan, cycle, code } = Route.useSearch();
	const { user } = Route.useRouteContext();
	const { active } = useActiveOrganization();
	const [promotionCode, setPromotionCode] = useState(code ?? "");
	const [checkoutState, setCheckoutState] = useState<{
		clientSecret: string;
		subscriptionId: string;
	} | null>(null);

	const checkout = useMutation({
		mutationFn: () =>
			api.request<{ clientSecret: string; subscriptionId: string }>(
				`/account/subscription?organizationId=${active?.id}`,
				{
					method: "POST",
					body: {
						planId: plan,
						cycle,
						billingEmail: user.email,
						// Omitted rather than sent empty, so the API never looks up "".
						...(promotionCode.trim()
							? { promotionCode: promotionCode.trim() }
							: {}),
					},
				},
			),
		onSuccess: ({ data }) => setCheckoutState(data),
	});

	return (
		<main className="mx-auto max-w-xl space-y-6 p-6">
			<div>
				<h1 className="font-semibold text-2xl">{PLAN_LABEL[plan] ?? plan}</h1>
				<p className="mt-1 text-muted-foreground">
					{cycle === "annual" ? "Billed yearly" : "Billed monthly"} ·{" "}
					{active?.name}
				</p>
			</div>

			{!stripePromise ? (
				<p className="text-muted-foreground text-sm">
					Payments aren't configured in this environment.
				</p>
			) : checkoutState ? (
				<Elements
					stripe={stripePromise}
					options={{
						clientSecret: checkoutState.clientSecret,
						appearance: appearanceFromTokens(),
					}}
				>
					<PayForm subscriptionId={checkoutState.subscriptionId} />
				</Elements>
			) : (
				<form
					className="space-y-5"
					onSubmit={(event) => {
						event.preventDefault();
						if (active?.id) checkout.mutate();
					}}
				>
					<div className="space-y-2">
						<label
							htmlFor="promotion-code"
							className="block font-medium text-sm"
						>
							Have a code?
						</label>
						<input
							id="promotion-code"
							name="promotion-code"
							value={promotionCode}
							onChange={(event) => setPromotionCode(event.target.value)}
							autoComplete="off"
							autoCapitalize="characters"
							spellCheck={false}
							placeholder="Optional"
							className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
						/>
					</div>
					<button
						type="submit"
						disabled={!active?.id || checkout.isPending}
						className="w-full rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{checkout.isPending ? "Preparing…" : "Continue to payment"}
					</button>
					{checkout.isError && (
						/**
						 * ⚠️ Shows the API's own sentence. A rejected code says which
						 * code and what to do about it, and replacing that with a
						 * generic failure would leave somebody guessing whether they
						 * had been charged.
						 */
						<p className="text-destructive text-sm">{checkout.error.message}</p>
					)}
				</form>
			)}

			<Link to="/billing" className="block text-sm underline">
				Back to billing
			</Link>
		</main>
	);
}

function PayForm({ subscriptionId }: { subscriptionId: string }) {
	const stripe = useStripe();
	const elements = useElements();
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!stripe || !elements) return;
		setSubmitting(true);
		setError(null);
		const result = await stripe.confirmPayment({
			elements,
			confirmParams: {
				return_url: `${window.location.origin}/billing/success?subscription_id=${encodeURIComponent(subscriptionId)}`,
			},
		});
		// Only a synchronous failure returns here; success redirects away.
		if (result.error) {
			setError(result.error.message ?? "Payment failed. Please try again.");
			setSubmitting(false);
		}
	};

	return (
		<form onSubmit={submit} className="space-y-5">
			<PaymentElement />
			{error && <p className="text-destructive text-sm">{error}</p>}
			<button
				type="submit"
				disabled={!stripe || submitting}
				className="w-full rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{submitting ? "Processing…" : "Subscribe"}
			</button>
		</form>
	);
}

export const Route = createFileRoute("/billing/checkout")({
	validateSearch: searchSchema,
	component: CheckoutPage,
});
