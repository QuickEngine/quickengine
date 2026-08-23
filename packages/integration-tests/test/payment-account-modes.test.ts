import { testDbClient } from "@quickengine/db/testing";
import {
	getPaymentAccount,
	setDefaultPaymentProvider,
	upsertPaymentAccount,
} from "@quickengine/mod-payments";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * 🔴 What sandbox is actually FOR.
 *
 * Not "somewhere to make a product without it appearing on your site" — it is
 * where a business proves the whole system works before asking anyone to send
 * real money through it. Take the shop down, run fake payments, place fake
 * orders, break things, then flip to live having already seen it work.
 *
 * That is worth nothing if the payment connection cannot follow the switch. It
 * could not: `payment_accounts` was unique on `(workspace, provider)` alone, so
 * a workspace held ONE Stripe connection for its whole life, stamped with the
 * mode it was created in — and reconnecting after a switch threw
 * `PAYMENT_ENVIRONMENT_MISMATCH` with no way out of it in the interface.
 *
 * Migration 0087 makes the mode part of a connection's identity. These tests are
 * the guarantee that buys: flip the workspace, and everything downstream
 * resolves the money for the mode you are actually in.
 */
const owner = "mode-owner";
const workspace = "00000000-0000-4000-8000-0000001d0001";

const setMode = async (mode: "test" | "live") => {
	const sql = testDbClient();
	await sql`update quickengine_workspaces set environment = ${mode} where id = ${workspace}`;
};

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Owner', 'mode-owner@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type, environment)
		values (${workspace}, ${owner}, 'Caffeinate', 'ecommerce', 'test')
	`;
});

describe("a workspace that tests before it goes live", () => {
	it("keeps a sandbox connection and a live one side by side", async () => {
		// Connect in sandbox, the way anybody sensible sets up.
		await setMode("test");
		await upsertPaymentAccount(workspace, "stripe", {
			externalAccountId: "acct_sandbox",
			status: "active",
			chargesEnabled: true,
		});
		await setDefaultPaymentProvider(workspace, "stripe");

		// 🔴 The step that used to be impossible. Before 0087 this threw
		// PAYMENT_ENVIRONMENT_MISMATCH and the business was stuck for good.
		await setMode("live");
		await upsertPaymentAccount(workspace, "stripe", {
			externalAccountId: "acct_live",
			status: "active",
			chargesEnabled: true,
		});
		await setDefaultPaymentProvider(workspace, "stripe");

		const sql = testDbClient();
		const rows = (await sql`
			select environment, external_account_id, is_default
			from payment_accounts where workspace_id = ${workspace}
			order by environment
		`) as unknown as Array<{
			environment: string;
			external_account_id: string;
			is_default: boolean;
		}>;
		expect(rows).toHaveLength(2);
		// A default in EACH mode. One for the whole workspace would leave the
		// other mode resolving nothing at all.
		expect(rows.every((row) => row.is_default)).toBe(true);
		expect(
			rows.map((row) => [row.environment, row.external_account_id]),
		).toEqual([
			["live", "acct_live"],
			["test", "acct_sandbox"],
		]);
	});

	it("charges through whichever mode the workspace is in right now", async () => {
		await setMode("test");
		await upsertPaymentAccount(workspace, "stripe", {
			externalAccountId: "acct_sandbox",
			status: "active",
		});
		await setDefaultPaymentProvider(workspace, "stripe");
		await setMode("live");
		await upsertPaymentAccount(workspace, "stripe", {
			externalAccountId: "acct_live",
			status: "active",
		});
		await setDefaultPaymentProvider(workspace, "stripe");

		/**
		 * 🔑 The whole point, stated as an assertion: flipping the switch changes
		 * which money moves, and nothing downstream has to know it happened.
		 */
		await setMode("live");
		expect((await getPaymentAccount(workspace))?.externalAccountId).toBe(
			"acct_live",
		);
		expect(
			(await getPaymentAccount(workspace, "stripe"))?.externalAccountId,
		).toBe("acct_live");

		await setMode("test");
		expect((await getPaymentAccount(workspace))?.externalAccountId).toBe(
			"acct_sandbox",
		);

		// ⚠️ And a historical record still resolves the account it was actually
		// taken through, whatever the workspace is set to today — otherwise
		// refunding a live order from a sandboxed workspace would look for the
		// wrong account.
		expect(
			(await getPaymentAccount(workspace, "stripe", "live"))?.externalAccountId,
		).toBe("acct_live");
	});

	it("reports honestly when this mode has no connection", async () => {
		await setMode("live");
		await upsertPaymentAccount(workspace, "stripe", {
			externalAccountId: "acct_live",
			status: "active",
		});
		await setDefaultPaymentProvider(workspace, "stripe");

		// Never connected in sandbox. The answer is "nothing here", not an error
		// about a mismatch that the operator can do nothing with.
		await setMode("test");
		expect(await getPaymentAccount(workspace)).toBeUndefined();
		expect(await getPaymentAccount(workspace, "stripe")).toBeUndefined();
	});

	/**
	 * ⚠️ Choosing a live default must not silently change what a sandbox checkout
	 * runs through. The old version cleared the flag on every row in the
	 * workspace, which left the other mode with no default and every lookup
	 * returning nothing.
	 */
	it("keeps each mode's default to itself", async () => {
		await setMode("test");
		await upsertPaymentAccount(workspace, "stripe", {
			externalAccountId: "acct_sandbox",
		});
		await setDefaultPaymentProvider(workspace, "stripe");

		await setMode("live");
		await upsertPaymentAccount(workspace, "stripe", {
			externalAccountId: "acct_live",
		});
		await upsertPaymentAccount(workspace, "paypal", {
			externalAccountId: "merchant_live",
		});
		await setDefaultPaymentProvider(workspace, "paypal");

		expect((await getPaymentAccount(workspace))?.provider).toBe("paypal");

		await setMode("test");
		const sandbox = await getPaymentAccount(workspace);
		expect(sandbox?.provider).toBe("stripe");
		expect(sandbox?.externalAccountId).toBe("acct_sandbox");
	});
});
