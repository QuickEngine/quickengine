"use client";

import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";
import {
	Elements,
	PaymentElement,
	useElements,
	useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { type FormEvent, useEffect, useState } from "react";
import { startSubscriptionAction } from "../../_lib/billing-actions";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

const ACCOUNT_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ?? "http://localhost:3001";

// Our own checkout form. On mount it asks the server for a subscription's confirmation
// secret, then renders Stripe's Payment Element (only the card fields) inside our layout.
export function CheckoutForm({
	planId,
	cycle,
}: {
	planId: QuickEnginePlanId;
	cycle: QuickEngineBillingCycle;
}) {
	const [clientSecret, setClientSecret] = useState<string | null>(null);
	const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		startSubscriptionAction(planId, cycle).then((result) => {
			if (!active) return;
			if (result.clientSecret) {
				setClientSecret(result.clientSecret);
				setSubscriptionId(result.subscriptionId ?? null);
			} else {
				setError(result.error ?? "Couldn't start checkout.");
			}
		});
		return () => {
			active = false;
		};
	}, [planId, cycle]);

	if (!stripePromise) {
		return (
			<p className="text-muted-foreground text-sm">
				Payments aren't configured in this environment.
			</p>
		);
	}
	if (error) {
		return (
			<p role="alert" className="text-destructive text-sm">
				{error}
			</p>
		);
	}
	if (!clientSecret) {
		return (
			<p className="text-muted-foreground text-sm">Loading secure checkout…</p>
		);
	}

	return (
		<Elements
			stripe={stripePromise}
			options={{ clientSecret, appearance: { theme: "night" } }}
		>
			<PayForm subscriptionId={subscriptionId} />
		</Elements>
	);
}

function PayForm({ subscriptionId }: { subscriptionId: string | null }) {
	const stripe = useStripe();
	const elements = useElements();
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		if (!stripe || !elements) return;
		setSubmitting(true);
		setError(null);
		const { error: confirmError } = await stripe.confirmPayment({
			elements,
			confirmParams: {
				return_url: `${ACCOUNT_URL}/billing/success?subscription_id=${subscriptionId ?? ""}`,
			},
		});
		// On success Stripe redirects to return_url; we only get here on error.
		if (confirmError) {
			setError(confirmError.message ?? "Payment failed. Please try again.");
			setSubmitting(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-5">
			<PaymentElement />
			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
			<button
				type="submit"
				disabled={!stripe || submitting}
				className="w-full rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{submitting ? "Processing…" : "Pay & subscribe"}
			</button>
		</form>
	);
}
