import { describe, expect, it, vi } from "vitest";
import { assertModulesAvailable } from "./availability";
import { resolveModules } from "./resolver";

describe("module availability seam", () => {
	it("allows modules when no future policy is supplied", async () => {
		await expect(
			assertModulesAvailable("workspace-1", resolveModules(["fulfillment"])),
		).resolves.toBeUndefined();
	});

	it("passes workspace and canonical manifest data to an injected policy", async () => {
		const check = vi.fn(() => true);
		await assertModulesAvailable(
			"workspace-1",
			resolveModules(["payments"]),
			check,
		);

		expect(check).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceId: "workspace-1",
				module: expect.objectContaining({ id: "payments" }),
			}),
		);
	});

	it("rejects the first unavailable module with a stable error", async () => {
		await expect(
			assertModulesAvailable(
				"workspace-1",
				resolveModules(["fulfillment"]),
				({ module }) => module.id !== "payments",
			),
		).rejects.toThrow("MODULE_NOT_AVAILABLE:payments");
	});
});
