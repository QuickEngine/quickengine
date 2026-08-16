#!/usr/bin/env node
/**
 * Import a workspace from the previous QuickDash into the current one.
 *
 * The first real customer migration, written for Gemsutopia but parameterised
 * rather than hardcoded: the two systems share a workspace model, so any early
 * customer still on the old QuickDash takes this same path.
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 *
 * 🔴 The SOURCE connection is opened read-only at the protocol level
 * (`default_transaction_read_only=on`), so "we only SELECT from it" is a
 * guarantee the database enforces rather than a promise this file makes. A
 * stray UPDATE fails with a Postgres error instead of mutating a live business's
 * records.
 *
 * 🔴 Dry run by DEFAULT. `--apply` is required to write anything. A dry run
 * reads everything, performs every transform, and reports exactly what it would
 * do — including the values it is unsure about — so the mapping is reviewable
 * before it touches a target.
 *
 * ⚠️ Idempotent. Source ids are preserved as target ids and every write is an
 * upsert, so re-running after a partial failure converges instead of
 * duplicating. This matters more than it sounds: the alternative is a half
 * migrated catalog nobody can safely re-run.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   LEGACY_DATABASE_URL=postgres://…            # old QuickDash, read-only
 *   LEGACY_WORKSPACE_ID=3410dcaf-…
 *   DATABASE_URL=postgres://…                   # target (Docker first, then Neon)
 *   TARGET_WORKSPACE_ID=41aa845f-…
 *
 *   node --env-file=../../.env.local legacy-import.mjs            # dry run
 *   node --env-file=../../.env.local legacy-import.mjs --apply
 */

import { put } from "@vercel/blob";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
/**
 * Pull `data:` images out of content and into the public assets bucket.
 *
 * 🔴 Without this, ~30 MB of base64 lands in `content_entries.value` — and the
 * published-content read is one query on every storefront page load, so those
 * bytes would cross the wire before a visitor sees a single word. Off by
 * default because it writes to real Blob storage; the import refuses to store
 * base64 either way and simply reports the slots it had to leave behind.
 */
const EXTRACT_IMAGES = process.argv.includes("--extract-images");

const required = (name) => {
	const value = process.env[name];
	if (!value) {
		console.error(`Missing ${name}`);
		process.exit(1);
	}
	return value;
};

const SOURCE_URL = required("LEGACY_DATABASE_URL");
const SOURCE_WS = required("LEGACY_WORKSPACE_ID");
const TARGET_URL = required("DATABASE_URL");
const TARGET_WS = required("TARGET_WORKSPACE_ID");

/**
 * Images we refuse to carry.
 *
 * 🔴 Gemsutopia's image host — a Supabase project — was DELETED, and its
 * hostname now returns NXDOMAIN. Importing those URLs would publish a catalog of
 * broken images that looks like our bug. An empty image list is honest; a dead
 * URL is not.
 */
const isDeadImage = (url) =>
	typeof url !== "string" ||
	url.length === 0 ||
	/\/\/[a-z0-9-]+\.supabase\.co\//i.test(url);

/** Grams, because `catalog_items` stores one unit and gem sellers use three. */
const GRAMS_PER = { g: 1, ct: 0.2, oz: 28.349523125, lb: 453.59237 };

const toGrams = (weight, unit) => {
	const amount = Number(weight);
	if (!Number.isFinite(amount) || amount <= 0) return null;
	const factor = GRAMS_PER[String(unit || "g").toLowerCase()];
	if (!factor) return null;
	return Math.max(1, Math.round(amount * factor));
};

/**
 * Replace every `data:image/…;base64,…` inside a content value with a URL.
 *
 * Walks strings, arrays and objects because the shapes differ per slot:
 * `about:image` is a bare string, `hero:images` is an array of objects each
 * holding one. Returns the rewritten value plus what it did, so a slot that
 * could not be extracted is reported rather than silently emptied.
 */
async function extractImages(value, keyPrefix, workspaceId, stats) {
	if (typeof value === "string") {
		// 🔴 Matched ANYWHERE in the string, not anchored to the whole of it. The
		// first version anchored with ^…$ and silently missed 21 MB: `hero:images`
		// is a JSON *string* holding an array of objects, so the data URIs sat
		// inside a larger string and never looked like one to an anchored test.
		const pattern = /data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)/gi;
		const matches = [...value.matchAll(pattern)];
		if (matches.length === 0) return value;

		let out = value;
		for (const [whole, contentType, base64] of matches) {
			stats.found += 1;
			if (!EXTRACT_IMAGES) {
				stats.dropped += 1;
				continue;
			}
			const bytes = Buffer.from(base64, "base64");
			const extension = contentType.split("/")[1].replace("+xml", "");
			const key = `${workspaceId}/content/${keyPrefix}-${stats.found}.${extension}`;
			const stored = await put(`assets/${key}`, bytes, {
				access: "public",
				addRandomSuffix: false,
				allowOverwrite: true,
				contentType,
			});
			stats.uploaded += 1;
			stats.bytes += bytes.byteLength;
			out = out.replace(whole, stored.url);
		}
		// Nothing extracted means the base64 is still in there, and storing it is
		// the outcome this function exists to prevent.
		return EXTRACT_IMAGES ? out : null;
	}
	if (Array.isArray(value)) {
		const out = [];
		for (const entry of value) {
			out.push(await extractImages(entry, keyPrefix, workspaceId, stats));
		}
		return out;
	}
	if (value && typeof value === "object") {
		const out = {};
		for (const [name, entry] of Object.entries(value)) {
			out[name] = await extractImages(entry, keyPrefix, workspaceId, stats);
		}
		return out;
	}
	return value;
}

const toCents = (amount) => {
	const value = Number(amount);
	return Number.isFinite(value) ? Math.round(value * 100) : null;
};

/**
 * What the shopper actually pays.
 *
 * 🔴 17 of Gemsutopia's 31 products carry an ACTIVE `sale_price` while `price`
 * and `compare_at_price` both hold the list price. Copying `price` across would
 * silently raise 17 live prices — the single most damaging thing this script
 * could get wrong, and invisible in a row count.
 */
function priceOf(product, now = new Date()) {
	const saleActive =
		product.sale_price != null &&
		(!product.sale_starts_at || new Date(product.sale_starts_at) <= now) &&
		(!product.sale_ends_at || new Date(product.sale_ends_at) > now);
	const selling = toCents(saleActive ? product.sale_price : product.price);
	const listed = toCents(product.compare_at_price ?? product.price);
	return {
		priceCents: selling,
		// Only a genuine strike-through. Equal values are noise on a product page.
		compareAtPriceCents:
			listed != null && selling != null && listed > selling ? listed : null,
		saleActive,
	};
}

/**
 * Neon's POOLER refuses startup parameters, and the read-only guarantee is one.
 *
 * Rather than drop the guarantee to keep the pooler, drop the pooler: the direct
 * endpoint is the same database and this script opens exactly one connection.
 * Silently falling back to a writable session would defeat the entire point.
 */
const unpooled = (url) => url.replace(/-pooler(?=\.[^/]*\.neon\.tech)/i, "");

const source = postgres(unpooled(SOURCE_URL), {
	max: 1,
	ssl: "require",
	// The read-only guarantee. Applied as a startup parameter so it holds for
	// every statement on the connection, not just ones inside a transaction.
	connection: { options: "-c default_transaction_read_only=on" },
	onnotice: () => {},
});

const target = postgres(TARGET_URL, {
	max: 1,
	ssl: TARGET_URL.includes("localhost") ? false : "require",
	onnotice: () => {},
});

const report = [];
const note = (stage, message) => report.push(`  ${stage}: ${message}`);

async function main() {
	console.log(APPLY ? "APPLYING" : "DRY RUN (pass --apply to write)");
	console.log(`  source workspace ${SOURCE_WS}`);
	console.log(`  target workspace ${TARGET_WS}\n`);

	const [workspace] = await target`
		select id, name, environment from quickengine_workspaces where id = ${TARGET_WS}
	`;
	if (!workspace) {
		console.error(`Target workspace ${TARGET_WS} does not exist.`);
		process.exit(1);
	}
	console.log(`Target: ${workspace.name} (${workspace.environment})\n`);

	const counts = {};

	// ── Categories ───────────────────────────────────────────────────────────
	// First, because catalog items link to them.
	const categories = await source`
		select * from categories where workspace_id = ${SOURCE_WS} order by sort_order nulls last, name
	`;
	for (const category of categories) {
		if (!APPLY) continue;
		await target`
			insert into catalog_categories
				(id, workspace_id, kind, name, slug, description, sort_order, image_url, visible)
			values (
				${category.id}, ${TARGET_WS}, 'category', ${category.name}, ${category.slug},
				${category.description}, ${category.sort_order ?? 0},
				${isDeadImage(category.image) ? null : category.image}, true
			)
			on conflict (id) do update set
				name = excluded.name, slug = excluded.slug,
				description = excluded.description, sort_order = excluded.sort_order,
				image_url = excluded.image_url, updated_at = now()
		`;
	}
	counts.categories = categories.length;

	// ── Products ─────────────────────────────────────────────────────────────
	const products = await source`
		select * from products where workspace_id = ${SOURCE_WS} order by created_at
	`;
	let onSale = 0;
	let imagesDropped = 0;
	let missingPrice = 0;
	const links = [];

	for (const product of products) {
		const { priceCents, compareAtPriceCents, saleActive } = priceOf(product);
		if (saleActive) onSale += 1;
		if (priceCents == null) {
			missingPrice += 1;
			note("products", `no price, imported as draft: ${product.name}`);
		}

		const sourceImages = Array.isArray(product.images) ? product.images : [];
		const images = sourceImages.filter((url) => !isDeadImage(url));
		imagesDropped += sourceImages.length - images.length;
		const thumbnail = isDeadImage(product.thumbnail) ? null : product.thumbnail;

		// Everything the storefront's adapter reads by name. Keys match
		// `mapQuickProduct` exactly; renaming one silently blanks a product page.
		const metadata = {
			slug: product.slug ?? null,
			shortDescription: product.short_description ?? null,
			tags: Array.isArray(product.tags) ? product.tags : [],
			featured: Boolean(product.is_featured),
			subscribable: Boolean(product.is_subscribable),
			compareAtPriceCents,
			images,
			...(thumbnail ? { thumbnail } : {}),
			// The unit a gemstone is actually sold by. `weight_grams` cannot hold it;
			// recorded in TECH_DEBT as a gap rather than silently dropped.
			...(product.weight_unit ? { weightUnit: product.weight_unit } : {}),
			...(product.weight ? { weightValue: Number(product.weight) } : {}),
			...(product.meta_title ? { seoTitle: product.meta_title } : {}),
			...(product.meta_description
				? { seoDescription: product.meta_description }
				: {}),
		};

		if (product.category_id) {
			links.push({ item: product.id, category: product.category_id });
		}

		if (!APPLY) continue;
		await target`
			insert into catalog_items
				(id, workspace_id, name, description, type, status, pricing_model,
				 price_cents, currency, weight_grams, metadata, created_at, updated_at)
			values (
				${product.id}, ${TARGET_WS}, ${product.name}, ${product.description},
				'physical',
				${priceCents == null ? "draft" : product.is_active ? "active" : "draft"},
				'fixed', ${priceCents}, 'USD',
				${toGrams(product.weight, product.weight_unit)},
				${target.json(metadata)},
				${product.created_at}, ${product.updated_at ?? product.created_at}
			)
			on conflict (id) do update set
				name = excluded.name, description = excluded.description,
				status = excluded.status, price_cents = excluded.price_cents,
				weight_grams = excluded.weight_grams, metadata = excluded.metadata,
				updated_at = now()
		`;
	}

	const knownCategories = new Set(categories.map((c) => c.id));
	let linked = 0;
	for (const link of links) {
		if (!knownCategories.has(link.category)) {
			note("links", `product references a missing category ${link.category}`);
			continue;
		}
		linked += 1;
		if (!APPLY) continue;
		await target`
			insert into catalog_item_categories (catalog_item_id, category_id, sort_order)
			values (${link.item}, ${link.category}, 0)
			on conflict do nothing
		`;
	}

	counts.products = products.length;
	counts.categoryLinks = linked;
	note("products", `${onSale} imported at their active sale price`);
	if (imagesDropped) {
		note("products", `${imagesDropped} dead image urls dropped (deleted host)`);
	}
	if (missingPrice) note("products", `${missingPrice} had no usable price`);

	// ── Content ──────────────────────────────────────────────────────────────
	// Named slots. `gem_fact` rows collapse into one list slot rather than 17
	// uuid-keyed singles, which is what `kind: "list"` exists for.
	const slots = await source`
		select key, type, value from site_content where workspace_id = ${SOURCE_WS} order by key
	`;
	const gemFacts = [];
	const entries = [];
	const imageStats = { found: 0, uploaded: 0, dropped: 0, bytes: 0 };

	for (const slot of slots) {
		let raw = slot.value;
		const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? null);
		if (/data:image\/[a-z+.-]+;base64,/i.test(text)) {
			raw = await extractImages(
				raw,
				slot.key.replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
				TARGET_WS,
				imageStats,
			);
		}
		if (slot.type === "gem_fact") {
			gemFacts.push(typeof raw === "string" ? JSON.parse(raw) : raw);
			continue;
		}
		entries.push({
			key: slot.key,
			type: slot.type === "json" ? "json" : "text",
			kind: "single",
			value: raw,
			group: slot.key.includes(":") ? slot.key.split(":")[0] : null,
		});
	}
	if (gemFacts.length) {
		entries.push({
			key: "gem_facts",
			type: "json",
			kind: "list",
			value: gemFacts,
			group: "Gem facts",
		});
	}

	// The three legacy collections. `kind: "list"` was designed for exactly this
	// — the module notes name FAQ and testimonials as the reason it exists.
	const collections = await source`
		select c.slug, c.name, e.data, e.sort_order, e.is_active
		from content_collections c
		join content_entries e on e.collection_id = c.id
		where c.workspace_id = ${SOURCE_WS}
		order by c.slug, e.sort_order nulls last
	`;
	const grouped = new Map();
	for (const row of collections) {
		if (row.is_active === false) continue;
		if (!grouped.has(row.slug)) grouped.set(row.slug, []);
		grouped.get(row.slug).push(row.data);
	}
	for (const [slug, items] of grouped) {
		entries.push({
			key: slug,
			type: "json",
			kind: "list",
			value: items,
			group: "Collections",
		});
	}

	// SEO and social copy are words on the website, so they belong in content
	// rather than in a settings table the storefront cannot read.
	const SEO_KEYS = new Set([
		"seo_title",
		"seo_description",
		"seo_keywords",
		"seo_author",
		"open_graph_title",
		"open_graph_description",
		"open_graph_image",
		"twitter_title",
		"twitter_description",
		"twitter_image",
		"site_tagline",
		"store_tagline",
	]);
	const settings = await source`
		select key, value, "group" from store_settings where workspace_id = ${SOURCE_WS}
	`;
	const unmapped = [];
	const branding = {};
	for (const setting of settings) {
		const value =
			typeof setting.value === "string"
				? setting.value.replace(/^"|"$/g, "")
				: setting.value;
		if (SEO_KEYS.has(setting.key)) {
			entries.push({
				key: `seo.${setting.key}`,
				type: "text",
				kind: "single",
				value,
				group: "SEO",
			});
			continue;
		}
		if (setting.key === "site_name") branding.display_name = value;
		else if (setting.key === "support_email" || setting.key === "contact_email")
			branding.support_email ??= value;
		// Only an absolute url. The legacy value is often `/favicon.ico`, which is
		// meaningful on his own domain and meaningless anywhere else — including in
		// QuickDash, which is where this field is rendered.
		else if (
			setting.key === "site_favicon" &&
			!isDeadImage(value) &&
			/^https?:\/\//i.test(String(value))
		)
			branding.favicon_url = value;
		else unmapped.push(setting.key);
	}

	for (const entry of entries) {
		if (!APPLY) continue;
		await target`
			insert into content_entries (workspace_id, key, type, kind, value, published, "group")
			values (${TARGET_WS}, ${entry.key}, ${entry.type}, ${entry.kind},
				${target.json(entry.value ?? null)}, true, ${entry.group})
			on conflict (workspace_id, key) do update set
				type = excluded.type, kind = excluded.kind, value = excluded.value,
				published = excluded.published, "group" = excluded."group",
				updated_at = now()
		`;
	}
	counts.contentSlots = entries.length;
	if (imageStats.uploaded) {
		note(
			"content",
			`${imageStats.uploaded} embedded images extracted to blob (${Math.round(imageStats.bytes / 1024)} KB)`,
		);
	}
	if (imageStats.dropped) {
		note(
			"content",
			`${imageStats.dropped} embedded images NOT carried — re-run with --extract-images to move them to blob`,
		);
	}
	if (unmapped.length) {
		note("settings", `not migrated: ${unmapped.sort().join(", ")}`);
	}

	// ── Branding ─────────────────────────────────────────────────────────────
	if (Object.keys(branding).length && APPLY) {
		const [existing] = await target`
			select id from workspace_branding where workspace_id = ${TARGET_WS}
		`;
		if (existing) {
			await target`
				update workspace_branding set ${target(branding)}, updated_at = now()
				where workspace_id = ${TARGET_WS}
			`;
		} else {
			// `portal_slug` is NOT NULL and is the workspace's address for its own
			// customer portal, so it has to be derived rather than left out. Built
			// from the workspace name because that is what the operator recognises.
			const portalSlug =
				String(workspace.name)
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "")
					.slice(0, 40) || `workspace-${TARGET_WS.slice(0, 8)}`;
			await target`
				insert into workspace_branding ${target({
					workspace_id: TARGET_WS,
					portal_slug: portalSlug,
					...branding,
				})}
			`;
		}
	}
	counts.branding = Object.keys(branding).length;

	// ── Discounts ────────────────────────────────────────────────────────────
	const discounts = await source`
		select * from discounts where workspace_id = ${SOURCE_WS}
	`;
	for (const discount of discounts) {
		// The old table carried both `discount_type` and `value_type`; the current
		// one keeps a single `value_type`. Reported rather than guessed at.
		const valueType = String(
			discount.value_type ?? discount.discount_type ?? "",
		).toLowerCase();
		const mapped = valueType.startsWith("percent") ? "percentage" : "fixed";
		// 🔴 The old table stored a decimal percentage (20.00 = 20%); the current
		// one stores BASIS POINTS for percentages and minor units for fixed
		// amounts. Copying the number across would turn a 20% code into 0.2%.
		const value = Math.round(Number(discount.value) * 100);
		note(
			"discounts",
			`${discount.code}: ${valueType || "unknown"} ${discount.value} -> ${mapped} ${value}${mapped === "percentage" ? " bp" : " cents"}`,
		);
		if (!APPLY) continue;
		await target`
			insert into discounts
				(id, workspace_id, name, code, value_type, value, minimum_subtotal_cents,
				 max_redemptions, times_redeemed, max_redemptions_per_customer,
				 starts_at, ends_at, active)
			values (
				${discount.id}, ${TARGET_WS}, ${discount.name}, ${discount.code},
				${mapped}, ${value},
				${toCents(discount.minimum_order_amount) ?? 0},
				${discount.max_uses}, ${discount.current_uses ?? 0},
				${discount.max_uses_per_user},
				${discount.starts_at}, ${discount.expires_at}, ${discount.is_active ?? true}
			)
			on conflict (id) do update set
				name = excluded.name, value_type = excluded.value_type,
				value = excluded.value, active = excluded.active, updated_at = now()
		`;
	}
	counts.discounts = discounts.length;

	// ── Reconciliation ───────────────────────────────────────────────────────
	console.log("Planned:");
	for (const [name, count] of Object.entries(counts)) {
		console.log(`  ${String(count).padStart(5)}  ${name}`);
	}
	if (report.length) {
		console.log("\nNotes:");
		for (const line of report) console.log(line);
	}

	if (APPLY) {
		const [items] = await target`
			select count(*)::int n from catalog_items where workspace_id = ${TARGET_WS}
		`;
		const [content] = await target`
			select count(*)::int n from content_entries where workspace_id = ${TARGET_WS}
		`;
		const [cats] = await target`
			select count(*)::int n from catalog_categories where workspace_id = ${TARGET_WS}
		`;
		console.log("\nVerified in target:");
		console.log(`  ${String(items.n).padStart(5)}  catalog_items`);
		console.log(`  ${String(cats.n).padStart(5)}  catalog_categories`);
		console.log(`  ${String(content.n).padStart(5)}  content_entries`);
		const ok =
			items.n >= counts.products &&
			cats.n >= counts.categories &&
			content.n >= counts.contentSlots;
		console.log(
			ok ? "\nPASS" : "\nMISMATCH — investigate before trusting this run",
		);
		if (!ok) process.exitCode = 1;
	}
}

try {
	await main();
} finally {
	await source.end();
	await target.end();
}
