import { expect, test } from "@playwright/test";
import {
	countRows,
	deleteClientRecordDirect,
	FIXTURE,
	insertClientRecord,
} from "./fixture";

// Its own record, not the shared fixture client: this test deletes what it opens, and
// the switching flow asserts the seeded clients are still there.
const DOOMED_ID = "00000000-0000-4000-8000-00000000e0ff";
const DOOMED_NAME = "Doomed Record";

/**
 * Stale data — a page held open while the world moved on underneath it.
 *
 * The failure mode worth guarding is not the error itself but a LIE: an action on a row
 * that no longer exists reporting success, leaving the user believing they saved
 * something. The server re-checks on write and returns an honest message instead.
 */
test("editing a record deleted by someone else reports it honestly", async ({
	page,
}) => {
	await insertClientRecord(FIXTURE.workspaceId, DOOMED_ID, DOOMED_NAME);
	await page.goto(`/${FIXTURE.workspaceId}/client-records`);

	// Open the record — the page now holds a recordId that is about to go away.
	await page.getByRole("button", { name: DOOMED_NAME }).first().click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	// Someone else deletes it while this dialog sits open.
	await deleteClientRecordDirect(DOOMED_ID);
	const remaining = await countRows("client_records");

	await dialog.getByLabel("Name").fill("Renamed While Deleted");
	await dialog.getByRole("button", { name: "Save changes" }).click();

	// Honest failure, not a false success.
	await expect(
		dialog.getByText("This client no longer exists in this workspace."),
	).toBeVisible();
	await expect(dialog).toBeVisible();
	// And nothing was resurrected by the write.
	expect(await countRows("client_records")).toBe(remaining);
});
