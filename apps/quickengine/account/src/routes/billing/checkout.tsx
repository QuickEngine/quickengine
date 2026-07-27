import { Button } from "@quickengine/ui/components/ui/button";
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

const searchSchema = z.object({
	plan: z.enum(["launch", "grow", "scale"]).catch("launch"),
	cycle: z.enum(["monthly", "annual"]).catch("monthly"),
});
const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function CheckoutPage() {
	const { plan, cycle } = Route.useSearch();
	const { user } = Route.useRouteContext();
	const { active } = useActiveOrganization();
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
					body: { planId: plan, cycle, billingEmail: user.email },
				},
			),
		onSuccess: ({ data }) => setCheckoutState(data),
	});
	return (
		<main className="mx-auto max-w-xl space-y-6 p-6">
			<div>
				<h1 className="font-semibold text-2xl">Checkout</h1>
				<p className="mt-1 text-muted-foreground">
					{plan} · {cycle} · {active?.name}
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
						appearance: { theme: "night" },
					}}
				>
					<PayForm subscriptionId={checkoutState.subscriptionId} />
				</Elements>
			) : (
				<Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
					{checkout.isPending ? "Starting checkout…" : "Continue to payment"}
				</Button>
			)}
			{checkout.isError && (
				<p className="text-destructive text-sm">{checkout.error.message}</p>
			)}
			<Link to="/billing/plans" className="block text-sm underline">
				Back to plans
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
		if (result.error) {
			setError(result.error.message ?? "Payment failed. Please try again.");
			setSubmitting(false);
		}
	};
	return (
		<form onSubmit={submit} className="space-y-5">
			<PaymentElement />
			{error && <p className="text-destructive text-sm">{error}</p>}
			<Button className="w-full" disabled={!stripe || submitting}>
				{submitting ? "Processing…" : "Pay and subscribe"}
			</Button>
		</form>
	);
}

export const Route = createFileRoute("/billing/checkout")({
	validateSearch: searchSchema,
	component: CheckoutPage,
});
