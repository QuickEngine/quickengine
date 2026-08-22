import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	resolveSupplierConnection,
	saveSupplierConnection,
	setSupplierConnectionState,
} from "./supplier-connections";

const ownerId = "conn-owner";
const workspaceId = "00000000-0000-4000-8000-0000000016a1";
const supplierId = "00000000-0000-4000-8000-0000000016b1";

const credentials = {
	shopDomain: "example.myshopify.com",
	apiVersion: "2026-07",
	adminAccessToken: "shpat_example",
	webhookSecret: "whsec_example",
};

const resolve = (allowUnverified?: boolean) =>
	resolveSupplierConnection({
		workspaceId,
		supplierId,
		provider: "shopify",
		...(allowUnverified === undefined ? {} : { allowUnverified }),
	});

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Conn Owner', 'conn@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Conn Workspace', 'ecommerce')
	`;
	await sql`
		insert into suppliers (id, workspace_id, name, handoff_method)
		values (${supplierId}, ${workspaceId}, 'EZPZ Coffee', 'shopify')
	`;
	await saveSupplierConnection({
		workspaceId,
		supplierId,
		provider: "shopify",
		credentials,
	});
});

describe("resolving a supplier connection", () => {
	/**
	 * 🔴 THE DEADLOCK, and it made the feature unusable.
	 *
	 * A connection is stored `pending` because nothing has proven the token yet.
	 * Every dispatch path refuses `pending` for exactly that reason — placing a
	 * real order against an unverified credential is the failure the guard
	 * exists to prevent. But the CHECK is what proves it, so if the check obeys
	 * the same rule the two deadlock: pending can never be checked, so it never
	 * becomes active, so it can never be used. A connection could be saved and
	 * then be permanently dead.
	 */
	it("refuses an unverified connection to everything except the check", async () => {
		// A freshly saved connection has never been proven.
		expect(await resolve()).toBeNull();

		// The check is allowed to see it, because it is what does the proving.
		expect(await resolve(true)).toMatchObject({
			shopDomain: "example.myshopify.com",
			adminAccessToken: "shpat_example",
			webhookSecret: "whsec_example",
		});
	});

	it("lets everything through once the check has proven it", async () => {
		await setSupplierConnectionState({
			workspaceId,
			supplierId,
			provider: "shopify",
			ok: true,
		});

		expect(await resolve()).toMatchObject({ apiVersion: "2026-07" });
	});

	/** Re-checking after fixing a token is the normal way out of a failure. */
	it("still lets the check see a connection that failed", async () => {
		await setSupplierConnectionState({
			workspaceId,
			supplierId,
			provider: "shopify",
			ok: false,
			error: "Unauthorized",
		});

		expect(await resolve()).toBeNull();
		expect(await resolve(true)).not.toBeNull();
	});

	it("answers null for a supplier with no connection at all", async () => {
		expect(
			await resolveSupplierConnection({
				workspaceId,
				supplierId: "00000000-0000-4000-8000-0000000016ff",
				provider: "shopify",
				allowUnverified: true,
			}),
		).toBeNull();
	});
});
