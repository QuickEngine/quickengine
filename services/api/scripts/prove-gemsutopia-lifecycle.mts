/**
 * Prove the rest of the Gemsutopia lifecycle against the disposable Docker
 * workspace: discounts, delivery, checkout, owned orders, the two-way message
 * round trip, and the storefront-to-portal handoff.
 *
 * Never accepts a remote database or API.
 *
 * ⚠️ Stops short of moving money. Capturing a real PayPal sandbox payment needs
 * credentials this machine does not have, so the checkout assertion covers the
 * order, its authoritative totals, and the reason payment is unavailable. The
 * remaining leg is recorded in TECH_DEBT as an external blocker.
 */
import { readFile } from "node:fs/promises";
import {
	appendCustomerMessage,
	createLoginToken,
	listOperatorConversations,
} from "@quickengine/db";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
	throw new Error(
		"Refusing to prove the lifecycle against a non-local database.",
	);
}
if (databaseUrl.port !== "5435") {
	throw new Error(
		`Expected Docker Postgres on port 5435, got ${databaseUrl.port}.`,
	);
}

const apiBaseUrl = new URL(
	process.env.QUICKCONNECT_API_URL ?? "http://localhost:3021",
);
if (!["localhost", "127.0.0.1", "::1"].includes(apiBaseUrl.hostname)) {
	throw new Error("Refusing to prove the lifecycle against a non-local API.");
}

const envFile = process.env.QUICKCONNECT_ENV_FILE;
if (!envFile?.startsWith("/")) {
	throw new Error("QUICKCONNECT_ENV_FILE must be an absolute path.");
}
const contract = await readFile(envFile, "utf8");
const value = (name: string) => {
	const match = contract.match(new RegExp(`^${name}=(.+)$`, "m"));
	if (!match?.[1])
		throw new Error(`${name} is missing from the proof contract.`);
	return match[1].trim();
};
const workspaceId = value("NEXT_PUBLIC_QUICKDASH_WORKSPACE_ID");
const siteKey = value("NEXT_PUBLIC_QUICKDASH_SITE_KEY");

const request = async <T,>(
	path: string,
	options: {
		body?: unknown;
		method?: string;
		session?: string;
		idempotencyKey?: string;
	} = {},
): Promise<{ body: T; status: number }> => {
	const response = await fetch(new URL(path, apiBaseUrl), {
		method: options.method ?? "GET",
		headers: {
			"Content-Type": "application/json",
			"QuickEngine-Publishable-Key": siteKey,
			...(options.session
				? { "QuickEngine-Customer-Session": options.session }
				: {}),
			// `Idempotency-Key`, the industry-standard spelling — not a QuickEngine-
			// prefixed one. Matches `API_HEADERS.idempotencyKey` and what the SDK sends.
			...(options.idempotencyKey
				? { "Idempotency-Key": options.idempotencyKey }
				: {}),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	return { status: response.status, body: (await response.json()) as T };
};

const signIn = async (email: string) => {
	const login = await createLoginToken({ workspaceId, email });
	const verified = await request<{ data: { token: string } }>(
		"/v1/customer/auth/verify",
		{ method: "POST", body: { token: login.token } },
	);
	if (verified.status !== 200)
		throw new Error(`Verification failed: ${verified.status}`);
	return verified.body.data.token;
};

const expect = (condition: boolean, message: string) => {
	if (!condition) throw new Error(message);
};

const run = Date.now();
const email = `buyer-${run}.synthetic@example.test`;
const session = await signIn(email);

const AMETHYST = "00000000-0000-4000-8000-00000000a201"; // 8500¢, 420g
const LABRADORITE = "00000000-0000-4000-8000-00000000a202"; // 3200¢, 180g
const items = [
	{ catalogItemId: AMETHYST, quantity: 1 },
	{ catalogItemId: LABRADORITE, quantity: 1 },
];
const SUBTOTAL = 8_500 + 3_200;

// ── 1. Discounts ────────────────────────────────────────────────────────────
// The server prices the basket itself. The old prototype took a subtotal from
// the browser, so a minimum was trivially cleared by claiming a bigger order.
type Preview =
	| {
			valid: true;
			code: string;
			subtotalCents: number;
			discountCents: number;
			totalAfterDiscountCents: number;
	  }
	| { valid: false; reason: string; message: string };

const good = await request<{ data: Preview }>("/v1/discounts/preview", {
	method: "POST",
	body: { code: "PROOF10", items },
});
expect(good.status === 200, `Discount preview returned ${good.status}.`);
const preview = good.body.data;
expect(preview.valid, "PROOF10 should be valid against this basket.");
if (!preview.valid) throw new Error("unreachable");
expect(
	preview.subtotalCents === SUBTOTAL,
	`Server priced ${preview.subtotalCents}¢, expected ${SUBTOTAL}¢.`,
);
expect(
	preview.discountCents === Math.round(SUBTOTAL * 0.1),
	`10% of ${SUBTOTAL}¢ should be ${Math.round(SUBTOTAL * 0.1)}¢, got ${preview.discountCents}¢.`,
);

const bogus = await request<{ data: Preview }>("/v1/discounts/preview", {
	method: "POST",
	body: { code: "NOT-A-REAL-CODE", items },
});
expect(
	bogus.status === 200 && bogus.body.data.valid === false,
	"An unknown code should answer 200 with valid:false, not an error.",
);

// A basket under the minimum must be refused on the server's arithmetic, not
// the browser's.
const tooSmall = await request<{ data: Preview }>("/v1/discounts/preview", {
	method: "POST",
	body: {
		code: "PROOF10",
		items: [{ catalogItemId: LABRADORITE, quantity: 1 }],
	},
});
expect(
	tooSmall.body.data.valid === false,
	"A 3200¢ basket is under the 5000¢ minimum and must be refused.",
);

// ── 2. Delivery ─────────────────────────────────────────────────────────────
type Quote = {
	options: Array<{
		rateId: string;
		name: string;
		amountCents: number;
		free: boolean;
	}>;
};
const destination = {
	countryCode: "CA",
	regionCode: "ON",
	postalCode: "M5V 2T6",
};
const quoted = await request<{ data: Quote }>("/v1/shipping/quote", {
	method: "POST",
	body: { items, destination, discountCode: "PROOF10" },
});
expect(quoted.status === 200, `Shipping quote returned ${quoted.status}.`);
const options = quoted.body.data.options;
expect(
	options.length >= 2,
	`Expected both seeded rates, got ${options.length}.`,
);
const cheapest = [...options].sort((a, b) => a.amountCents - b.amountCents)[0];
if (!cheapest) throw new Error("No delivery option came back.");
expect(
	Boolean(cheapest.rateId),
	"Every option must carry a rateId; checkout names the id, never an amount.",
);

// ── 3. Checkout ─────────────────────────────────────────────────────────────
type CheckoutResult = {
	order: {
		id: string;
		number: string;
		subtotalCents: number;
		totalCents: number;
		discountCents?: number;
		shippingCents?: number;
	};
	payment: { provider: string; externalPaymentId: string } | null;
	paymentUnavailableReason?: string;
};

const idempotencyKey = `proof-${run}`;
const checkoutBody = {
	items,
	email,
	name: "Synthetic Buyer",
	discountCode: "PROOF10",
	shippingRateId: cheapest.rateId,
	shippingAddress: {
		name: "Synthetic Buyer",
		line1: "1 Proof Street",
		city: "Toronto",
		region: "ON",
		postalCode: "M5V 2T6",
		countryCode: "CA",
	},
};
const checkout = await request<{ data: CheckoutResult }>("/v1/checkout", {
	method: "POST",
	body: checkoutBody,
	session,
	idempotencyKey,
});
expect(
	checkout.status === 201,
	`Checkout returned ${checkout.status}: ${JSON.stringify(checkout.body).slice(0, 300)}`,
);
const { order } = checkout.body.data;
expect(
	order.subtotalCents === SUBTOTAL,
	`Order subtotal ${order.subtotalCents}¢, expected ${SUBTOTAL}¢.`,
);
const expectedTotal =
	SUBTOTAL - Math.round(SUBTOTAL * 0.1) + cheapest.amountCents;
expect(
	order.totalCents === expectedTotal,
	`Order total ${order.totalCents}¢, expected ${expectedTotal}¢.`,
);

// 🔴 Replaying the same idempotency key must return the SAME order, not a
// second one. This is what makes a double-tapped buy button safe.
const replay = await request<{ data: CheckoutResult }>("/v1/checkout", {
	method: "POST",
	body: checkoutBody,
	session,
	idempotencyKey,
});
expect(
	replay.body.data.order.id === order.id,
	"A replayed idempotency key created a SECOND order.",
);

// ⚠️ No payment provider is connected locally, so the sale is recorded and the
// reason is stated plainly rather than the shopper meeting a dead button. The
// capture leg needs PayPal sandbox credentials — see TECH_DEBT.
const paymentProven = checkout.body.data.payment !== null;
expect(
	paymentProven || Boolean(checkout.body.data.paymentUnavailableReason),
	"Checkout without a connected provider must say why payment is unavailable.",
);

// ── 4. Owned orders ─────────────────────────────────────────────────────────
type OrderPage = { items: Array<{ id: string }> };
const mine = await request<{ data: OrderPage }>("/v1/customer/orders", {
	session,
});
expect(mine.status === 200, `Owned orders returned ${mine.status}.`);
expect(
	mine.body.data.items.some((row) => row.id === order.id),
	"The buyer cannot see the order they just placed.",
);

const stranger = await signIn(`stranger-${run}.synthetic@example.test`);
const notMine = await request<{ data: OrderPage }>("/v1/customer/orders", {
	session: stranger,
});
expect(
	!notMine.body.data.items.some((row) => row.id === order.id),
	"🔴 A different customer can see somebody else's order.",
);
const forbidden = await request(`/v1/customer/orders/${order.id}`, {
	session: stranger,
});
expect(
	forbidden.status === 404,
	`Another customer's order detail answered ${forbidden.status}, expected 404.`,
);

// ── 5. Two-way messages ─────────────────────────────────────────────────────
const started = await request<{ data: { id: string } }>(
	"/v1/customer/messages",
	{
		method: "POST",
		session,
		body: { subject: "Where is my order?", body: "Synthetic proof question." },
	},
);
expect(
	started.status === 201,
	`Starting a conversation returned ${started.status}.`,
);
const conversationId = started.body.data.id;

// The operator answers from QuickDash's side of the same thread.
const operatorView = await listOperatorConversations(workspaceId);
expect(
	operatorView.some((row) => row.id === conversationId),
	"The operator cannot see the conversation the customer started.",
);
await appendCustomerMessage({
	conversationId,
	sender: "operator",
	body: "Synthetic proof answer.",
});

const thread = await request<{
	data: { messages: Array<{ sender: string; body: string }> };
}>(`/v1/customer/messages/${conversationId}`, { session });
expect(
	thread.body.data.messages.some(
		(m) => m.sender === "operator" && m.body === "Synthetic proof answer.",
	),
	"The customer cannot see the operator's reply — the round trip is broken.",
);

const eavesdrop = await request(`/v1/customer/messages/${conversationId}`, {
	session: stranger,
});
expect(
	eavesdrop.status === 404,
	`🔴 Another customer read a private conversation (${eavesdrop.status}).`,
);

// ── 6. Storefront to portal handoff ─────────────────────────────────────────
const handoff = await request<{ data: { token: string } }>(
	"/v1/customer/portal-handoff",
	{ method: "POST", session },
);
expect(handoff.status === 200, `Minting a handoff returned ${handoff.status}.`);
expect(
	handoff.body.data.token !== session,
	"🔴 The handoff token IS the storefront session — nothing was exchanged.",
);

const redeemed = await request<{ data: { token: string } }>(
	"/v1/customer/portal-handoff/redeem",
	{ method: "POST", body: { token: handoff.body.data.token } },
);
expect(redeemed.status === 200, `Redeeming returned ${redeemed.status}.`);
const portalSession = redeemed.body.data.token;
expect(
	portalSession !== session,
	"The portal was handed the storefront's own session rather than a new one.",
);

// The new session is real, and belongs to the same person.
const whoami = await request<{ data: { email: string } }>(
	"/v1/customer/auth/me",
	{ session: portalSession },
);
expect(
	whoami.status === 200 && whoami.body.data.email === email,
	"The portal session does not resolve to the shopper who was handed over.",
);

const replayedHandoff = await request("/v1/customer/portal-handoff/redeem", {
	method: "POST",
	body: { token: handoff.body.data.token },
});
expect(
	replayedHandoff.status === 401,
	`🔴 A spent handoff was accepted twice (${replayedHandoff.status}).`,
);

// Signing out of the storefront must NOT kill the portal session. This is the
// property a shared token could never have.
await request("/v1/customer/auth/sign-out", { method: "POST", session });
const storefrontDead = await request("/v1/customer/auth/me", { session });
const portalAlive = await request("/v1/customer/auth/me", {
	session: portalSession,
});
expect(
	storefrontDead.status === 401,
	"The storefront session survived sign-out.",
);
expect(
	portalAlive.status === 200,
	"Signing out of the storefront also killed the portal session — they are not independent.",
);

console.info(
	[
		"Lifecycle proof passed:",
		`discount priced server-side (${preview.discountCents}¢ off ${preview.subtotalCents}¢),`,
		`${options.length} delivery options with rate ids,`,
		`order ${order.number} at ${order.totalCents}¢ with idempotent replay,`,
		"owned orders isolated from another customer,",
		"operator/customer message round trip,",
		"portal handoff single-use and independent of the storefront session.",
		paymentProven
			? "Payment opened against a connected provider."
			: `Payment leg NOT proven: ${checkout.body.data.paymentUnavailableReason}`,
	].join(" "),
);
