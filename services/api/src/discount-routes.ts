import {
	createDiscount,
	deleteDiscount,
	discountInputSchema,
	discountPreviewInputSchema,
	evaluateDiscount,
	listDiscounts,
	priceCheckout,
	updateDiscount,
} from "@quickengine/mod-orders";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

const uuid = z.uuid();

/**
 * A storefront asking "is this code any good, and what would it save me?"
 *
 * 🔴 Takes the CART, not a subtotal. The old prototype's equivalent accepted
 * `{ code, subtotal }` from the browser, which lets anyone claim a £10,000 order
 * to clear a minimum-spend threshold, or compute a percentage against a number
 * they invented. Here the server prices the same items it would price at
 * checkout, so the preview and the real thing cannot disagree.
 */
const previewSchema = discountPreviewInputSchema;

export function registerDiscountRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const storefront = authorizeWorkspace(options.platform, {
		// Same capability the checkout uses — a site that may check out may ask
		// what a code is worth first.
		keyCapability: "checkout:write",
		module: "orders",
		sessionCapability: "records.write",
	});
	const read = authorizeWorkspace(options.platform, {
		keyCapability: "orders:read",
		module: "orders",
		sessionCapability: "workspace.view",
	});
	const write = authorizeWorkspace(options.platform, {
		keyCapability: "orders:write",
		module: "orders",
		sessionCapability: "records.write",
	});

	app.post("/v1/discounts/preview", storefront, async (c) => {
		const parsed = previewSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Send a code and the items in the basket.",
				400,
				parsed.error.issues,
			);
		}

		const { workspaceId } = c.get("authorized");
		const priced = await priceCheckout(workspaceId, parsed.data.items).catch(
			() => null,
		);
		if (!priced) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"One of those items is not available.",
				400,
			);
		}

		const result = await evaluateDiscount({
			workspaceId,
			code: parsed.data.code,
			subtotalCents: priced.subtotalCents,
		});

		// 200 either way. "Your code has expired" is a normal answer to a normal
		// question, not an error — and a storefront showing a red banner for an HTTP
		// failure would look broken rather than informative.
		return respond(
			c,
			result.ok
				? {
						valid: true,
						code: result.code,
						subtotalCents: priced.subtotalCents,
						discountCents: result.amountCents,
						totalAfterDiscountCents: priced.subtotalCents - result.amountCents,
						currency: priced.currency,
					}
				: { valid: false, reason: result.reason, message: result.message },
		);
	});

	// ── Operator management ─────────────────────────────────────────────────

	app.get("/v1/discounts", read, async (c) =>
		respond(c, { items: await listDiscounts(c.get("authorized").workspaceId) }),
	);

	app.post("/v1/discounts", write, async (c) => {
		const parsed = discountInputSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That discount could not be read.",
				400,
				parsed.error.issues,
			);
		}
		try {
			return respond(
				c,
				await createDiscount(c.get("authorized").workspaceId, parsed.data),
				201,
			);
		} catch (error) {
			return mapDiscountError(c, error);
		}
	});

	app.patch("/v1/discounts/:id", write, async (c) => {
		const parsed = discountInputSchema
			.partial()
			.safeParse(await c.req.json().catch(() => ({})));
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That discount could not be read.",
				400,
				parsed.error.issues,
			);
		}
		try {
			const row = await updateDiscount(
				c.get("authorized").workspaceId,
				uuid.parse(c.req.param("id")),
				parsed.data,
			);
			return row
				? respond(c, row)
				: respondError(c, "NOT_FOUND", "No such discount.", 404);
		} catch (error) {
			return mapDiscountError(c, error);
		}
	});

	app.delete("/v1/discounts/:id", write, async (c) => {
		const removed = await deleteDiscount(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return removed
			? respond(c, { deleted: true })
			: respondError(c, "NOT_FOUND", "No such discount.", 404);
	});
}

function mapDiscountError(
	c: Parameters<typeof respondError>[0],
	error: unknown,
) {
	if (error instanceof Error) {
		if (error.message === "DISCOUNT_WINDOW_INVALID") {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That discount ends before it starts.",
				400,
			);
		}
		// Unique violation on (workspace, code) — Drizzle wraps driver errors, so
		// match the SQLSTATE on the cause chain rather than the message. See
		// DB_RULES.
		for (
			let cause: unknown = error, depth = 0;
			cause && depth < 5;
			depth += 1
		) {
			if ((cause as { code?: string }).code === "23505") {
				return respondError(
					c,
					"CONFLICT",
					"You already have a discount with that code.",
					409,
				);
			}
			cause = (cause as { cause?: unknown }).cause;
		}
	}
	throw error;
}
