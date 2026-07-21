import type { AgentModelProvider } from "@quickengine/agent-core";
import { z } from "zod";
import { findRecipe, RECIPES, type Recipe } from "../_lib/recipes";

export const ONBOARDING_DESCRIPTION_MAX_LENGTH = 500;
export const ONBOARDING_RECOMMENDATION_MAX_OUTPUT_TOKENS = 180;

const modelOutput = z
	.object({
		recipeId: z.string().min(1),
		rationale: z.string().min(1).max(240),
	})
	.strict();

export type OnboardingRecommendation = {
	recipeId: string;
	recipeName: string;
	moduleIds: readonly string[];
	rationale: string;
	source: "ai" | "catalog-fallback";
};

const terms = (value: string) =>
	value
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((term) => term.length > 2);

/** Deterministic, free fallback for missing credentials or provider failure. */
export function fallbackRecipe(description: string): Recipe {
	const input = description.toLowerCase();
	const inputTerms = new Set(terms(description));
	let best = RECIPES[0];
	let bestScore = -1;
	for (const recipe of RECIPES) {
		const phrases = [recipe.name, recipe.category, ...recipe.keywords];
		const recipeTerms = new Set(terms(phrases.join(" ")));
		let score = phrases.reduce((total, phrase) => {
			const normalized = phrase.toLowerCase();
			const exact = normalized.includes(" ")
				? input.includes(normalized)
				: inputTerms.has(normalized) ||
					[...inputTerms].some(
						(term) => normalized.length >= 4 && term.startsWith(normalized),
					);
			return total + (exact ? 4 : 0);
		}, 0);
		for (const term of inputTerms) if (recipeTerms.has(term)) score += 1;
		if (score > bestScore) {
			best = recipe;
			bestScore = score;
		}
	}
	return best;
}

function compactCatalog(): string {
	return RECIPES.map(
		(recipe) =>
			`${recipe.id}|${recipe.name}|${recipe.category}|${recipe.keywords.join(",")}`,
	).join("\n");
}

function parseModelJson(content: string) {
	const trimmed = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
	return modelOutput.safeParse(JSON.parse(trimmed));
}

export async function recommendOnboardingRecipe(input: {
	description: string;
	provider?: AgentModelProvider;
	signal?: AbortSignal;
}): Promise<OnboardingRecommendation> {
	const description = input.description.trim();
	const fallback = fallbackRecipe(description);
	const buildFallback = (): OnboardingRecommendation => ({
		recipeId: fallback.id,
		recipeName: fallback.name,
		moduleIds: fallback.modules,
		rationale: `A practical ${fallback.name.toLowerCase()} starting point based on your description.`,
		source: "catalog-fallback",
	});
	if (!input.provider) return buildFallback();

	try {
		const turn = await input.provider.complete({
			runId: crypto.randomUUID(),
			messages: [
				{
					role: "user",
					content: `Choose exactly one recipe from the catalog for this business. Return only JSON shaped as {"recipeId":"catalog-id","rationale":"one short sentence"}. Never invent an id. Do not discuss pricing.\n\nBusiness:\n${description}\n\nCatalog:\n${compactCatalog()}`,
				},
			],
			tools: [],
			maxOutputTokens: ONBOARDING_RECOMMENDATION_MAX_OUTPUT_TOKENS,
			signal: input.signal ?? new AbortController().signal,
		});
		const parsed = parseModelJson(turn.content);
		if (!parsed.success) return buildFallback();
		const recipe = findRecipe(parsed.data.recipeId);
		if (!recipe) return buildFallback();
		return {
			recipeId: recipe.id,
			recipeName: recipe.name,
			moduleIds: recipe.modules,
			rationale: parsed.data.rationale,
			source: "ai",
		};
	} catch {
		return buildFallback();
	}
}
