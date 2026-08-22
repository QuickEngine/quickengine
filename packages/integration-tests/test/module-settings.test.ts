import {
	getWorkspaceModuleSettings,
	setWorkspaceModuleSettings,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { shippingSettingsSchema } from "@quickengine/mod-shipping";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "modset-owner";
const workspaceId = "00000000-0000-4000-8000-0000000f0001";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Modset Owner', 'modset@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Modset Workspace', 'ecommerce')
	`;
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values (${workspaceId}, 'shipping', true), (${workspaceId}, 'orders', true)
	`;
});

/**
 * 🔴 There was no write path for module settings AT ALL until 2026-08-21.
 *
 * The column's own comment claimed settings were "validated against the schema
 * on save", and no save existed. Every module's settings — an order number
 * prefix, whether stock may go negative, where parcels ship from — were frozen
 * at whatever the workspace was created with. The schemas were real, the
 * screens were not, and nothing joined them.
 */
describe("a module's settings can actually be changed", () => {
	const origin = {
		name: "Caffeinate",
		line1: "1 Roastery Way",
		line2: null,
		city: "Calgary",
		region: "AB",
		postalCode: "T2P 1J9",
		countryCode: "CA",
		phone: "+1 403 555 0100",
	};

	it("saves and reads back what a carrier needs", async () => {
		const settings = shippingSettingsSchema.parse({ origin });
		expect(
			await setWorkspaceModuleSettings({
				workspaceId,
				moduleId: "shipping",
				settings,
			}),
		).toMatchObject({ origin });

		const stored = await getWorkspaceModuleSettings(workspaceId, "shipping");
		expect(stored).toMatchObject({ origin });
	});

	/**
	 * ⚠️ Replace, not merge. A merge cannot express "clear this", and a screen
	 * that can set a value but never unset it is one somebody has to edit the
	 * database to escape.
	 */
	it("clears an address rather than merging the old one back", async () => {
		await setWorkspaceModuleSettings({
			workspaceId,
			moduleId: "shipping",
			settings: shippingSettingsSchema.parse({ origin }),
		});
		await setWorkspaceModuleSettings({
			workspaceId,
			moduleId: "shipping",
			settings: shippingSettingsSchema.parse({ origin: null }),
		});
		expect(
			await getWorkspaceModuleSettings(workspaceId, "shipping"),
		).toMatchObject({ origin: null });
	});

	it("keeps one module's settings out of another's", async () => {
		await setWorkspaceModuleSettings({
			workspaceId,
			moduleId: "shipping",
			settings: shippingSettingsSchema.parse({ origin }),
		});
		expect(await getWorkspaceModuleSettings(workspaceId, "orders")).toEqual({});
	});

	/**
	 * Configuring a module a business does not have is a request for something
	 * that is not there, not an error worth throwing over.
	 */
	it("returns null for a module the workspace does not have", async () => {
		expect(
			await setWorkspaceModuleSettings({
				workspaceId,
				moduleId: "bookings",
				settings: { anything: true },
			}),
		).toBeNull();
		expect(
			await getWorkspaceModuleSettings(workspaceId, "bookings"),
		).toBeNull();
	});

	/**
	 * 🔴 A workspace created before a setting existed simply lacks the key, and
	 * the module's schema fills it in on parse. Reading a key straight off the
	 * stored object gets undefined and looks like a bug in the feature.
	 */
	it("lets the schema supply what an older workspace never stored", async () => {
		const stored = await getWorkspaceModuleSettings(workspaceId, "shipping");
		expect(stored).toEqual({});
		expect(shippingSettingsSchema.parse(stored)).toMatchObject({
			origin: null,
			defaultCarrier: null,
			requireTracking: false,
		});
	});
});
