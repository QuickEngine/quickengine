import { expect, test } from "@playwright/test";
import { countRows, FIXTURE } from "./fixture";

/**
 * Double submit — the "one submission, one record" contract, end to end.
 *
 * Two layers enforce this: the submit button disables while the action is pending
 * (`useFormStatus`), and the server claims a per-submit idempotency key. In a browser the
 * client guard wins first — literally: an earlier version of this test tried to click
 * twice and Playwright timed out waiting 30s for the button to become enabled again.
 * That IS the guard working, so the test asserts it directly rather than pretending a
 * second click is possible.
 *
 * The server key's race behavior — two requests genuinely in flight at once, which no
 * browser can produce through this form — is covered by the concurrent-claims
 * integration test.
 *
 * Client Records is used rather than Payments so this can't collide with the row the
 * retry flow leaves behind; the count is asserted as a delta regardless.
 */
test("the create button locks while submitting, so one submission creates one record", async ({
	page,
}) => {
	await page.goto(`/${FIXTURE.workspaceId}/client-records`);
	const before = await countRows("client_records");

	// Hold the server action briefly so the pending window is deterministic rather than
	// a race against a fast local roundtrip.
	await page.route(
		`**/${FIXTURE.workspaceId}/client-records`,
		async (route) => {
			if (route.request().method() !== "POST") return route.continue();
			await new Promise((resolve) => setTimeout(resolve, 1_000));
			return route.continue();
		},
	);

	// The record label is workspace-configurable, so match the shape, not the word.
	await page.getByRole("button", { name: /^Add / }).first().click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	await dialog.getByLabel("Name").fill("Grace Hopper");
	await dialog.getByLabel("Email").fill("grace@example.com");

	const submit = dialog.getByRole("button", { name: /^Add / });
	await submit.click();

	// The moment it is in flight the control is disabled — a second submit is not
	// reachable through the UI at all.
	// This view's pending label is "Saving…" (others use "Working…") — match either.
	await expect(
		dialog.getByRole("button", { name: /^(Saving|Working)…$/ }),
	).toBeDisabled();

	await expect(dialog).toBeHidden({ timeout: 15_000 });
	expect(await countRows("client_records")).toBe(before + 1);
});
