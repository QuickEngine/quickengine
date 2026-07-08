"use client";

import { Button } from "@quickengine/ui/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@quickengine/ui/components/ui/card";
import { useCallback, useEffect, useState } from "react";

// Basic billing test surface — NOT the real product checkout (custom Elements
// UI comes with the frontend phase). Enough to run a Stripe test-mode payment
// and watch the webhook record the subscription.

type Plan = {
	id: string;
	displayName: string;
	free: boolean;
	monthly: boolean;
	annual: boolean;
};

type Subscription = {
	planId: string;
	status: string;
	billingCycle: string | null;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	currentPeriodEndsAt: string | null;
} | null;

export default function DevBillingConsole() {
	const [plans, setPlans] = useState<Plan[]>([]);
	const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
	const [subscription, setSubscription] = useState<Subscription>(null);
	// Session is read server-side from this same origin (:3000), where the shared
	// localhost auth cookie is reliably present — avoids the flaky cross-origin
	// call to the auth app (:3002).
	const [signedIn, setSignedIn] = useState<boolean | null>(null);
	const [email, setEmail] = useState<string | null>(null);
	const [log, setLog] = useState("");

	const refresh = useCallback(async () => {
		const [plansRes, subRes] = await Promise.all([
			fetch("/api/billing/plans").then((r) => r.json()),
			fetch("/api/billing/subscription").then((r) => r.json()),
		]);
		setPlans(plansRes.plans ?? []);
		setSubscription(subRes.subscription ?? null);
		setSignedIn(Boolean(subRes.signedIn));
		setEmail(subRes.email ?? null);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const subscribe = async (planId: string) => {
		setLog(`Creating checkout for ${planId} (${cycle})…`);
		try {
			const res = await fetch("/api/stripe/checkout", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ planId, cycle }),
			});
			const data = await res.json();
			if (data.url) {
				window.location.assign(data.url);
			} else {
				setLog(`Error: ${data.error ?? "no checkout URL"}`);
			}
		} catch (error) {
			setLog(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<main className="min-h-dvh bg-background text-foreground">
			<div className="mx-auto max-w-2xl space-y-4 px-6 py-12">
				<div>
					<h1 className="font-semibold text-xl tracking-tight">
						QuickEngine Billing · dev console
					</h1>
					<p className="text-muted-foreground text-sm">
						Test-mode checkout. Sign in via the auth app first, then subscribe
						to run a sandbox payment.
					</p>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="font-medium text-muted-foreground text-sm uppercase tracking-wider">
							Session
						</CardTitle>
					</CardHeader>
					<CardContent className="text-sm">
						{signedIn === null ? (
							<span className="text-muted-foreground">loading…</span>
						) : signedIn ? (
							<span className="text-emerald-500">Signed in · {email}</span>
						) : (
							<span className="text-muted-foreground">
								Signed out — sign in at the auth app (:3002/dev) first, then
								refresh.
							</span>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="font-medium text-muted-foreground text-sm uppercase tracking-wider">
							Current subscription
						</CardTitle>
					</CardHeader>
					<CardContent className="text-sm">
						{subscription ? (
							<pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
								{JSON.stringify(subscription, null, 2)}
							</pre>
						) : (
							<span className="text-muted-foreground">none</span>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex-row items-center justify-between">
						<CardTitle className="font-medium text-muted-foreground text-sm uppercase tracking-wider">
							Plans
						</CardTitle>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setCycle((c) => (c === "monthly" ? "annual" : "monthly"))
							}
						>
							cycle: {cycle}
						</Button>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						{plans
							.filter((plan) => !plan.free)
							.map((plan) => {
								const configured =
									cycle === "monthly" ? plan.monthly : plan.annual;
								return (
									<div
										key={plan.id}
										className="flex items-center justify-between gap-2"
									>
										<span className="text-sm">
											{plan.displayName}
											{!configured && (
												<span className="ml-2 text-muted-foreground text-xs">
													(no {cycle} price set)
												</span>
											)}
										</span>
										<Button
											size="sm"
											disabled={!signedIn || !configured}
											onClick={() => subscribe(plan.id)}
										>
											Subscribe
										</Button>
									</div>
								);
							})}
						<Button variant="ghost" size="sm" onClick={refresh}>
							Refresh
						</Button>
					</CardContent>
				</Card>

				{log && (
					<Card>
						<CardContent>
							<pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
								{log}
							</pre>
						</CardContent>
					</Card>
				)}
			</div>
		</main>
	);
}
