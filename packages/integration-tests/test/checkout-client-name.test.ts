import { testDbClient } from "@quickengine/db/testing";
import { resolveCheckoutClient } from "@quickengine/mod-orders";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * A customer is greeted by their name, not their email address.
 *
 * 🔴 The customer record is created the first time an address is seen, with
 * `name || email` — so a checkout that reached it before the name was known
 * fixed the address in place as the name, and `if (existing) return existing`
 * never corrected it. Every email afterwards opened "neoenginex@gmail.com,
 * thanks for your order."
 *
 * Seen on a real order 2026-08-29: the record was written 39 seconds before the
 * order, and `ship_to_name` held "Asher Wilson" from the same checkout.
 */

const owner = "name-owner";
const workspaceId = "00000000-0000-4000-8000-0000001b0001";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Asher', 'nameowner@example.com', true)
		on conflict (id) do nothing
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${owner}, 'Caffeinate', 'ecommerce')
		on conflict (id) do nothing
	`;
	await sql`delete from client_records where workspace_id = ${workspaceId}`;
});

const nameOf = async (id: string) => {
	const sql = testDbClient();
	const [row] = await sql`select name from client_records where id = ${id}`;
	return row?.name as string;
};

describe("the name on a customer record", () => {
	it("is filled in when a later checkout supplies one", async () => {
		// First contact: no name known, so the address stands in for it.
		const first = await resolveCheckoutClient({
			workspaceId,
			email: "buyer@example.com",
		});
		expect(await nameOf(first.id)).toBe("buyer@example.com");

		// The real checkout, same person, now with a name.
		const second = await resolveCheckoutClient({
			workspaceId,
			email: "buyer@example.com",
			name: "Asher Wilson",
		});

		expect(second.id).toBe(first.id); // same customer, not a duplicate
		expect(await nameOf(first.id)).toBe("Asher Wilson");
	});

	/** 🔴 A name the business edited is theirs. Checkout must never overwrite it. */
	it("never overwrites a real name already on the record", async () => {
		const created = await resolveCheckoutClient({
			workspaceId,
			email: "buyer@example.com",
			name: "Asher Wilson",
		});

		await resolveCheckoutClient({
			workspaceId,
			email: "buyer@example.com",
			name: "Typo McTypo",
		});

		expect(await nameOf(created.id)).toBe("Asher Wilson");
	});

	it("uses the name straight away when checkout knows it", async () => {
		const created = await resolveCheckoutClient({
			workspaceId,
			email: "direct@example.com",
			name: "Asher Wilson",
		});
		expect(await nameOf(created.id)).toBe("Asher Wilson");
	});
});
