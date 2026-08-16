import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";

/**
 * Connecting somewhere to get paid.
 *
 * 🔴 Both providers are shown ALWAYS, connected or not. Gemsutopia and
 * Woolenlillies take PayPal while Caffeinate takes Stripe, and a page that
 * surfaced only the connected one would leave a business unable to find the
 * provider it actually uses. The API has been provider-neutral the whole time;
 * only this screen was Stripe-shaped.
 */
const PROVIDERS = [
	{
		id: "stripe",
		name: "Stripe",
		blurb: "Cards, wallets and bank debits. Money settles to your bank.",
		/** Stripe hosts its own setup, so connecting is a redirect. */
		mode: "hosted" as const,
	},
	{
		id: "paypal",
		name: "PayPal",
		blurb: "PayPal balance and cards. Money settles to your PayPal account.",
		/**
		 * PayPal reserves its hosted setup for approved partners. QuickEngine is
		 * deliberately not one — it takes no cut of what a business earns — so the
		 * business connects its own app instead.
		 */
		mode: "credentials" as const,
	},
] as const;

type ConnectStatus = {
	environment: "test" | "live";
	provider: string;
	connected: boolean;
	chargesEnabled?: boolean;
	payoutsEnabled?: boolean;
	status?: string;
	/** Present only for a provider connected with its own app credentials. */
	credentials?: { clientId: string | null; webhookConfigured: boolean };
};

const field =
	"h-9 w-full rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

/**
 * Connecting a provider the business owns.
 *
 * ⚠️ More friction than Stripe's one-click setup, and that is PayPal's doing
 * rather than a corner cut here. What this page CAN do is remove the guesswork:
 * name the exact PayPal screens, validate the moment it is submitted, and never
 * ask for the values twice.
 */
function CredentialForm({
	providerName,
	environment,
	workspaceId,
	busy,
	onSubmit,
}: {
	providerName: string;
	environment: "test" | "live" | undefined;
	workspaceId: string;
	busy: boolean;
	onSubmit: (values: {
		clientId: string;
		clientSecret: string;
		webhookId?: string;
	}) => void;
}) {
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [webhookId, setWebhookId] = useState("");
	const [copied, setCopied] = useState(false);

	/**
	 * 🔴 The workspace is IN the URL, and it has to be. Each business registers a
	 * webhook against its own PayPal app, so QuickDash must know which business
	 * sent an event before it can check the signature at all — and taking that
	 * from the payload would mean trusting an unverified body.
	 */
	const webhookUrl = `${import.meta.env.VITE_API_URL ?? "https://api.quickdash.xyz"}/webhooks/paypal/connect/${environment ?? "live"}/${workspaceId}`;

	return (
		<form
			className="mt-3 rounded-xl border border-[var(--console-line-soft)] p-3.5"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit({
					clientId: clientId.trim(),
					clientSecret: clientSecret.trim(),
					webhookId: webhookId.trim() || undefined,
				});
			}}
		>
			<ol className="mb-3 space-y-1 text-[11.5px] text-[var(--ink-45)]">
				<li>
					1. In {providerName}, open <b>Apps &amp; Credentials</b> and create an
					app{" "}
					{environment === "test" ? (
						<>
							under <b>Sandbox</b>
						</>
					) : (
						<>
							under <b>Live</b>
						</>
					)}
					.
				</li>
				<li>2. Copy its client id and secret into the boxes below.</li>
				<li>
					3. In the same app, add a webhook pointing at the address below,
					subscribed to payment capture completed, denied and refunded. Paste
					the webhook id PayPal gives you into the third box.
				</li>
			</ol>

			<div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--console-line-soft)] px-2.5 py-2">
				<code className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-60)]">
					{webhookUrl}
				</code>
				<button
					type="button"
					className="shrink-0 rounded-full border border-[var(--console-line-strong)] px-2.5 py-0.5 text-[10.5px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
					onClick={() => {
						navigator.clipboard.writeText(webhookUrl);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
				>
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			{/* Said plainly, because a connection without it looks finished and
			    silently misses every refund. */}
			<p className="mb-3 text-[11px] text-[var(--ink-30)]">
				Without a webhook, payments and refunds will not reach this workspace.
			</p>

			<div className="space-y-2">
				<input
					value={clientId}
					onChange={(event) => setClientId(event.target.value)}
					placeholder="Client ID"
					autoComplete="off"
					className={field}
				/>
				{/* type=password so a shoulder or a screen share does not read it, and
				    autoComplete off so no browser offers to remember a payment secret. */}
				<input
					value={clientSecret}
					onChange={(event) => setClientSecret(event.target.value)}
					placeholder="Secret"
					type="password"
					autoComplete="off"
					className={field}
				/>
				<input
					value={webhookId}
					onChange={(event) => setWebhookId(event.target.value)}
					placeholder="Webhook ID (optional)"
					autoComplete="off"
					className={field}
				/>
			</div>

			<div className="mt-3 flex items-center gap-2">
				<button
					type="submit"
					className={pill}
					disabled={busy || !clientId.trim() || !clientSecret.trim()}
				>
					{busy ? "Checking with PayPal…" : "Connect"}
				</button>
				<p className="text-[11px] text-[var(--ink-30)]">
					Checked with {providerName} before it is saved.
				</p>
			</div>
		</form>
	);
}

const pill =
	"inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-3.5 text-[12px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85 disabled:opacity-40";

const outlined =
	"inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-3.5 text-[12px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.05)] hover:text-[var(--ink-90)] disabled:opacity-40";

/**
 * What a business actually needs to know, in the order it matters.
 *
 * 🔴 "Connected" is NOT the question — the Stripe defect of 2026-08-11 showed a
 * green account to an operator who could not take a single payment, because the
 * capability behind it was inactive. So chargeability is the headline and
 * connection is merely a precondition.
 */
function statusOf(status: ConnectStatus | undefined) {
	if (!status?.connected) {
		return { label: "Not connected", tone: "muted" as const };
	}
	if (!status.chargesEnabled) {
		return { label: "Finishing setup", tone: "warn" as const };
	}
	if (!status.payoutsEnabled) {
		// Real, and worth saying, but it does not stop a sale.
		return { label: "Ready, payouts pending", tone: "ok" as const };
	}
	return { label: "Ready", tone: "ok" as const };
}

export function PaymentsView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [failure, setFailure] = useState<string | null>(null);
	// Which provider's credential form is open. A connected provider keeps its
	// form closed until somebody chooses to replace what is stored.
	const [editing, setEditing] = useState<string | null>(null);

	const results = useQueries({
		queries: PROVIDERS.map((provider) => ({
			queryKey: ["quickdash", workspaceId, "connect", provider.id],
			queryFn: async () =>
				(
					await workspaceApi(workspaceId).request<ConnectStatus>(
						`/payments/connect?provider=${provider.id}`,
					)
				).data,
		})),
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "connect"],
		});

	const onboard = useMutation({
		mutationFn: async (provider: string) => {
			// 🔴 Both urls must be our own origin. The API refuses anything else,
			// because the operator arrives back from a payment provider's domain and
			// an open redirect there is the most credible phishing setup available
			// against a business owner.
			const here = `${window.location.origin}/${workspaceId}/payments`;
			const { data } = await workspaceApi(workspaceId).request<{
				onboardingUrl: string;
			}>("/payments/connect/onboard", {
				method: "POST",
				body: { provider, returnUrl: here, refreshUrl: here },
			});
			return data.onboardingUrl;
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That did not work."),
		onSuccess: (url) => {
			window.location.assign(url);
		},
	});

	const recheck = useMutation({
		mutationFn: async (provider: string) => {
			await workspaceApi(workspaceId).request(
				`/payments/connect/refresh?provider=${provider}`,
				{ method: "POST" },
			);
		},
		onSuccess: refresh,
	});

	const connectCredentials = useMutation({
		mutationFn: async (values: {
			provider: string;
			clientId: string;
			clientSecret: string;
			webhookId?: string;
		}) => {
			await workspaceApi(workspaceId).request("/payments/connect/credentials", {
				method: "POST",
				body: values,
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "Those credentials were not accepted."),
		onSuccess: () => {
			setEditing(null);
			refresh();
		},
	});

	const makeDefault = useMutation({
		mutationFn: async (provider: string) => {
			await workspaceApi(workspaceId).request("/payments/connect/default", {
				method: "PUT",
				body: { provider },
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That provider is not connected."),
		onSuccess: refresh,
	});

	const environment = results.find((result) => result.data)?.data?.environment;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-4">
				<p className="text-[12.5px] text-[var(--ink-85)]">Where you get paid</p>
				<p className="mt-0.5 text-[11.5px] text-[var(--ink-30)]">
					Connect one or both. Checkout uses whichever is set as default.
					{environment === "test"
						? " This workspace is in test mode, so no real money can move."
						: null}
				</p>
			</div>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

			<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-y">
				{PROVIDERS.map((provider, index) => {
					const query = results[index];
					const status = query.data;
					const state = statusOf(status);
					const busy =
						(onboard.isPending && onboard.variables === provider.id) ||
						(recheck.isPending && recheck.variables === provider.id);

					const wantsCredentials = provider.mode === "credentials";
					const formOpen =
						editing === provider.id ||
						(wantsCredentials && !status?.connected && !query.isPending);

					return (
						<div key={provider.id} className="py-3.5">
							<div className="flex items-center gap-4">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<p className="text-[12.5px] text-[var(--ink-85)]">
											{provider.name}
										</p>
										<span
											className={`rounded-full px-2 py-0.5 text-[10.5px] ${
												state.tone === "ok"
													? "bg-[rgb(var(--console-ink)/0.08)] text-[var(--ink-70)]"
													: state.tone === "warn"
														? "bg-[rgb(var(--console-ink)/0.08)] text-[var(--ink-85)]"
														: "bg-[rgb(var(--console-ink)/0.04)] text-[var(--ink-30)]"
											}`}
										>
											{query.isPending ? "Checking…" : state.label}
										</span>
									</div>
									<p className="mt-0.5 text-[11.5px] text-[var(--ink-30)]">
										{status?.credentials?.clientId
											? `Connected as ${status.credentials.clientId}${
													status.credentials.webhookConfigured
														? ""
														: " · no webhook yet, so refunds and completed payments will not reach this workspace"
												}`
											: provider.blurb}
									</p>
								</div>

								<div className="flex shrink-0 items-center gap-2">
									{status?.connected ? (
										<>
											{wantsCredentials ? (
												<button
													type="button"
													className={outlined}
													onClick={() =>
														setEditing(formOpen ? null : provider.id)
													}
												>
													{formOpen ? "Cancel" : "Replace credentials"}
												</button>
											) : (
												<button
													type="button"
													className={outlined}
													disabled={busy}
													onClick={() => recheck.mutate(provider.id)}
												>
													{recheck.isPending &&
													recheck.variables === provider.id
														? "Checking…"
														: "Check again"}
												</button>
											)}
											{!status.chargesEnabled && !wantsCredentials ? (
												// Resumable: the hosted link expires long before a
												// half-finished seller gives up, and minting a second
												// account instead of resuming is how one business ends
												// up with two merchant records.
												<button
													type="button"
													className={pill}
													disabled={busy}
													onClick={() => onboard.mutate(provider.id)}
												>
													Finish setup
												</button>
											) : (
												<button
													type="button"
													className={outlined}
													onClick={() => makeDefault.mutate(provider.id)}
												>
													Use for checkout
												</button>
											)}
										</>
									) : wantsCredentials ? null : (
										<button
											type="button"
											className={pill}
											disabled={busy}
											onClick={() => onboard.mutate(provider.id)}
										>
											{busy ? "Opening…" : `Connect ${provider.name}`}
										</button>
									)}
								</div>
							</div>

							{formOpen ? (
								<CredentialForm
									providerName={provider.name}
									environment={environment}
									workspaceId={workspaceId}
									busy={connectCredentials.isPending}
									onSubmit={(values) =>
										connectCredentials.mutate({
											provider: provider.id,
											...values,
										})
									}
								/>
							) : null}
						</div>
					);
				})}
			</div>

			<p className="mt-4 text-[11px] text-[var(--ink-30)]">
				Historical payments keep the provider that took them, so changing the
				default never rewrites a past sale or its refunds.
			</p>
		</main>
	);
}
