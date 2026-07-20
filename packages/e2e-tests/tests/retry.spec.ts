import { expect, test } from "@playwright/test";
import { countRows, FIXTURE } from "./fixture";

/**
 * The regression this whole harness was built to catch, driven through a real browser.
 *
 * The idempotency guard claims its key BEFORE doing the work, and the form only mints a
 * fresh key after a success. So a first attempt that failed for an ordinary reason used
 * to burn the key permanently — and the user's corrected retry, carrying the same key,
 * lost the claim and was swallowed as a duplicate: the dialog closed reporting success
 * while nothing had been recorded. `releaseIdempotencyKey` gives the key back on failure.
 *
 * Until now that fix was only proven at the data layer. This proves it the way a user
 * would hit it: mistype an amount, correct it, and expect the payment to actually exist.
 */
test("a payment that fails validation still records after the user corrects it", async ({
	page,
}) => {
	await page.goto(`/${FIXTURE.workspaceId}/payments`);

	await page.getByRole("button", { name: "Record payment" }).first().click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	// Pay against the seeded invoice so the over-payment rule can reject the first try.
	await dialog.getByLabel("Invoice (optional)").selectOption({ index: 1 });

	// First attempt: more than the invoice's remaining balance — a routine mistake.
	await dialog.getByLabel("Amount").fill("999.00");
	await dialog.getByRole("button", { name: "Record payment" }).click();

	await expect(
		dialog.getByText("The payment exceeds the invoice's remaining balance."),
	).toBeVisible();
	expect(await countRows("payments")).toBe(0);

	// Correct it and resubmit. This carries the SAME idempotency key as the failed
	// attempt — the exact condition that used to silently no-op.
	await dialog.getByLabel("Amount").fill("50.00");
	await dialog.getByRole("button", { name: "Record payment" }).click();

	await expect(dialog).toBeHidden();
	// The payment must genuinely exist — not merely appear to have been accepted.
	expect(await countRows("payments")).toBe(1);
});
