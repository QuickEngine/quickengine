import { testDbClient } from "@quickengine/db/testing";
import {
	deleteCarrierConnection,
	describeCarrierCredentials,
	listCarrierConnections,
	resolveCarrierConnection,
	saveCarrierConnection,
	setCarrierConnectionState,
} from "@quickengine/mod-shipping";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "carrier-owner";
const workspaceId = "00000000-0000-4000-8000-00000010a001";

const token = "shippo_test_notarealtoken0123456789";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Carrier Owner', 'carrier@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Carrier Workspace', 'ecommerce')
	`;
});

describe("a business's carrier account", () => {
	it("stores the token encrypted and never in the clear", async () => {
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			credentials: { apiToken: token },
		});

		// 🔴 The whole point. A stolen dump must not yield a working token.
		const sql = testDbClient();
		const [row] = await sql`
			select credentials from shipping_carrier_connections
			where workspace_id = ${workspaceId}
		`;
		expect(row.credentials).not.toContain(token);
		expect(row.credentials).toMatch(/^v1\./);
	});

	/**
	 * 🔴 A new token is an UNPROVEN token. Carrying `active` forward would let a
	 * mistyped one quote customers until the first failure, and that failure
	 * happens in front of somebody trying to buy something.
	 */
	it("refuses to be used until something has actually talked to the carrier", async () => {
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			credentials: { apiToken: token },
		});

		expect(
			await resolveCarrierConnection({
				workspaceId,
				carrier: "shippo",
				environment: "test",
			}),
		).toBeNull();

		// …but the CHECK path may look at it, or it could never be verified at all.
		const unverified = await resolveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			allowUnverified: true,
		});
		expect(unverified?.credentials.apiToken).toBe(token);
		expect(unverified?.status).toBe("pending");
	});

	it("becomes usable once verified, and unusable again when it breaks", async () => {
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			credentials: { apiToken: token },
		});
		await setCarrierConnectionState({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			ok: true,
		});
		expect(
			(
				await resolveCarrierConnection({
					workspaceId,
					carrier: "shippo",
					environment: "test",
				})
			)?.credentials.apiToken,
		).toBe(token);

		await setCarrierConnectionState({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			ok: false,
			error: "401 Unauthorized",
		});
		expect(
			await resolveCarrierConnection({
				workspaceId,
				carrier: "shippo",
				environment: "test",
			}),
		).toBeNull();
	});

	/**
	 * 🔴 A test token cannot buy a real label, and a live one spends real money
	 * the first time somebody presses a button in a sandbox. They are separate
	 * rows and must never resolve for each other.
	 */
	it("keeps a test token away from live, and the other way round", async () => {
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			credentials: { apiToken: token },
		});
		await setCarrierConnectionState({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			ok: true,
		});

		expect(
			await resolveCarrierConnection({
				workspaceId,
				carrier: "shippo",
				environment: "live",
				allowUnverified: true,
			}),
		).toBeNull();
	});

	it("holds a test and a live account at the same time", async () => {
		for (const environment of ["test", "live"] as const) {
			await saveCarrierConnection({
				workspaceId,
				carrier: "shippo",
				environment,
				credentials: { apiToken: `${token}-${environment}` },
			});
		}
		const listed = await listCarrierConnections(workspaceId);
		expect(listed).toHaveLength(2);
		expect(listed.map((row) => row.environment).sort()).toEqual([
			"live",
			"test",
		]);
	});

	it("replaces a token rather than adding a second row", async () => {
		for (const value of ["first", "second"]) {
			await saveCarrierConnection({
				workspaceId,
				carrier: "shippo",
				environment: "test",
				credentials: { apiToken: value },
			});
		}
		expect(await listCarrierConnections(workspaceId)).toHaveLength(1);
		expect(
			(
				await resolveCarrierConnection({
					workspaceId,
					carrier: "shippo",
					environment: "test",
					allowUnverified: true,
				})
			)?.credentials.apiToken,
		).toBe("second");
	});

	/**
	 * ⚠️ Replacing a WORKING connection also drops it back to pending. A new
	 * token has proved nothing, however good the old one was.
	 */
	it("drops a working connection back to unproven when the token changes", async () => {
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			credentials: { apiToken: "first" },
		});
		await setCarrierConnectionState({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			ok: true,
		});
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			credentials: { apiToken: "second" },
		});

		expect(
			await resolveCarrierConnection({
				workspaceId,
				carrier: "shippo",
				environment: "test",
			}),
		).toBeNull();
	});

	/** 🔴 A settings screen may know a token EXISTS and never what it is. */
	it("tells a screen a token is there without telling it the token", async () => {
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			credentials: { apiToken: token, webhookSecret: "whsec_x" },
		});
		const [listed] = await listCarrierConnections(workspaceId);
		expect(listed).toMatchObject({
			carrier: "shippo",
			present: true,
			webhookConfigured: true,
			status: "pending",
		});
		expect(JSON.stringify(listed)).not.toContain(token);
	});

	/**
	 * After a `BETTER_AUTH_SECRET` rotation every stored credential is
	 * unreadable. A settings page that crashes is worse than one saying "not
	 * connected" beside a button to reconnect.
	 */
	it("reports a corrupted credential as absent rather than throwing", () => {
		expect(describeCarrierCredentials("v1.not.real.data")).toEqual({
			present: false,
			webhookConfigured: false,
		});
	});

	it("forgets a carrier account entirely", async () => {
		await saveCarrierConnection({
			workspaceId,
			carrier: "shippo",
			environment: "test",
			credentials: { apiToken: token },
		});
		expect(
			await deleteCarrierConnection({
				workspaceId,
				carrier: "shippo",
				environment: "test",
			}),
		).toBe(true);
		expect(await listCarrierConnections(workspaceId)).toHaveLength(0);
	});
});
