import { expect, test } from "@playwright/test";

/**
 * Step 1 of the harness: proves the whole rig works — the e2e database provisions,
 * the QuickDash server boots against it, and Playwright can drive a real browser
 * against a real running app. Everything else builds on this.
 */
test("the app is up and connected to the e2e database", async ({ request }) => {
	const response = await request.get("/api/health");
	expect(response.status()).toBe(200);
	await expect(response.json()).resolves.toMatchObject({ status: "ok" });
});

// Every other project inherits the seeded session; this one must not, or "signed out"
// isn't what's being tested.
test.use({ storageState: { cookies: [], origins: [] } });

test("an unauthenticated visitor is redirected away from the workspace root", async ({
	page,
}) => {
	// `/` bounces to the auth app (not running under e2e), so assert on the redirect
	// itself rather than the destination — this is the signed-out contract.
	const response = await page.request.get("/", { maxRedirects: 0 });
	expect(response.status()).toBe(307);
});
