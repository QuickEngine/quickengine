import { describe, expect, it } from "vitest";
import { listModules } from "./catalog";
import { resolveFirstActions } from "./first-actions";
import { resolveModules } from "./resolver";

describe("first-action catalog", () => {
	it("makes every built module state an explicit product decision", () => {
		const modules = listModules();
		expect(modules).toHaveLength(15);
		for (const module of modules) {
			expect(Object.hasOwn(module, "firstActions"), module.id).toBe(true);
		}
		expect(
			modules
				.filter((module) => (module.firstActions?.length ?? 0) === 0)
				.map((module) => module.id),
		).toEqual(["reporting-analytics"]);
	});

	it("uses stable unique ids owned by their declaring modules", () => {
		const ids = new Set<string>();
		for (const module of listModules()) {
			for (const action of module.firstActions ?? []) {
				expect(action.id.startsWith(`${module.id}:`), action.id).toBe(true);
				expect(action.moduleId).toBe(module.id);
				expect(action.version).toBe(1);
				expect(ids.has(action.id), action.id).toBe(false);
				ids.add(action.id);
			}
		}
		expect(ids.size).toBe(14);
	});

	it("gives every business goal ordered, unique, module-owned substeps", () => {
		const stepIds = new Set<string>();
		for (const module of listModules()) {
			for (const action of module.firstActions ?? []) {
				expect(action.steps.length, action.id).toBeGreaterThan(0);
				expect(
					action.steps.some((step) => !step.optional),
					action.id,
				).toBe(true);
				for (const step of action.steps) {
					expect(step.id.startsWith(`${action.id}:`), step.id).toBe(true);
					expect(step.version).toBe(1);
					expect(step.label.trim()).not.toBe("");
					expect(step.description.trim()).not.toBe("");
					expect(step.intent.trim()).not.toBe("");
					expect(stepIds.has(step.id), step.id).toBe(false);
					stepIds.add(step.id);
				}
			}
		}
		expect(stepIds.size).toBe(23);
	});

	it("references only actions available through structural module dependencies", () => {
		const actionOwner = new Map<string, string>();
		for (const module of listModules()) {
			for (const action of module.firstActions ?? []) {
				actionOwner.set(action.id, module.id);
			}
		}

		for (const module of listModules()) {
			const reachableModules = new Set(
				resolveModules([module.id]).map((resolved) => resolved.id),
			);
			for (const action of module.firstActions ?? []) {
				for (const required of action.requires ?? []) {
					const owner = actionOwner.get(required);
					expect(owner, `${action.id} -> ${required}`).toBeDefined();
					expect(
						reachableModules.has(owner ?? ""),
						`${action.id} -> ${required}`,
					).toBe(true);
				}
			}
		}
	});

	it("resolves the universal business loop in executable order", () => {
		expect(
			resolveFirstActions({
				manifests: listModules(),
				enabledModuleIds: resolveModules(["fulfillment"]).map(
					(module) => module.id,
				),
			}).map((action) => action.id),
		).toEqual([
			"client-records:create",
			"invoicing:create",
			"payments:record",
			"fulfillment:create",
		]);
	});

	it("uses recipe preferences only when their modules are enabled", () => {
		expect(
			resolveFirstActions({
				manifests: listModules(),
				enabledModuleIds: resolveModules(["shipping", "inventory"]).map(
					(module) => module.id,
				),
				preferredActionIds: [
					"products-services:create",
					"client-records:create",
					"bookings:create",
				],
			}).map((action) => action.id),
		).toEqual([
			"products-services:create",
			"client-records:create",
			"invoicing:create",
			"orders:create",
			"inventory:adjust",
		]);
	});
});
