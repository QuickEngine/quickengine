import {
	ArrowClockwise,
	ArrowSquareOut,
	CheckCircle,
	CreditCard,
	WarningCircle,
} from "@phosphor-icons/react";
import type { QuickPaymentConnectStatus } from "@quickengine/quick";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { Button } from "@quickengine/ui/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "../lib/api";

const provider = "stripe" as const;

export function PaymentProviderPanel({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [error, setError] = useState<string | null>(null);
	const refreshedReturn = useRef(false);
	const queryKey = ["quickdash", workspaceId, "payment-provider", provider];
	const api = workspaceApi(workspaceId);
	const connection = useQuery({
		queryKey,
		queryFn: async () => (await api.payments.connection(provider)).data,
	});
	const refresh = useMutation({
		mutationFn: async () =>
			(await workspaceApi(workspaceId).payments.refreshConnection(provider))
				.data,
		onSuccess: (status) => {
			queryClient.setQueryData(queryKey, status);
			setError(null);
		},
		onError: (cause) =>
			setError(
				cause instanceof Error
					? cause.message
					: "Stripe's current status could not be checked.",
			),
	});
	const onboard = useMutation({
		mutationFn: async () => {
			const returnUrl = new URL(window.location.href);
			returnUrl.searchParams.set("stripe", "returned");
			const refreshUrl = new URL(window.location.href);
			refreshUrl.searchParams.set("stripe", "resume");
			return (
				await workspaceApi(workspaceId).payments.startOnboarding({
					provider,
					returnUrl: returnUrl.toString(),
					refreshUrl: refreshUrl.toString(),
				})
			).data;
		},
		onSuccess: ({ onboardingUrl }) => window.location.assign(onboardingUrl),
		onError: (cause) =>
			setError(
				cause instanceof Error
					? cause.message
					: "Stripe onboarding could not be started.",
			),
	});

	useEffect(() => {
		if (refreshedReturn.current || !connection.data?.connected) return;
		const returned = new URLSearchParams(window.location.search).get("stripe");
		if (returned !== "returned") return;
		refreshedReturn.current = true;
		refresh.mutate();
	}, [connection.data?.connected, refresh.mutate]);

	if (connection.isPending) {
		return (
			<section className="rounded-xl border p-5 text-muted-foreground text-sm">
				Checking payment provider…
			</section>
		);
	}

	if (connection.isError) {
		return (
			<section className="space-y-3 rounded-xl border border-destructive/30 p-5">
				<div className="flex items-start gap-3">
					<WarningCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
					<div>
						<h2 className="font-medium">Payments could not be configured</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							{connection.error.message}
						</p>
					</div>
				</div>
				<Button variant="outline" onClick={() => connection.refetch()}>
					Try again
				</Button>
			</section>
		);
	}

	const status = connection.data as QuickPaymentConnectStatus;
	const ready = status.connected && status.chargesEnabled;
	const pending = status.connected && !status.chargesEnabled;

	return (
		<section className="space-y-4 rounded-xl border p-5">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex items-start gap-3">
					{ready ? (
						<CheckCircle className="mt-0.5 size-5 shrink-0" weight="fill" />
					) : (
						<CreditCard className="mt-0.5 size-5 shrink-0" />
					)}
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="font-medium">Stripe</h2>
							<Badge variant={ready ? "secondary" : "outline"}>
								{ready
									? "Ready"
									: pending
										? "Setup incomplete"
										: "Not connected"}
							</Badge>
							<Badge variant="outline" className="capitalize">
								{status.environment} mode
							</Badge>
						</div>
						<p className="mt-1 max-w-2xl text-muted-foreground text-sm">
							{ready
								? status.environment === "test"
									? "Sandbox checkout is ready. Test payments cannot enter a live workspace."
									: "Customers can pay your connected business account."
								: pending
									? "Finish Stripe's hosted setup before customers can pay online."
									: "Connect your own Stripe account. QuickDash never holds the business's funds."}
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					{!ready ? (
						<Button
							disabled={onboard.isPending}
							onClick={() => onboard.mutate()}
						>
							{onboard.isPending
								? "Opening Stripe…"
								: pending
									? "Continue setup"
									: "Connect Stripe"}
							<ArrowSquareOut className="size-4" />
						</Button>
					) : null}
					{status.connected ? (
						<Button
							variant="outline"
							disabled={refresh.isPending}
							onClick={() => refresh.mutate()}
						>
							<ArrowClockwise
								className={`size-4 ${refresh.isPending ? "animate-spin" : ""}`}
							/>
							{refresh.isPending ? "Checking…" : "Refresh status"}
						</Button>
					) : null}
				</div>
			</div>
			{ready ? (
				<div className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
					<p>
						<span className="text-muted-foreground">Charges</span>
						<span className="ml-2 font-medium">Enabled</span>
					</p>
					<p>
						<span className="text-muted-foreground">Payouts</span>
						<span className="ml-2 font-medium">
							{status.payoutsEnabled ? "Enabled" : "Pending Stripe review"}
						</span>
					</p>
				</div>
			) : null}
			{error ? <p className="text-destructive text-sm">{error}</p> : null}
		</section>
	);
}
