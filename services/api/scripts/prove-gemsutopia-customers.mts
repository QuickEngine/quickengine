/**
 * Prove customer identity and isolation against the disposable Gemsutopia
 * Docker workspace. Never accepts a remote database or API.
 */
import { readFile } from "node:fs/promises";
import { createLoginToken } from "@quickengine/db";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
	throw new Error("Refusing to prove customers against a non-local database.");
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
	throw new Error("Refusing to prove customers against a non-local API.");
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
	options: { body?: unknown; method?: string; session?: string } = {},
): Promise<{ body: T; status: number }> => {
	const response = await fetch(new URL(path, apiBaseUrl), {
		method: options.method ?? "GET",
		headers: {
			"Content-Type": "application/json",
			"QuickEngine-Publishable-Key": siteKey,
			...(options.session
				? { "QuickEngine-Customer-Session": options.session }
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

const run = Date.now();
const alice = await signIn(`alice-${run}.synthetic@example.test`);
const bob = await signIn(`bob-${run}.synthetic@example.test`);
const amethyst = "00000000-0000-4000-8000-00000000a201";
const labradorite = "00000000-0000-4000-8000-00000000a202";
const quartz = "00000000-0000-4000-8000-00000000a203";

await request("/v1/customer/wishlist", {
	method: "POST",
	session: alice,
	body: { catalogItemId: amethyst },
});
await request("/v1/customer/wishlist/merge", {
	method: "POST",
	session: alice,
	body: { items: [{ catalogItemId: quartz }] },
});
await request("/v1/customer/wishlist", {
	method: "POST",
	session: bob,
	body: { catalogItemId: labradorite },
});

const aliceList = await request<{
	data: { items: Array<{ catalogItemId: string }> };
}>("/v1/customer/wishlist", { session: alice });
const bobList = await request<{
	data: { items: Array<{ catalogItemId: string }> };
}>("/v1/customer/wishlist", { session: bob });
const aliceIds = new Set(
	aliceList.body.data.items.map((item) => item.catalogItemId),
);
const bobIds = new Set(
	bobList.body.data.items.map((item) => item.catalogItemId),
);
if (
	!aliceIds.has(amethyst) ||
	!aliceIds.has(quartz) ||
	aliceIds.has(labradorite)
) {
	throw new Error("Alice's wishlist was not isolated.");
}
if (!bobIds.has(labradorite) || bobIds.has(amethyst) || bobIds.has(quartz)) {
	throw new Error("Bob's wishlist was not isolated.");
}

const review = await request<{ data: { verifiedPurchase: boolean } }>(
	"/v1/customer/reviews",
	{
		method: "POST",
		session: alice,
		body: { catalogItemId: amethyst, rating: 5, body: "Synthetic proof" },
	},
);
const referral = await request<{ data: { code: string } }>(
	"/v1/customer/referral-code",
	{
		method: "POST",
		session: alice,
	},
);
if (
	review.status !== 201 ||
	review.body.data.verifiedPurchase !== false ||
	referral.status !== 200 ||
	!referral.body.data.code
) {
	throw new Error(
		`Customer review/referral proof returned review=${review.status}, referral=${referral.status}.`,
	);
}

await request("/v1/customer/auth/sign-out", { method: "POST", session: bob });
const revoked = await request("/v1/customer/auth/me", { session: bob });
if (revoked.status !== 401)
	throw new Error("Signed-out customer session remained usable.");

console.info(
	`Customer proof passed: 2 isolated sessions, ${aliceIds.size + bobIds.size} private wishlist items, pending unverified review, owned referral code, sign-out revoked.`,
);
