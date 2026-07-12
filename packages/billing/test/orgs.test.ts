import {
	db,
	ensurePersonalOrg,
	eq,
	getPersonalOrg,
	quickengineOrganizationMembers,
} from "@quickengine/db";
import { describe, expect, it } from "vitest";
import { insertUser } from "./helpers";

// ensurePersonalOrg lives in @quickengine/db (no test harness of its own); tested
// here because billing's suite already has the shared DB setup + insertUser.
describe("ensurePersonalOrg", () => {
	it("creates a personal org + owner membership, idempotently", async () => {
		await insertUser("org-user-1", "org1@example.com");

		const first = await ensurePersonalOrg("org-user-1", "Ash");
		const second = await ensurePersonalOrg("org-user-1", "Ash");
		// Second call must return the same org — no duplicate personal org.
		expect(second).toBe(first);

		const org = await getPersonalOrg("org-user-1");
		expect(org?.id).toBe(first);
		expect(org?.isPersonal).toBe(true);

		const members = await db
			.select()
			.from(quickengineOrganizationMembers)
			.where(eq(quickengineOrganizationMembers.organizationId, first));
		expect(members).toHaveLength(1);
		expect(members[0].role).toBe("owner");
		expect(members[0].userId).toBe("org-user-1");
	});

	it("gives different users their own separate personal orgs", async () => {
		await insertUser("org-user-2", "org2@example.com");
		await insertUser("org-user-3", "org3@example.com");
		const a = await ensurePersonalOrg("org-user-2", "A");
		const b = await ensurePersonalOrg("org-user-3", "B");
		expect(a).not.toBe(b);
	});
});
