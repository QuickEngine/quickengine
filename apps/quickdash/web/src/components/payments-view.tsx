import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { Card } from "./dash-card";
import { WriteFailure } from "./page-state";

/**
 * Connecting somewhere to get paid.
 *
 * 🔴 Both providers are shown ALWAYS, connected or not. Businesses differ in
 * which one they use, and a page that surfaced only the connected provider
 * would leave somebody unable to find the one they actually take money with.
 * The API has been provider-neutral the whole time; only this screen was
 * Stripe-shaped.
 */
/**
 * Every way a business might take money.
 *
 * 🔴 Only Stripe and PayPal can be CONNECTED today — `connect.ts` accepts
 * exactly those two, and everything else here is named with `soon: true`. That
 * split is the point: this is the map of where payments is going, and a row
 * that says "soon" is honest where a row that opened a broken setup flow would
 * not be.
 *
 * ⚠️ Adding one to this list does NOT make it work. It needs a provider in the
 * payments seam — capture, refund, webhook verification and a saved method for
 * renewals — before its `soon` comes off.
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

	// ── Cards and wallets ────────────────────────────────────────────────
	{
		id: "square",
		name: "Square",
		blurb: "Online and at a counter, one balance.",
		mode: "hosted" as const,
		soon: true,
	},
	{
		id: "adyen",
		name: "Adyen",
		blurb: "One processor across many countries and methods.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "braintree",
		name: "Braintree",
		blurb: "Cards and PayPal under one account.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "checkout-com",
		name: "Checkout.com",
		blurb: "Enterprise card processing with local acquiring.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "mollie",
		name: "Mollie",
		blurb: "European methods: iDEAL, Bancontact, SEPA.",
		mode: "hosted" as const,
		soon: true,
	},
	{
		id: "worldpay",
		name: "Worldpay",
		blurb: "Long-established acquiring for larger volumes.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "authorize-net",
		name: "Authorize.net",
		blurb: "Card processing for North American merchants.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "amazon-pay",
		name: "Amazon Pay",
		blurb: "Checkout with an Amazon account.",
		mode: "hosted" as const,
		soon: true,
	},
	{
		id: "shopify-payments",
		name: "Shopify Payments",
		blurb: "For a shop already selling through Shopify.",
		mode: "hosted" as const,
		soon: true,
	},
	{
		id: "sumup",
		name: "SumUp",
		blurb: "Card reader and online payments for small shops.",
		mode: "hosted" as const,
		soon: true,
	},
	{
		id: "zettle",
		name: "Zettle",
		blurb: "PayPal's card reader for in-person sales.",
		mode: "hosted" as const,
		soon: true,
	},

	// ── Regional ─────────────────────────────────────────────────────────
	{
		id: "razorpay",
		name: "Razorpay",
		blurb: "Cards, UPI and wallets in India.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "paystack",
		name: "Paystack",
		blurb: "Cards and transfers across Africa.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "flutterwave",
		name: "Flutterwave",
		blurb: "Pan-African payments and payouts.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "mercado-pago",
		name: "Mercado Pago",
		blurb: "The default across Latin America.",
		mode: "hosted" as const,
		soon: true,
	},
	{
		id: "alipay",
		name: "Alipay",
		blurb: "China's most used wallet.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "wechat-pay",
		name: "WeChat Pay",
		blurb: "Pay inside the app your customer already has.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "pix",
		name: "Pix",
		blurb: "Instant bank transfer in Brazil.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "interac",
		name: "Interac",
		blurb: "Debit and e-Transfer in Canada.",
		mode: "credentials" as const,
		soon: true,
	},

	// ── Pay later ────────────────────────────────────────────────────────
	{
		id: "klarna",
		name: "Klarna",
		blurb: "Pay in instalments, you are paid up front.",
		mode: "hosted" as const,
		soon: true,
	},
	{
		id: "afterpay",
		name: "Afterpay",
		blurb: "Four payments, no interest to the customer.",
		mode: "hosted" as const,
		soon: true,
	},
	{
		id: "affirm",
		name: "Affirm",
		blurb: "Financing for larger baskets.",
		mode: "hosted" as const,
		soon: true,
	},
	{
		id: "zip",
		name: "Zip",
		blurb: "Buy now, pay later across several markets.",
		mode: "hosted" as const,
		soon: true,
	},

	// ── Bank and transfer ────────────────────────────────────────────────
	{
		id: "gocardless",
		name: "GoCardless",
		blurb: "Direct debit for recurring bills.",
		mode: "hosted" as const,
		soon: true,
	},
	{
		id: "plaid",
		name: "Plaid",
		blurb: "Pay from a bank account, no card fees.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "dwolla",
		name: "Dwolla",
		blurb: "ACH transfers for larger amounts.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "trustly",
		name: "Trustly",
		blurb: "Bank payments across Europe and the US.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "wise",
		name: "Wise",
		blurb: "Take and send money across currencies.",
		mode: "credentials" as const,
		soon: true,
	},

	// ── Crypto ───────────────────────────────────────────────────────────
	{
		id: "coinbase-commerce",
		name: "Coinbase Commerce",
		blurb: "Accept crypto, settle in currency or hold it.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "solana-pay",
		name: "Solana Pay",
		blurb: "Stablecoins on Solana, settled in seconds.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "bitpay",
		name: "BitPay",
		blurb: "Bitcoin and stablecoins with automatic conversion.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "opennode",
		name: "OpenNode",
		blurb: "Bitcoin over Lightning, near-zero fees.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "reown",
		name: "Reown",
		blurb: "Wallet payments across many chains.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "helio",
		name: "Helio",
		blurb: "Solana checkout with no wallet pop-ups.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "nowpayments",
		name: "NOWPayments",
		blurb: "Two hundred coins, one integration.",
		mode: "credentials" as const,
		soon: true,
	},
	{
		id: "crypto-com-pay",
		name: "Crypto.com Pay",
		blurb: "Pay from a Crypto.com account.",
		mode: "credentials" as const,
		soon: true,
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
	"h-9 w-full field rounded-md px-3 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-20)]";

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
					className={`${pill} ${busy ? "shimmer-busy" : ""}`}
					data-hint={
						!clientId.trim() || !clientSecret.trim()
							? "Both keys are needed to connect"
							: undefined
					}
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
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	// Which provider's credential form is open. A connected provider keeps its
	// form closed until somebody chooses to replace what is stored.
	const [editing, setEditing] = useState<string | null>(null);

	/**
	 * 🔴 Only the providers that can actually be connected are asked about.
	 *
	 * `PROVIDERS` is the map of where payments is going — thirty-odd entries —
	 * and querying each one's status would fire thirty requests on every visit
	 * to ask about providers the API has never heard of. `enabled` on the
	 * unbuilt ones keeps the array positional so `results[index]` still lines
	 * up, without any of them going out.
	 */
	const results = useQueries({
		queries: PROVIDERS.map((provider) => ({
			queryKey: ["quickdash", workspaceId, "connect", provider.id],
			enabled: !("soon" in provider && provider.soon),
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
			setFailure({ error: error, fallback: "That did not work." }),
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

	/**
	 * 🔴 The way out, which did not exist.
	 *
	 * Onboarding refuses once charges are enabled and nothing could remove the
	 * record, so a workspace whose connection had become unusable was stuck with
	 * it for good. On 2026-08-23 an account was orphaned when the Stripe sandbox
	 * that created it went away: every request answered 403, checkout could not
	 * take a payment, and the only fix was a DELETE against production by hand.
	 *
	 * ⚠️ Confirmed first. It is not destructive at the provider — the business
	 * keeps its account, its money and its history — but it does stop the shop
	 * taking payment until something is connected again, and that deserves a
	 * deliberate answer rather than a stray click.
	 */
	const disconnect = useMutation({
		mutationFn: async (provider: string) => {
			await workspaceApi(workspaceId).request(
				`/payments/connect/disconnect?provider=${provider}`,
				{ method: "POST" },
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That could not be disconnected." }),
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
			setFailure({
				error: error,
				fallback: "Those credentials were not accepted.",
			}),
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
			setFailure({ error: error, fallback: "That provider is not connected." }),
		onSuccess: refresh,
	});

	const environment = results.find((result) => result.data)?.data?.environment;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-4">
				{/* 🔴 No "Where you get paid" heading: the breadcrumb already says
				    Payments › Providers, and a title repeating it is a third answer
				    to a question answered twice above. */}
				<p className="text-[11.5px] text-[var(--ink-30)]">
					Connect one or both. Checkout uses whichever is set as default.
					{environment === "test"
						? " This workspace is in test mode, so no real money can move."
						: null}
				</p>
			</div>

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			{/*
			 * 🔴 Cards on a grid, not hairline rows in a narrow stack. Providers
			 * was the last surface still using the old section list.
			 *
			 * ⚠️ `items-start`, and it matters here more than anywhere else. Grid
			 * items stretch to their row by default and `Card` carries `h-full`
			 * for the dashboard's bento — so a connected Stripe, which is one
			 * sentence and a button, was being stretched to match PayPal showing a
			 * whole credentials form beside it. Each card is its own height.
			 */}
			<div className="grid auto-rows-min grid-cols-1 items-start gap-3 lg:grid-cols-2">
				{PROVIDERS.map((provider, index) => {
					const query = results[index];
					const status = query.data;
					const state = statusOf(status);
					const busy =
						(onboard.isPending && onboard.variables === provider.id) ||
						(recheck.isPending && recheck.variables === provider.id);

					/**
					 * 🔴 Named, not connectable. Drawing a working setup button for a
					 * provider the API cannot talk to is the one thing worse than not
					 * listing it: you would fill in credentials and nothing would
					 * happen. The card says "soon" and offers nothing.
					 */
					const soon = "soon" in provider && provider.soon === true;
					const wantsCredentials = provider.mode === "credentials";
					/**
					 * 🔴 Only when asked for.
					 *
					 * This used to open itself for any credentials provider that was
					 * not yet connected — so PayPal's card sat permanently four times
					 * the height of Stripe's, and dragged the grid row they share up
					 * with it. Connecting is a deliberate act; the form appears when
					 * you press the button.
					 */
					const formOpen = !soon && editing === provider.id;

					return (
						<Card key={provider.id}>
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
											{soon
												? "Soon"
												: query.isPending
													? "Checking…"
													: state.label}
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
									{soon ? null : status?.connected ? (
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
											{status.connected ? (
												<button
													type="button"
													className={outlined}
													disabled={busy}
													onClick={() => {
														if (
															!window.confirm(
																`Disconnect ${provider.name}? This shop stops taking payment until you connect one again. Your ${provider.name} account, its money and its history are not touched.`,
															)
														)
															return;
														disconnect.mutate(provider.id);
													}}
												>
													{disconnect.isPending &&
													disconnect.variables === provider.id
														? "Disconnecting…"
														: "Disconnect"}
												</button>
											) : null}
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
									) : wantsCredentials ? (
										<button
											type="button"
											className={pill}
											onClick={() => setEditing(formOpen ? null : provider.id)}
										>
											{formOpen ? "Cancel" : `Connect ${provider.name}`}
										</button>
									) : (
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
						</Card>
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
