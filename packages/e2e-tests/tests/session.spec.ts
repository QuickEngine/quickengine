import { expect, test } from "@playwright/test";
import { FIXTURE } from "./fixture";

/**
 * Proves the seeded session is genuinely authenticated against the running app —
 * the foundation every other authenticated flow depends on.
 */
test("the seeded session can open its workspace", async ({ page }) => {
	const response = await page.goto(`/${FIXTURE.workspaceId}`);
	// Signed out, this route 307s to the auth app; signed in it renders.
	expect(response?.status()).toBe(200);
	// The name also appears in the sidebar and workspace switcher — anchor on the heading.
	await expect(
		page.getByRole("heading", { name: "E2E Workspace", exact: true }),
	).toBeVisible();
});
