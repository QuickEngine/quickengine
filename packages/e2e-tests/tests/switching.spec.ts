import { expect, test } from "@playwright/test";
import { FIXTURE } from "./fixture";

const clientsOf = (workspaceId: string) => `/${workspaceId}/client-records`;

/**
 * Rapid workspace switching — the tenant-isolation contract under navigation pressure.
 *
 * Switching quickly between two workspaces the same user owns must never leave one
 * workspace's records rendered under the other's id. A stale render here would not just
 * be a UI glitch: it would show a user data from a workspace whose page they are no
 * longer on, which is the shape a real tenant leak takes.
 */
test("bouncing between workspaces never renders the other's records", async ({
	page,
}) => {
	// Bounce without settling — each navigation interrupts the previous one's render.
	for (let round = 0; round < 3; round += 1) {
		await page.goto(clientsOf(FIXTURE.workspaceId), { waitUntil: "commit" });
		await page.goto(clientsOf(FIXTURE.secondWorkspaceId), {
			waitUntil: "commit",
		});
	}

	// Land on the second workspace and let it settle.
	await page.goto(clientsOf(FIXTURE.secondWorkspaceId));
	await expect(
		page.getByText(FIXTURE.secondClientName, { exact: true }).first(),
	).toBeVisible();
	await expect(
		page.getByText(FIXTURE.clientName, { exact: true }),
	).toBeHidden();

	// And the reverse: the first workspace must not show the second's client.
	await page.goto(clientsOf(FIXTURE.workspaceId));
	await expect(
		page.getByText(FIXTURE.clientName, { exact: true }).first(),
	).toBeVisible();
	await expect(
		page.getByText(FIXTURE.secondClientName, { exact: true }),
	).toBeHidden();
});

/**
 * Rapid module switching within one workspace — each module page must render its own
 * surface rather than a leftover of the page being navigated away from.
 */
test("bouncing between modules lands on the right page", async ({ page }) => {
	const base = `/${FIXTURE.workspaceId}`;
	for (const path of ["client-records", "invoicing", "payments"]) {
		await page.goto(`${base}/${path}`, { waitUntil: "commit" });
	}

	await page.goto(`${base}/payments`);
	await expect(
		page.getByRole("button", { name: "Record payment" }).first(),
	).toBeVisible();

	await page.goto(`${base}/client-records`);
	await expect(
		page.getByRole("button", { name: /^Add / }).first(),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Record payment" }),
	).toBeHidden();
});
