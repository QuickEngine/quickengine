import {
	createFakeAgentProvider,
	zeroUsage,
} from "@quickengine/agent-providers";
import { describe, expect, it } from "vitest";
import { fallbackRecipe, recommendOnboardingRecipe } from "./recommendation";

describe("onboarding recommendation", () => {
	it("selects a catalog recipe from strict model JSON", async () => {
		const result = await recommendOnboardingRecipe({
			description: "I sell handmade jewelry and crystals online",
			provider: createFakeAgentProvider([
				{
					content:
						'{"recipeId":"jewellery","rationale":"This matches a product-based gemstone store."}',
					toolCalls: [],
					usage: zeroUsage,
				},
			]),
		});
		expect(result).toMatchObject({
			recipeId: "jewellery",
			source: "ai",
		});
		expect(result.moduleIds).toContain("inventory");
	});

	it("rejects invented ids and falls back to the canonical catalog", async () => {
		const result = await recommendOnboardingRecipe({
			description: "A barbershop where clients book appointments",
			provider: createFakeAgentProvider([
				{
					content:
						'{"recipeId":"invented-barber-module","rationale":"Looks right."}',
					toolCalls: [],
					usage: zeroUsage,
				},
			]),
		});
		expect(result.recipeId).toBe("salon");
		expect(result.source).toBe("catalog-fallback");
	});

	it("uses a useful free fallback when no provider is configured", async () => {
		expect(fallbackRecipe("I run a wedding photography studio").id).toBe(
			"photography",
		);
		const result = await recommendOnboardingRecipe({
			description: "I run a wedding photography studio",
		});
		expect(result.source).toBe("catalog-fallback");
	});
});
