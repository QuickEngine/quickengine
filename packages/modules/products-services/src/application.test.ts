import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createCatalogItemCommand,
	createProductVariantCommand,
	deleteCatalogItemCommand,
	getCatalogItemDto,
	listCatalogItemsPage,
	setCatalogItemStatusCommand,
	setProductVariantStatusCommand,
} from "./application";

const ownerId = "catalog-owner";
const workspaceId = "00000000-0000-4000-8000-0000000006a1";

const context = (operation: string, key: string, fingerprint = "same") => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint,
	idempotencyKey: key,
	operation,
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

const service = (overrides: Record<string, unknown> = {}) => ({
	name: "Consulting",
	type: "service" as const,
	pricingModel: "fixed" as const,
	priceCents: 15_000,
	...overrides,
});

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Catalog Owner', 'catalog@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Catalog Workspace', 'agency')
	`;
});

describe("Products & Services durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createCatalogItemCommand(
			context("catalog-items.create", "item-1"),
			service(),
		);
		const replay = await createCatalogItemCommand(
			context("catalog-items.create", "item-1"),
			service(),
		);
		expect(first).toMatchObject({
			kind: "success",
			source: "executed",
			status: 201,
		});
		expect(replay).toMatchObject({
			kind: "success",
			source: "replayed",
			status: 201,
		});

		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from catalog_items where workspace_id = ${workspaceId}) items,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			items: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("rejects a reused idempotency key with different input", async () => {
		await createCatalogItemCommand(
			context("catalog-items.create", "item-2"),
			service(),
		);
		const conflict = await createCatalogItemCommand(
			context("catalog-items.create", "item-2", "different"),
			service({ name: "Other" }),
		);
		expect(conflict).toEqual({ kind: "conflict" });
	});

	it("enforces SKU uniqueness across the workspace", async () => {
		await createCatalogItemCommand(
			context("catalog-items.create", "item-3"),
			service({ sku: "SKU-1" }),
		);
		await expect(
			createCatalogItemCommand(
				context("catalog-items.create", "item-4"),
				service({ name: "Dup", sku: "SKU-1" }),
			),
		).rejects.toThrow(/SKU/);
	});

	it("honors the status machine and blocks deleting a non-archived item", async () => {
		const created = await createCatalogItemCommand(
			context("catalog-items.create", "item-5"),
			service(),
		);
		const id =
			created.kind === "success" ? (created.result as { id: string }).id : "";

		await expect(
			deleteCatalogItemCommand(
				context("catalog-items.delete", "del-early"),
				id,
			),
		).rejects.toThrow(/Archive/);

		const activated = await setCatalogItemStatusCommand(
			context("catalog-items.set-status", "st-1"),
			id,
			"active",
		);
		expect(activated).toMatchObject({ kind: "success", status: 200 });

		await expect(
			setCatalogItemStatusCommand(
				context("catalog-items.set-status", "st-illegal"),
				id,
				"active",
			),
		).rejects.toThrow(/already in that status/);

		await setCatalogItemStatusCommand(
			context("catalog-items.set-status", "st-2"),
			id,
			"archived",
		);
		const deleted = await deleteCatalogItemCommand(
			context("catalog-items.delete", "del-ok"),
			id,
		);
		expect(deleted).toMatchObject({ kind: "success", status: 200 });
	});

	it("requires an active parent before a variant can go active", async () => {
		const created = await createCatalogItemCommand(
			context("catalog-items.create", "item-6"),
			service(),
		);
		const itemId =
			created.kind === "success" ? (created.result as { id: string }).id : "";
		const variant = await createProductVariantCommand(
			context("product-variants.create", "var-1"),
			itemId,
			{ options: [{ name: "Tier", value: "Pro" }] },
		);
		const variantId =
			variant.kind === "success" ? (variant.result as { id: string }).id : "";

		await expect(
			setProductVariantStatusCommand(
				context("product-variants.set-status", "vst-early"),
				variantId,
				"active",
			),
		).rejects.toThrow(/Activate the catalog item/);

		await setCatalogItemStatusCommand(
			context("catalog-items.set-status", "st-3"),
			itemId,
			"active",
		);
		const activated = await setProductVariantStatusCommand(
			context("product-variants.set-status", "vst-ok"),
			variantId,
			"active",
		);
		expect(activated).toMatchObject({ kind: "success", status: 200 });
	});

	it("hides non-active items from storefront (active-only) reads", async () => {
		const draft = await createCatalogItemCommand(
			context("catalog-items.create", "pub-1"),
			service({ name: "Draft Offering" }),
		);
		const draftId =
			draft.kind === "success" ? (draft.result as { id: string }).id : "";
		const live = await createCatalogItemCommand(
			context("catalog-items.create", "pub-2"),
			service({ name: "Live Offering" }),
		);
		const liveId =
			live.kind === "success" ? (live.result as { id: string }).id : "";
		await setCatalogItemStatusCommand(
			context("catalog-items.set-status", "pub-st"),
			liveId,
			"active",
		);

		// Storefront view (what a publishable key is clamped to) sees only the active item.
		const published = await listCatalogItemsPage(workspaceId, {
			status: "active",
		});
		expect(published.items.map((item) => item.id)).toEqual([liveId]);
		// Admin view (no clamp) sees both.
		const all = await listCatalogItemsPage(workspaceId, {});
		expect(all.items).toHaveLength(2);
		// A storefront get of a draft is hidden; the active one is visible.
		expect(await getCatalogItemDto(workspaceId, draftId, "active")).toBeNull();
		expect(
			await getCatalogItemDto(workspaceId, liveId, "active"),
		).toMatchObject({
			id: liveId,
		});
	});
});
