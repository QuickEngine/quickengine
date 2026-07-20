import { expect, test } from "@playwright/test";
import { countRows, FIXTURE } from "./fixture";

/**
 * Multi-tab — two views of the same workspace converging on truth.
 *
 * The transport is deliberately not the subject here. Realtime push only runs when
 * PUSHER_* is configured (`getRealtimeProvider()` falls back to a no-op otherwise), and
 * e2e has no Pusher keys, so a push-dependent assertion would fail for environmental
 * reasons rather than product ones. What matters — and what is asserted — is that a
 * second tab reflects the first tab's write once it refetches, and that neither tab
 * duplicates the record. The live-push path is covered by the gated test below.
 */
test("a record created in one tab appears in another after it refetches", async ({
	context,
}) => {
	const tabA = await context.newPage();
	const tabB = await context.newPage();
	const listing = `/${FIXTURE.workspaceId}/client-records`;
	await tabA.goto(listing);
	await tabB.goto(listing);

	const before = await countRows("client_records");
	await expect(tabB.getByText("Katherine Johnson")).toBeHidden();

	// Create in tab A.
	await tabA.getByRole("button", { name: /^Add / }).first().click();
	const dialog = tabA.getByRole("dialog");
	await dialog.getByLabel("Name").fill("Katherine Johnson");
	await dialog.getByLabel("Email").fill("katherine@example.com");
	await dialog.getByRole("button", { name: /^Add / }).click();
	await expect(dialog).toBeHidden();

	// Tab B was loaded before the write; it converges once it refetches.
	await tabB.reload();
	await expect(tabB.getByText("Katherine Johnson").first()).toBeVisible();

	// Exactly one record — two open tabs must not double-create.
	expect(await countRows("client_records")).toBe(before + 1);
});

/**
 * The live-push path. Skipped unless Pusher is actually configured, so it exercises real
 * realtime locally for anyone with keys and never flakes in an environment without them.
 */
test("a second tab updates live when realtime is configured", async ({
	context,
}) => {
	test.skip(
		!process.env.PUSHER_APP_ID,
		"PUSHER_APP_ID not set — realtime falls back to the no-op provider.",
	);

	const tabA = await context.newPage();
	const tabB = await context.newPage();
	const listing = `/${FIXTURE.workspaceId}/client-records`;
	await tabA.goto(listing);
	await tabB.goto(listing);

	await tabA.getByRole("button", { name: /^Add / }).first().click();
	const dialog = tabA.getByRole("dialog");
	await dialog.getByLabel("Name").fill("Annie Easley");
	await dialog.getByLabel("Email").fill("annie@example.com");
	await dialog.getByRole("button", { name: /^Add / }).click();

	// No reload — the realtime subscription should refetch tab B on its own.
	await expect(tabB.getByText("Annie Easley").first()).toBeVisible({
		timeout: 15_000,
	});
});
