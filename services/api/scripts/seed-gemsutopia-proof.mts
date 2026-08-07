/**
 * Seed the isolated Gemsutopia QuickConnect proof into LOCAL Docker.
 *
 * The script refuses a non-local DATABASE_URL and writes the browser-safe
 * workspace/key contract directly to a caller-selected, gitignored env file.
 * It never reads or writes Reese's production data.
 *
 * QUICKCONNECT_ENV_FILE=/absolute/path/apps/web/.env.local pnpm proof:gemsutopia
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	issueApiKey,
	STOREFRONT_CAPABILITIES,
} from "@quickengine/auth/api-keys";
import {
	catalogCategories,
	catalogItemCategories,
	catalogItems,
	contentEntries,
	db,
	discounts,
	eq,
	inventoryItems,
	quickengineApiKeys,
	quickengineOrganizationMembers,
	quickengineOrganizations,
	quickengineUsers,
	quickengineWorkspaces,
	shippingRates,
	shippingZones,
	workspaceModules,
} from "@quickengine/db";
import { and, count } from "drizzle-orm";

const OWNER_ID = "quickconnect-proof-owner";
const ORGANIZATION_ID = "00000000-0000-4000-8000-00000000a101";
const WORKSPACE_ID = "00000000-0000-4000-8000-00000000a102";
const ITEM_IDS = {
	amethyst: "00000000-0000-4000-8000-00000000a201",
	labradorite: "00000000-0000-4000-8000-00000000a202",
	quartz: "00000000-0000-4000-8000-00000000a203",
} as const;
const INVENTORY_IDS = {
	amethyst: "00000000-0000-4000-8000-00000000a301",
	labradorite: "00000000-0000-4000-8000-00000000a302",
	quartz: "00000000-0000-4000-8000-00000000a303",
} as const;
const CATEGORY_IDS = {
	crystals: "00000000-0000-4000-8000-00000000a401",
	collector: "00000000-0000-4000-8000-00000000a402",
} as const;
const SHIPPING_IDS = {
	zone: "00000000-0000-4000-8000-00000000a501",
	standard: "00000000-0000-4000-8000-00000000a502",
	express: "00000000-0000-4000-8000-00000000a503",
} as const;
const DISCOUNT_ID = "00000000-0000-4000-8000-00000000a601";
const MARKER =
	"# QuickConnect synthetic proof. Safe to replace by rerunning the seed.\n";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
	throw new Error("Refusing to seed anything except local Docker Postgres.");
}
if (databaseUrl.port !== "5435") {
	throw new Error(
		`Expected local Docker Postgres on port 5435, got ${databaseUrl.port}.`,
	);
}

const envFile = process.env.QUICKCONNECT_ENV_FILE;
if (!envFile?.startsWith("/")) {
	throw new Error(
		"QUICKCONNECT_ENV_FILE must be an absolute path to the proof app's .env.local.",
	);
}

const existingEnv = await readFile(envFile, "utf8").catch(() => null);
if (existingEnv !== null && !existingEnv.startsWith(MARKER)) {
	throw new Error(
		`Refusing to overwrite an env file not created by this proof: ${envFile}`,
	);
}

await db
	.insert(quickengineUsers)
	.values({
		id: OWNER_ID,
		name: "Gemsutopia Proof Owner",
		email: "quickconnect-proof@local.invalid",
		emailVerified: true,
		companyName: "Gemsutopia Proof",
		onboardingCompletedAt: new Date(),
	})
	.onConflictDoUpdate({
		target: quickengineUsers.id,
		set: { name: "Gemsutopia Proof Owner", updatedAt: new Date() },
	});

await db
	.insert(quickengineOrganizations)
	.values({
		id: ORGANIZATION_ID,
		name: "Gemsutopia Proof",
		slug: "gemsutopia-quickconnect-proof",
		isPersonal: true,
		ownerId: OWNER_ID,
	})
	.onConflictDoUpdate({
		target: quickengineOrganizations.id,
		set: { name: "Gemsutopia Proof", updatedAt: new Date() },
	});

await db
	.insert(quickengineOrganizationMembers)
	.values({ organizationId: ORGANIZATION_ID, userId: OWNER_ID, role: "owner" })
	.onConflictDoNothing();

const modules = [
	"client-records",
	"products-services",
	"orders",
	"payments",
	"inventory",
	"fulfillment",
	"shipping",
	"content",
] as const;

await db
	.insert(quickengineWorkspaces)
	.values({
		id: WORKSPACE_ID,
		ownerId: OWNER_ID,
		organizationId: ORGANIZATION_ID,
		name: "Gemsutopia Synthetic",
		slug: "gemsutopia-synthetic",
		businessType: "ecommerce",
		modules: [...modules],
	})
	.onConflictDoUpdate({
		target: quickengineWorkspaces.id,
		set: { modules: [...modules], updatedAt: new Date() },
	});

for (const moduleId of modules) {
	await db
		.insert(workspaceModules)
		.values({ workspaceId: WORKSPACE_ID, moduleId, enabled: true })
		.onConflictDoNothing();
}

const products = [
	{
		id: ITEM_IDS.amethyst,
		name: "Canadian Amethyst Cluster",
		description:
			"A synthetic fixture representing a natural Canadian amethyst cluster.",
		sku: "PROOF-AMETHYST-001",
		priceCents: 8_500,
		weightGrams: 420,
		metadata: { slug: "canadian-amethyst-cluster", featured: true, images: [] },
	},
	{
		id: ITEM_IDS.labradorite,
		name: "Labradorite Palm Stone",
		description:
			"A synthetic fixture with blue flash for catalog and checkout testing.",
		sku: "PROOF-LABRADORITE-001",
		priceCents: 3_200,
		weightGrams: 180,
		metadata: { slug: "labradorite-palm-stone", featured: true, images: [] },
	},
	{
		id: ITEM_IDS.quartz,
		name: "Clear Quartz Point",
		description:
			"A synthetic fixture used to prove filtering and multi-item baskets.",
		sku: "PROOF-QUARTZ-001",
		priceCents: 2_400,
		weightGrams: 140,
		metadata: { slug: "clear-quartz-point", featured: false, images: [] },
	},
] as const;

for (const product of products) {
	await db
		.insert(catalogItems)
		.values({
			...product,
			workspaceId: WORKSPACE_ID,
			type: "physical",
			status: "active",
			pricingModel: "fixed",
			currency: "CAD",
		})
		.onConflictDoUpdate({
			target: catalogItems.id,
			set: {
				name: product.name,
				description: product.description,
				priceCents: product.priceCents,
				weightGrams: product.weightGrams,
				metadata: product.metadata,
				status: "active",
				updatedAt: new Date(),
			},
		});
}

const categories = [
	{
		id: CATEGORY_IDS.crystals,
		name: "Crystals and Minerals",
		slug: "crystals-minerals",
		description: "Natural crystals, mineral specimens and polished stones.",
		sortOrder: 0,
	},
	{
		id: CATEGORY_IDS.collector,
		name: "Collector Pieces",
		slug: "collector-pieces",
		description: "Distinctive specimens selected for collectors.",
		sortOrder: 1,
	},
] as const;
for (const category of categories) {
	await db
		.insert(catalogCategories)
		.values({
			...category,
			workspaceId: WORKSPACE_ID,
			kind: "category",
			visible: true,
		})
		.onConflictDoUpdate({
			target: catalogCategories.id,
			set: {
				name: category.name,
				description: category.description,
				visible: true,
				sortOrder: category.sortOrder,
				updatedAt: new Date(),
			},
		});
}
await db
	.insert(catalogItemCategories)
	.values([
		{ catalogItemId: ITEM_IDS.amethyst, categoryId: CATEGORY_IDS.collector },
		{ catalogItemId: ITEM_IDS.labradorite, categoryId: CATEGORY_IDS.crystals },
		{ catalogItemId: ITEM_IDS.quartz, categoryId: CATEGORY_IDS.crystals },
	])
	.onConflictDoNothing();

const publishedContent = {
	"site.name": "Gemsutopia",
	"site.tagline": "Natural gems and minerals for curious collectors",
	"site.description": "A synthetic QuickConnect storefront proof.",
	"commerce.currency": "CAD",
	"commerce.currency_symbol": "$",
} as const;
for (const [contentKey, value] of Object.entries(publishedContent)) {
	await db
		.insert(contentEntries)
		.values({
			workspaceId: WORKSPACE_ID,
			key: contentKey,
			type: "text",
			kind: "single",
			value,
			published: true,
			label: contentKey,
			group: "Synthetic proof",
		})
		.onConflictDoUpdate({
			target: [contentEntries.workspaceId, contentEntries.key],
			set: { value, published: true, updatedAt: new Date() },
		});
}

const stock = [
	{ id: INVENTORY_IDS.amethyst, catalogItemId: ITEM_IDS.amethyst, onHand: 8 },
	{
		id: INVENTORY_IDS.labradorite,
		catalogItemId: ITEM_IDS.labradorite,
		onHand: 14,
	},
	{ id: INVENTORY_IDS.quartz, catalogItemId: ITEM_IDS.quartz, onHand: 0 },
] as const;
for (const item of stock) {
	await db
		.insert(inventoryItems)
		.values({ ...item, workspaceId: WORKSPACE_ID, status: "active" })
		.onConflictDoUpdate({
			target: inventoryItems.id,
			set: { onHand: item.onHand, reserved: 0, status: "active" },
		});
}

/**
 * Delivery, so checkout has a rate it can be asked to price.
 *
 * Two rates in one zone rather than one, because the storefront picks the
 * cheapest OFFERED option and sends back its id — with a single rate that choice
 * is unfalsifiable, and a browser naming an expensive rate while paying for a
 * cheap one would go unnoticed.
 *
 * `freeOverCents` is set on standard delivery so the proof also exercises the
 * free-shipping path as an amount of zero coming back from the server, rather
 * than as a flag the page decides for itself.
 */
await db
	.insert(shippingZones)
	.values({
		id: SHIPPING_IDS.zone,
		workspaceId: WORKSPACE_ID,
		name: "Canada",
		countryCodes: ["CA"],
		regionCodes: [],
		priority: 0,
		active: true,
	})
	.onConflictDoUpdate({
		target: shippingZones.id,
		set: { countryCodes: ["CA"], active: true, updatedAt: new Date() },
	});

const rates = [
	{
		id: SHIPPING_IDS.standard,
		name: "Standard",
		description: "Synthetic fixture rate. Free over $150.",
		baseCents: 1_200,
		freeOverCents: 15_000,
		estimatedDaysMin: 4,
		estimatedDaysMax: 7,
	},
	{
		id: SHIPPING_IDS.express,
		name: "Express",
		description: "Synthetic fixture rate. Never free.",
		baseCents: 2_800,
		freeOverCents: null,
		estimatedDaysMin: 1,
		estimatedDaysMax: 2,
	},
] as const;

for (const rate of rates) {
	await db
		.insert(shippingRates)
		.values({
			...rate,
			workspaceId: WORKSPACE_ID,
			zoneId: SHIPPING_IDS.zone,
			active: true,
		})
		.onConflictDoUpdate({
			target: shippingRates.id,
			set: {
				baseCents: rate.baseCents,
				freeOverCents: rate.freeOverCents,
				active: true,
				updatedAt: new Date(),
			},
		});
}

/**
 * One discount code, so the preview can be proven against a real rule.
 *
 * A minimum is set deliberately: the prototype took the subtotal from the
 * browser, so a minimum was the easiest thing in the world to clear by lying.
 * The proof asserts the server computes it from the basket instead.
 */
await db
	.insert(discounts)
	.values({
		id: DISCOUNT_ID,
		workspaceId: WORKSPACE_ID,
		name: "Synthetic proof code",
		code: "PROOF10",
		valueType: "percentage",
		value: 1_000, // basis points — 10%
		minimumSubtotalCents: 5_000,
		active: true,
	})
	.onConflictDoUpdate({
		target: discounts.id,
		set: {
			value: 1_000,
			minimumSubtotalCents: 5_000,
			active: true,
			updatedAt: new Date(),
		},
	});

const key = await issueApiKey({
	workspaceId: WORKSPACE_ID,
	createdByUserId: OWNER_ID,
	name: "Gemsutopia QuickConnect synthetic proof",
	type: "storefront",
	capabilities: STOREFRONT_CAPABILITIES,
});
await db
	.update(quickengineApiKeys)
	.set({ allowedOrigins: ["http://localhost:3000"], updatedAt: new Date() })
	.where(eq(quickengineApiKeys.id, key.id));

await mkdir(dirname(envFile), { recursive: true });
await writeFile(
	envFile,
	`${MARKER}NEXT_PUBLIC_QUICKDASH_API_URL=http://localhost:3020\nNEXT_PUBLIC_QUICKDASH_WORKSPACE_ID=${WORKSPACE_ID}\nNEXT_PUBLIC_QUICKDASH_SITE_KEY=${key.plaintext}\n`,
	{ mode: 0o600 },
);

const [verification] = await db
	.select({ products: count() })
	.from(catalogItems)
	.where(
		and(
			eq(catalogItems.workspaceId, WORKSPACE_ID),
			eq(catalogItems.status, "active"),
		),
	);
const [categoryVerification] = await db
	.select({ categories: count() })
	.from(catalogCategories)
	.where(eq(catalogCategories.workspaceId, WORKSPACE_ID));
const [contentVerification] = await db
	.select({ content: count() })
	.from(contentEntries)
	.where(
		and(
			eq(contentEntries.workspaceId, WORKSPACE_ID),
			eq(contentEntries.published, true),
		),
	);
const [verifiedKey] = await db
	.select({ allowedOrigins: quickengineApiKeys.allowedOrigins })
	.from(quickengineApiKeys)
	.where(eq(quickengineApiKeys.id, key.id))
	.limit(1);
if (
	verification?.products !== products.length ||
	categoryVerification?.categories !== categories.length ||
	contentVerification?.content !== Object.keys(publishedContent).length ||
	!verifiedKey?.allowedOrigins.includes("http://localhost:3000")
) {
	throw new Error("Synthetic QuickConnect fixture verification failed.");
}

console.log(`Seeded Gemsutopia synthetic workspace ${WORKSPACE_ID}.`);
console.log(
	`Verified ${verification.products} active synthetic catalog items.`,
);
console.log(
	`Verified ${categoryVerification.categories} categories and ${contentVerification.content} published content slots.`,
);
console.log(`Wrote the browser-safe QuickConnect contract to ${envFile}.`);
console.log(`Issued key prefix ${key.prefix}; the full value was not printed.`);
