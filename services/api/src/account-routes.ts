import {
	API_CAPABILITIES,
	issueApiKey,
	listApiKeys,
	revokeApiKey,
} from "@quickengine/auth/api-keys";
import {
	createSubscriptionForPaymentElement,
	getAccountPlanId,
	getPlanPricing,
	getStripe,
	getSubscriptionForOrg,
	getUsage,
	syncSeats,
	upsertSubscriptionFromStripe,
} from "@quickengine/billing";
import { getCacheProvider } from "@quickengine/cache";
import {
	createOrganization,
	deleteUserAccount,
	getUserOnboardingState,
	listOrganizationsForUser,
	markAllNotificationsRead,
	markNotificationRead,
	workspaceBelongsToOrganization,
} from "@quickengine/db";
import { listModules } from "@quickengine/module-registry";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeAccount, authorizeSession } from "./authorize-account";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

/**
 * The rest of account management: organizations, API keys, billing,
 * notifications, and account deletion.
 *
 * All session-authorised. **An API key can never reach any of these** — a key
 * belongs to one workspace, so letting it mint further keys, change billing or
 * delete the account would turn one leaked credential into total control.
 */

export const createOrganizationSchema = z.object({
	name: z.string().trim().min(1).max(120),
});

export const createApiKeySchema = z.object({
	workspaceId: z.string().uuid(),
	name: z.string().trim().min(1).max(120),
	/** Matches `QuickEngineApiKeyType`. Publishable keys are safe in a browser. */
	type: z.enum(["publishable", "secret", "scoped"]),
	capabilities: z.array(z.string()).default([]),
	expiresAt: z.string().datetime().optional(),
});

export const startSubscriptionSchema = z.object({
	planId: z.string().trim().min(1),
	cycle: z.enum(["monthly", "annual"]),
	billingEmail: z.string().trim().email(),
	billingName: z.string().trim().optional(),
	seats: z.number().int().min(1).optional(),
});
export const confirmSubscriptionSchema = z.object({
	subscriptionId: z.string().trim().min(1),
});
export const recommendationSchema = z.object({
	description: z.string().trim().min(10).max(500),
	recipes: z
		.array(
			z.object({
				id: z.string().min(1).max(100),
				name: z.string().min(1).max(120),
				category: z.string().min(1).max(120),
				keywords: z.array(z.string().max(80)).max(30),
				moduleIds: z.array(z.string().max(100)).max(30),
			}),
		)
		.min(1)
		.max(300),
});
const upcomingModules = [
	[
		"forms-intake",
		"Forms & Intake",
		"Public forms that create records in your workspace.",
		"shared",
	],
	[
		"notifications",
		"Notifications",
		"In-app and email alerts for what matters.",
		"shared",
	],
	[
		"subscriptions",
		"Subscriptions",
		"Recurring plans, renewals, and churn.",
		"domain",
	],
	[
		"expenses",
		"Expenses & Bookkeeping",
		"Track spending and reconcile the books.",
		"shared",
	],
	[
		"suppliers",
		"Suppliers & Purchasing",
		"Supplier records, purchase orders, and receiving.",
		"domain",
	],
	[
		"discounts",
		"Discounts & Promotions",
		"Codes, offers, eligibility, and date windows.",
		"domain",
	],
	[
		"locations",
		"Locations & Resources",
		"Sites, rooms, equipment, and capacity.",
		"domain",
	],
	[
		"production-jobs",
		"Production Jobs",
		"Custom production work from order to finished piece.",
		"domain",
	],
	[
		"content-cms",
		"Content & CMS",
		"Pages, posts, and editable site content.",
		"domain",
	],
	[
		"sales-pipeline",
		"Sales Pipeline",
		"Leads, deals, stages, and follow-ups.",
		"domain",
	],
	[
		"client-communications",
		"Client Communications",
		"Conversations with customers in one thread.",
		"shared",
	],
	[
		"reviews",
		"Reviews & Feedback",
		"Collect and publish customer reviews.",
		"domain",
	],
	[
		"support",
		"Support & Tickets",
		"Customer requests tracked to resolution.",
		"shared",
	],
	["tax", "Tax", "Rates, jurisdictions, and calculation snapshots.", "domain"],
	[
		"loyalty",
		"Loyalty & Rewards",
		"Points, tiers, and store credit.",
		"domain",
	],
	["gift-cards", "Gift Cards", "Issue, redeem, and track balances.", "domain"],
	[
		"returns",
		"Returns & Exchanges",
		"Requests, inspection, restocking, and refunds.",
		"domain",
	],
	["auctions", "Auctions", "Listings, bidding windows, and winners.", "domain"],
	[
		"email-marketing",
		"Email Marketing",
		"Audiences, campaigns, and delivery reporting.",
		"domain",
	],
	[
		"referrals",
		"Referrals & Affiliates",
		"Attribution, conversions, and rewards.",
		"domain",
	],
] as const;

const terms = (value: string) =>
	value
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((term) => term.length > 2);

function fallbackRecommendation(
	description: string,
	recipes: z.infer<typeof recommendationSchema>["recipes"],
) {
	const input = description.toLowerCase();
	const inputTerms = new Set(terms(description));
	let best = recipes[0];
	let bestScore = -1;
	for (const recipe of recipes) {
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
	return {
		recipeId: best.id,
		recipeName: best.name,
		moduleIds: best.moduleIds,
		rationale: `A practical ${best.name.toLowerCase()} starting point based on your description.`,
		source: "catalog-fallback" as const,
	};
}

export function registerAccountRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	app.get(
		"/v1/account/module-catalog",
		authorizeSession(options.platform),
		async (c) =>
			respond(c, {
				items: [
					...listModules().map((module) => ({
						id: module.id,
						name: module.name,
						description: module.description,
						kind: module.kind,
						dependsOn: module.dependsOn,
						status: "built" as const,
					})),
					...upcomingModules.map(([id, name, description, kind]) => ({
						id,
						name,
						description,
						kind,
						dependsOn: [],
						status: "upcoming" as const,
					})),
				],
			}),
	);
	app.post(
		"/v1/account/onboarding/recommend",
		authorizeSession(options.platform),
		async (c) => {
			const { description, recipes } = recommendationSchema.parse(
				await c.req.json(),
			);
			const fallback = fallbackRecommendation(description, recipes);
			try {
				const cache = getCacheProvider();
				const [attempts, globalAttempts] = await Promise.all([
					cache.increment(
						`onboarding:recommend:${c.get("account").userId}`,
						60 * 60,
					),
					cache.increment("onboarding:recommend:global", 24 * 60 * 60),
				]);
				if (attempts > 3) {
					return respondError(
						c,
						"RATE_LIMITED",
						"You've reached the recommendation limit for now.",
						429,
					);
				}
				if (globalAttempts > 500 || !process.env.ANTHROPIC_API_KEY) {
					return respond(c, fallback);
				}
			} catch {
				return respond(c, fallback);
			}

			try {
				const catalog = recipes
					.map(
						(recipe) =>
							`${recipe.id}|${recipe.name}|${recipe.category}|${recipe.keywords.join(",")}`,
					)
					.join("\n");
				const response = await fetch("https://api.anthropic.com/v1/messages", {
					method: "POST",
					headers: {
						"anthropic-version": "2023-06-01",
						"content-type": "application/json",
						"x-api-key": process.env.ANTHROPIC_API_KEY as string,
					},
					body: JSON.stringify({
						model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
						max_tokens: 180,
						messages: [
							{
								role: "user",
								content: `Choose exactly one recipe from the catalog for this business. Return only JSON shaped as {"recipeId":"catalog-id","rationale":"one short sentence"}. Never invent an id. Do not discuss pricing.\n\nBusiness:\n${description}\n\nCatalog:\n${catalog}`,
							},
						],
					}),
					signal: c.req.raw.signal,
				});
				if (!response.ok) return respond(c, fallback);
				const payload = (await response.json()) as {
					content?: Array<{ type?: string; text?: string }>;
				};
				const content =
					payload.content?.find((block) => block.type === "text")?.text ?? "";
				const parsed = z
					.object({
						recipeId: z.string(),
						rationale: z.string().min(1).max(240),
					})
					.safeParse(
						JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")),
					);
				const recipe = parsed.success
					? recipes.find((item) => item.id === parsed.data.recipeId)
					: null;
				if (!parsed.success || !recipe) return respond(c, fallback);
				return respond(c, {
					recipeId: recipe.id,
					recipeName: recipe.name,
					moduleIds: recipe.moduleIds,
					rationale: parsed.data.rationale,
					source: "ai" as const,
				});
			} catch {
				return respond(c, fallback);
			}
		},
	);
	app.get(
		"/v1/account/api-capabilities",
		authorizeSession(options.platform),
		(c) => respond(c, { items: API_CAPABILITIES }),
	);
	const session = authorizeSession(options.platform);
	const billing = authorizeAccount(options.platform, {
		capability: "billing.manage",
	});
	const keys = authorizeAccount(options.platform, {
		capability: "apikeys.manage",
	});
	app.get("/v1/account/billing/pricing", billing, async (c) =>
		respond(c, {
			currentPlanId: await getAccountPlanId(c.get("account").organizationId),
			pricing: await getPlanPricing(),
		}),
	);

	// ---- Organizations ------------------------------------------------------

	app.get("/v1/account/state", session, async (c) =>
		respond(c, await getUserOnboardingState(c.get("account").userId)),
	);

	app.get("/v1/account/organizations", session, async (c) =>
		respond(c, {
			items: await listOrganizationsForUser(c.get("account").userId),
		}),
	);

	/**
	 * Create an organization.
	 *
	 * Session-only: there is no organization to be a member of yet, so there is no
	 * membership to check.
	 */
	app.post("/v1/account/organizations", session, async (c) => {
		const input = createOrganizationSchema.parse(await c.req.json());
		const org = await createOrganization(input.name, c.get("account").userId);
		// Starts the gauge at one rather than zero. Without this the owner is
		// invisible to enforcement until somebody else joins.
		await syncSeats(org.id);
		return respond(c, org, 201);
	});

	// ---- API keys -----------------------------------------------------------

	/**
	 * Issue an API key.
	 *
	 * 🔴 **The plaintext key is returned exactly once, here, and is never
	 * retrievable again** — only a hash and a short recognisable prefix are
	 * stored. A caller that loses it must issue a new one. This is deliberate: a
	 * key that can be read back out of the database is a key that leaks with the
	 * database.
	 */
	app.post("/v1/account/api-keys", keys, async (c) => {
		const input = createApiKeySchema.parse(await c.req.json());
		if (
			!(await workspaceBelongsToOrganization(
				input.workspaceId,
				c.get("account").organizationId,
			))
		) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		const issued = await issueApiKey({
			workspaceId: input.workspaceId,
			createdByUserId: c.get("account").userId,
			name: input.name,
			type: input.type,
			capabilities: input.capabilities,
			expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
		});
		return respond(c, issued, 201);
	});

	app.delete("/v1/account/api-keys/:id", keys, async (c) => {
		const workspaceId = c.req.query("workspaceId");
		if (!workspaceId) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"workspaceId is required.",
				400,
			);
		}
		if (
			!(await workspaceBelongsToOrganization(
				workspaceId,
				c.get("account").organizationId,
			))
		) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		const revoked = await revokeApiKey(workspaceId, c.req.param("id"));
		if (!revoked) return respondError(c, "NOT_FOUND", "Key not found.", 404);
		return respond(c, { revoked: true });
	});

	app.get("/v1/account/api-keys", keys, async (c) => {
		const workspaceId = c.req.query("workspaceId");
		if (!workspaceId) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"workspaceId is required.",
				400,
			);
		}
		if (
			!(await workspaceBelongsToOrganization(
				workspaceId,
				c.get("account").organizationId,
			))
		) {
			return respondError(c, "NOT_FOUND", "Workspace not found.", 404);
		}
		return respond(c, { items: await listApiKeys(workspaceId) });
	});

	// ---- Billing ------------------------------------------------------------

	/** The plan in force and what it currently allows. Read-only. */
	app.get(
		"/v1/account/plan",
		authorizeAccount(options.platform, { capability: "workspace.view" }),
		async (c) => {
			const { organizationId } = c.get("account");
			const [planId, subscription, usage] = await Promise.all([
				getAccountPlanId(organizationId),
				getSubscriptionForOrg(organizationId),
				getUsage({ scopeId: organizationId }),
			]);
			return respond(c, {
				planId,
				subscription: subscription ?? null,
				usage,
			});
		},
	);
	app.post("/v1/account/subscription/confirm", billing, async (c) => {
		const { subscriptionId } = confirmSubscriptionSchema.parse(
			await c.req.json(),
		);
		const subscription =
			await getStripe().subscriptions.retrieve(subscriptionId);
		await upsertSubscriptionFromStripe(subscription);
		return respond(c, { confirmed: true });
	});

	/**
	 * Begin a subscription.
	 *
	 * Returns a client secret for Stripe Elements. **No plan change is applied
	 * here** — it lands when Stripe's webhook confirms payment, so an abandoned
	 * checkout can never leave an account on a plan nobody paid for.
	 */
	app.post("/v1/account/subscription", billing, async (c) => {
		const input = startSubscriptionSchema.parse(await c.req.json());
		try {
			const result = await createSubscriptionForPaymentElement({
				organizationId: c.get("account").organizationId,
				billingEmail: input.billingEmail,
				billingName: input.billingName,
				planId: input.planId as Parameters<
					typeof createSubscriptionForPaymentElement
				>[0]["planId"],
				cycle: input.cycle,
				seats: input.seats,
			});
			return respond(c, result, 201);
		} catch (error) {
			// A missing price is our misconfiguration, not the caller's mistake, and
			// saying so plainly beats a 500 nobody can act on.
			if (error instanceof Error && error.message.includes("No Stripe price")) {
				return respondError(
					c,
					"DEPENDENCY_UNAVAILABLE",
					"That plan is not available for checkout yet.",
					503,
				);
			}
			throw error;
		}
	});

	// ---- Notifications ------------------------------------------------------

	// Scoped to the caller, not the organization: a notification belongs to a
	// person, and the data layer matches on user id as well as notification id so
	// one user can never mark another's as read.
	app.post("/v1/account/notifications/:id/read", session, async (c) => {
		await markNotificationRead(c.get("account").userId, c.req.param("id"));
		return respond(c, { read: true });
	});

	app.post("/v1/account/notifications/read-all", session, async (c) => {
		await markAllNotificationsRead(c.get("account").userId);
		return respond(c, { read: true });
	});

	// ---- Account deletion ---------------------------------------------------

	/**
	 * Permanently delete the signed-in account.
	 *
	 * 🔴 **Irreversible, and only ever the caller's own account** — the user id
	 * comes from the session and is never accepted as a parameter, so this cannot
	 * be pointed at somebody else.
	 *
	 * Refused while any owned workspace still holds stored files: deleting the
	 * rows would orphan the bytes in blob storage, billed forever and attached to
	 * nobody.
	 */
	app.delete("/v1/account", session, async (c) => {
		try {
			await deleteUserAccount(c.get("account").userId);
			return respond(c, { deleted: true });
		} catch (error) {
			if (
				error instanceof Error &&
				error.message === "ACCOUNT_HAS_STORED_FILES"
			) {
				return respondError(
					c,
					"CONFLICT",
					"Delete the files in your workspaces before deleting your account.",
					409,
				);
			}
			throw error;
		}
	});
}
