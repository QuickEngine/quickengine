import { describe, expect, it } from "vitest";
import { resolveFirstActions } from "./first-actions";

const manifests = [
	{
		id: "clients",
		name: "Clients",
		firstActions: [
			{
				id: "clients:create",
				version: 1,
				label: "Add a client",
				description: "Create the first client record.",
				moduleId: "clients",
				intent: "create",
				priority: 20,
			},
		],
	},
	{
		id: "invoices",
		name: "Invoices",
		firstActions: [
			{
				id: "invoices:create",
				version: 1,
				label: "Create an invoice",
				description: "Bill the first client.",
				moduleId: "invoices",
				intent: "create",
				priority: 10,
				requires: ["clients:create"],
			},
		],
	},
	{
		id: "products",
		name: "Products",
		firstActions: [
			{
				id: "products:create",
				version: 1,
				label: "Add a product",
				description: "Create the first product.",
				moduleId: "products",
				intent: "create",
				priority: 30,
			},
		],
	},
] as const;

describe("resolveFirstActions", () => {
	it("uses only enabled modules and orders prerequisites first", () => {
		expect(
			resolveFirstActions({
				manifests,
				enabledModuleIds: ["clients", "invoices"],
			}).map((action) => action.id),
		).toEqual(["clients:create", "invoices:create"]);
	});

	it("honors recipe preferences without violating prerequisites", () => {
		expect(
			resolveFirstActions({
				manifests,
				enabledModuleIds: ["clients", "invoices", "products"],
				preferredActionIds: ["products:create", "invoices:create"],
			}).map((action) => action.id),
		).toEqual(["products:create", "clients:create", "invoices:create"]);
	});

	it("drops an action whose prerequisite is unavailable", () => {
		expect(
			resolveFirstActions({
				manifests,
				enabledModuleIds: ["invoices"],
			}),
		).toEqual([]);
	});

	it("applies a deterministic visible-action limit", () => {
		expect(
			resolveFirstActions({
				manifests,
				enabledModuleIds: ["clients", "invoices", "products"],
				maxActions: 2,
			}).map((action) => action.id),
		).toEqual(["clients:create", "invoices:create"]);
	});

	it("rejects duplicate ids, owner mismatches, cycles, and invalid limits", () => {
		expect(() =>
			resolveFirstActions({
				manifests: [manifests[0], manifests[0]],
				enabledModuleIds: ["clients"],
			}),
		).toThrow("DUPLICATE_FIRST_ACTION:clients:create");
		expect(() =>
			resolveFirstActions({
				manifests: [
					{
						...manifests[0],
						firstActions: [
							{ ...manifests[0].firstActions[0], moduleId: "wrong" },
						],
					},
				],
				enabledModuleIds: ["clients"],
			}),
		).toThrow("FIRST_ACTION_OWNER_MISMATCH:clients:create");
		expect(() =>
			resolveFirstActions({
				manifests: [
					{
						id: "loop",
						name: "Loop",
						firstActions: [
							{
								id: "loop:a" as const,
								version: 1 as const,
								label: "Loop",
								description: "Loop",
								moduleId: "loop",
								priority: 1,
								requires: ["loop:a" as const],
							},
						],
					},
				],
				enabledModuleIds: ["loop"],
			}),
		).toThrow("FIRST_ACTION_CYCLE:loop:a");
		expect(() =>
			resolveFirstActions({
				manifests,
				enabledModuleIds: [],
				maxActions: 0,
			}),
		).toThrow("INVALID_FIRST_ACTION_LIMIT");
	});
});
