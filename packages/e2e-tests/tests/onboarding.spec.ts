import { expect, type Page, test } from "@playwright/test";
import { testDbClient } from "@quickengine/db/testing";
import { FIXTURE } from "./fixture";

const ACCOUNT_URL = "http://localhost:3101";
const QUICKDASH_URL = "http://localhost:3111";
const FOUNDATION_MODULES = [
	"client-records",
	"fulfillment",
	"invoicing",
	"payments",
];

test.setTimeout(120_000);

test("minimal onboarding rolls back atomically, retries once, and enters QuickDash", async ({
	page,
}) => {
	const sql = testDbClient();
	const eligibleAt = Date.now();

	await page.goto(`${ACCOUNT_URL}/onboarding`);
	await expect(
		page.getByRole("heading", { name: "What's your business called?" }),
	).toBeVisible();
	await expect(page.getByLabel("Business name")).toBeVisible();
	await assertNoOnboardingGate(page);

	await page.getByLabel("Business name").fill("Atomic Workshop");
	await page.getByRole("button", { name: "Continue" }).click();
	await expect(
		page.getByRole("heading", { name: "How do you want to set it up?" }),
	).toBeVisible();
	await assertNoOnboardingGate(page);

	await page.getByRole("button", { name: "Set it up for me" }).click();
	await expect(
		page.getByRole("heading", { name: "Describe your business" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Back" }).click();
	await page.getByRole("button", { name: "Use a preset" }).click();
	await expect(
		page.getByRole("heading", { name: "What are you building?" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Agency", exact: true }).click();
	await expect(page.getByText("Agency", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Back" }).click();
	await page.getByRole("button", { name: "Back" }).click();

	await page
		.getByRole("button", { name: "Skip — use sensible defaults" })
		.click();

	await expect(
		page.getByRole("heading", { name: "Ready to build" }),
	).toBeVisible();
	await expect(page.getByText("4 enabled")).toBeVisible();
	await expect(page.getByText("Nothing is charged")).toBeVisible();
	await assertNoOnboardingGate(page);

	await installRegistryFailure(sql);
	try {
		await page.getByRole("button", { name: "Create workspace" }).click();
		await expect(page.getByText(/Nothing was partially saved/)).toBeVisible();
		await expectOnboardingRows(sql, { workspaces: 0, completed: false });
	} finally {
		await removeRegistryFailure(sql);
	}

	await page.getByRole("button", { name: "Create workspace" }).click();
	await expect(
		page.getByRole("heading", { name: "Atomic Workshop" }),
	).toBeVisible();
	await expectOnboardingRows(sql, { workspaces: 1, completed: true });

	const [workspace] = await sql<{ id: string }[]>`
		select w.id
		from quickengine_workspaces w
		join quickengine_users u on u.id = w.owner_id
		where u.email = ${FIXTURE.onboardingEmail}
	`;
	if (!workspace) throw new Error("Onboarding workspace was not created.");
	const modules = await sql<{ moduleId: string }[]>`
		select wm.module_id as "moduleId"
		from workspace_modules wm
		where wm.workspace_id = ${workspace.id}
		order by wm.module_id
	`;
	expect(modules.map((row) => row.moduleId)).toEqual(FOUNDATION_MODULES);

	const [paidSubscription] = await sql`
		select s.id
		from quickengine_subscriptions s
		join quickengine_organizations o on o.id = s.organization_id
		join quickengine_users u on u.id = o.owner_id
		where u.email = ${FIXTURE.onboardingEmail}
			and s.status = 'active'
			and s.plan_id <> 'free'
		limit 1
	`;
	expect(paidSubscription).toBeUndefined();

	const enter = page.getByRole("link", { name: "Enter Atomic Workshop" });
	await expect(enter).toHaveAttribute(
		"href",
		`${QUICKDASH_URL}/${workspace.id}`,
	);
	await enter.click();
	await expect(page).toHaveURL(`${QUICKDASH_URL}/${workspace.id}`);
	await expect(page.getByText("QuickDash workspace")).toBeVisible();
	expect(Date.now() - eligibleAt).toBeLessThan(120_000);
	await page.waitForLoadState("networkidle");

	await expect(page.getByLabel("QuickDash orientation")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Getting started" }),
	).toHaveCount(0);
	await page.getByRole("button", { name: "Next", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Your tools live on the left" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Skip orientation" }).click();
	await expect(page.getByLabel("QuickDash orientation")).toBeHidden({
		timeout: 20_000,
	});
	await expect(
		page.getByRole("button", { name: "Getting started" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Getting started" }).click();
	await page.waitForLoadState("networkidle");
	await page.getByRole("button", { name: "Add your first client" }).click();
	await page.getByRole("link", { name: /Add the client’s details/ }).click();
	await expect(page).toHaveURL(
		`${QUICKDASH_URL}/${workspace.id}/client-records?intent=create`,
		{ timeout: 30_000 },
	);

	await page.getByRole("button", { name: /^Add / }).first().click();
	const clientDialog = page.getByRole("dialog");
	await clientDialog.getByLabel("Name").fill("First Useful Client");
	await clientDialog.getByLabel("Email").fill("first-value@example.com");
	await clientDialog.getByRole("button", { name: /^Add / }).click();
	await expect(clientDialog).toBeHidden({ timeout: 15_000 });
	await expect(page.getByText("First Useful Client").first()).toBeVisible();
	expect(Date.now() - eligibleAt).toBeLessThan(300_000);

	await page.goto(`${QUICKDASH_URL}/${workspace.id}`);
	await page.getByRole("button", { name: "Add your first client" }).click();
	await expect(
		page
			.getByRole("link", { name: /Add the client’s details/ })
			.getByText("Add the client’s details", { exact: true }),
	).toHaveClass(/line-through/);

	await page.reload();
	await expect(page.getByLabel("QuickDash orientation")).toHaveCount(0);
	await page.locator('[data-orientation-target="account"]').click();
	await expect(page.getByText("Restart QuickDash tour")).toBeVisible();
});

async function assertNoOnboardingGate(page: Page) {
	await expect(page.getByText(/two-factor|2fa/i)).toHaveCount(0);
	await expect(
		page.getByText(/pricing|choose a plan|checkout|payment method/i),
	).toHaveCount(0);
}

async function expectOnboardingRows(
	sql: ReturnType<typeof testDbClient>,
	expected: { workspaces: number; completed: boolean },
) {
	const [result] = await sql<{ workspaces: number; completed: boolean }[]>`
		select
			count(w.id)::int as workspaces,
			(u.onboarding_completed_at is not null) as completed
		from quickengine_users u
		left join quickengine_workspaces w on w.owner_id = u.id
		where u.email = ${FIXTURE.onboardingEmail}
		group by u.onboarding_completed_at
	`;
	expect(result).toEqual(expected);
}

async function installRegistryFailure(sql: ReturnType<typeof testDbClient>) {
	await sql`
		create function e2e_reject_workspace_registry() returns trigger
		language plpgsql as $$
		begin
			raise exception 'E2E_REGISTRY_FAILURE';
		end;
		$$
	`;
	await sql`
		create trigger e2e_reject_workspace_registry
		before insert on workspace_modules
		for each row execute function e2e_reject_workspace_registry()
	`;
}

async function removeRegistryFailure(sql: ReturnType<typeof testDbClient>) {
	await sql`drop trigger if exists e2e_reject_workspace_registry on workspace_modules`;
	await sql`drop function if exists e2e_reject_workspace_registry()`;
}
