import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	applyInventoryAdjustmentCommand,
	archiveSupplier,
	connectSupplierPaymentAccount,
	createInventoryItemCommand,
	createSupplier,
	createSupplierSku,
	deleteInventoryItemCommand,
	deleteSupplierSku,
	describeSupplierConnection,
	getInventoryItemDto,
	getSupplierAdapter,
	getSupplierPaymentAccount,
	INVENTORY_ITEM_STATUSES,
	inventorySettingsSchema,
	isAutomatedHandoff,
	listInventoryAdjustmentsPage,
	listInventoryItemsPage,
	listPurchaseOrders,
	listSupplierSkus,
	listSuppliers,
	refreshSupplierPaymentAccount,
	resolveSupplierConnection,
	SupplierAccountError,
	SupplierError,
	saveSupplierConnection,
	setInventoryItemStatusCommand,
	setSupplierConnectionState,
	supplierConnectionCheckSchema,
	supplierConnectionInputSchema,
	supplierInputSchema,
	supplierPatchSchema,
	supplierPayoutOnboardingSchema,
	supplierSkuInputSchema,
	supplierSkuPatchSchema,
	updateInventoryItemCommand,
	updateSupplier,
	updateSupplierSku,
} from "@quickengine/mod-inventory";
import { getWorkspaceModules } from "@quickengine/module-registry";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import { buildMutationContext } from "./mutation-policy";
import { respondMutation } from "./mutation-response";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

const uuid = z.uuid();
const statusSchema = z.object({ status: z.enum(INVENTORY_ITEM_STATUSES) });

async function inventorySettings(workspaceId: string) {
	const module = (await getWorkspaceModules(workspaceId)).find(
		(candidate) => candidate.id === "inventory" && candidate.enabled,
	);
	return inventorySettingsSchema.parse(module?.settings ?? {});
}

export function registerInventoryRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const readAccess = authorizeWorkspace(options.platform, {
		keyCapability: "inventory:read",
		module: "inventory",
		sessionCapability: "workspace.view",
	});
	const writeAccess = authorizeWorkspace(options.platform, {
		keyCapability: "inventory:write",
		module: "inventory",
		sessionCapability: "records.write",
	});
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "inventory.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "inventory.write",
	});

	const mutationContext = async (
		c: Context<PlatformEnv>,
		operation: string,
		canonicalInput: unknown,
	) =>
		buildMutationContext({
			authorized: c.get("authorized"),
			abortSignal: c.get("abortSignal"),
			canonicalInput,
			deadlineAtMs: c.get("deadlineAtMs"),
			idempotencyKey: c.req.header(API_HEADERS.idempotencyKey),
			operation,
			requestId: c.get("requestId"),
		});

	app.get("/v1/inventory", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listInventoryItemsPage(c.get("authorized").workspaceId, {
				cursor: c.req.query("cursor"),
				direction: c.req.query("direction"),
				sort: c.req.query("sort"),
				limit: c.req.query("limit"),
				status: c.req.query("status"),
			}),
		),
	);
	app.post("/v1/inventory", writeAccess, writeLimit, async (c) => {
		const body = await c.req.json();
		const context = await mutationContext(c, "inventory.create", body);
		return respondMutation(
			c,
			await createInventoryItemCommand(context, body, options.uow),
		);
	});
	/**
	 * 🔴 Registered BEFORE `/v1/inventory/:id`, and it must stay there.
	 *
	 * Hono matches in registration order, so with `:id` first a request for
	 * `/v1/inventory/suppliers` is captured as a stock record whose id is the
	 * word "suppliers", `uuid.parse` throws, and the page fails with a 400 that
	 * says nothing about routing. This is the same fault PR #419 fixed when
	 * `/v1/payments/connect` was captured as a payment uuid.
	 *
	 * ⚠️ Any future literal segment under `/v1/inventory` belongs above the
	 * parameterised routes too.
	 */
	/* ── Suppliers ─────────────────────────────────────────────────────────────
	 *
	 * 🔑 Under Inventory, and gated by the SAME module and capabilities. A
	 * business that can see its stock can see who supplies it; there is no
	 * separate thing to buy and no separate permission to forget to grant.
	 */

	const supplierError = (c: Context<PlatformEnv>, error: unknown) => {
		if (!(error instanceof SupplierError)) throw error;
		if (error.code === "SUPPLIER_SKU_EXISTS") {
			return respondError(
				c,
				"CONFLICT",
				"That product is already mapped to this supplier.",
				409,
			);
		}
		return respondError(c, "NOT_FOUND", "Supplier record not found.", 404);
	};

	/* ── Purchase orders ───────────────────────────────────────────────────────
	 *
	 * 🔑 Read-only here on purpose. A purchase order is RAISED by `order.paid`,
	 * never by hand — inventing one would ask a supplier for goods nobody bought.
	 * What an operator needs is to SEE them, which until now was possible only
	 * through the database.
	 */
	app.get("/v1/inventory/purchase-orders", readAccess, readLimit, async (c) =>
		respond(c, {
			items: await listPurchaseOrders(c.get("authorized").workspaceId),
		}),
	);

	/* ── Supplier connections ──────────────────────────────────────────────────
	 *
	 * 🔴 The credential never comes back out. `describeSupplierConnection`
	 * answers whether one is present, which shop it points at and whether it
	 * last worked — never the token. A screen that could show it would turn a
	 * session hijack into write access to the business's own store.
	 */
	const connectionQuery = supplierConnectionCheckSchema;

	app.get(
		"/v1/inventory/supplier-connections",
		readAccess,
		readLimit,
		async (c) => {
			const query = connectionQuery.parse({
				supplierId: c.req.query("supplierId"),
				provider: c.req.query("provider") ?? "shopify",
			});
			return respond(
				c,
				await describeSupplierConnection({
					workspaceId: c.get("authorized").workspaceId,
					...query,
				}),
			);
		},
	);

	app.post(
		"/v1/inventory/supplier-connections",
		writeAccess,
		writeLimit,
		async (c) => {
			const body = supplierConnectionInputSchema.parse(await c.req.json());

			const { supplierId, provider, ...credentials } = body;
			const saved = await saveSupplierConnection({
				workspaceId: c.get("authorized").workspaceId,
				supplierId,
				provider,
				credentials,
			});
			// Lands `pending`: nothing has proven the token works yet, and calling it
			// active before anything has spoken to the provider is how a broken
			// connection looks healthy on a settings screen.
			return respond(c, { id: saved?.id ?? null, status: "pending" }, 201);
		},
	);

	/**
	 * Verify a connection and every product mapped through it.
	 *
	 * 🔑 The whole point of this route. It resolves each mapped SKU against the
	 * supplier's system and reports the ones it does not recognise BY NAME. An
	 * unresolvable mapping found here is a typo somebody fixes in ten seconds;
	 * the same typo found when an order arrives is a paying customer waiting for
	 * coffee that was never ordered.
	 */
	app.post(
		"/v1/inventory/supplier-connections/check",
		writeAccess,
		writeLimit,
		async (c) => {
			const workspaceId = c.get("authorized").workspaceId;
			const body = connectionQuery.parse(await c.req.json());
			if (!isAutomatedHandoff(body.provider)) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"That handoff method is not one QuickDash connects to.",
					400,
				);
			}

			/**
			 * 🔴 `allowUnverified`, because this route is what does the verifying.
			 *
			 * A connection is stored `pending` until something proves the token
			 * works, and every other caller refuses `pending` for that reason. If
			 * this one did too, a saved connection could never be checked, never
			 * become active, and never be used at all.
			 */
			const connection = await resolveSupplierConnection({
				workspaceId,
				...body,
				allowUnverified: true,
			});
			if (!connection) {
				return respondError(
					c,
					"NOT_FOUND",
					"That supplier is not connected yet.",
					404,
				);
			}

			const mapped = (await listSupplierSkus(workspaceId))
				.filter((sku) => sku.supplierId === body.supplierId)
				.map((sku) => sku.supplierSku);

			const result = await getSupplierAdapter(body.provider).checkConnection(
				connection,
				mapped,
			);
			// Recorded so the settings screen can say "last checked" without
			// hitting the provider again on every page load.
			await setSupplierConnectionState({
				workspaceId,
				...body,
				ok: result.ok,
				error: result.reason ?? null,
			});
			return respond(c, result);
		},
	);

	app.get("/v1/inventory/suppliers", readAccess, readLimit, async (c) =>
		respond(c, {
			items: await listSuppliers(c.get("authorized").workspaceId),
		}),
	);
	app.post("/v1/inventory/suppliers", writeAccess, writeLimit, async (c) =>
		respond(
			c,
			await createSupplier(
				c.get("authorized").workspaceId,
				supplierInputSchema.parse(await c.req.json()),
			),
			201,
		),
	);
	app.patch(
		"/v1/inventory/suppliers/:id",
		writeAccess,
		writeLimit,
		async (c) => {
			try {
				return respond(
					c,
					await updateSupplier(
						c.get("authorized").workspaceId,
						uuid.parse(c.req.param("id")),
						supplierPatchSchema.parse(await c.req.json()),
					),
				);
			} catch (error) {
				return supplierError(c, error);
			}
		},
	);
	app.delete(
		"/v1/inventory/suppliers/:id",
		writeAccess,
		writeLimit,
		async (c) => {
			try {
				return respond(
					c,
					await archiveSupplier(
						c.get("authorized").workspaceId,
						uuid.parse(c.req.param("id")),
					),
				);
			} catch (error) {
				return supplierError(c, error);
			}
		},
	);

	/* ── Paying a supplier ─────────────────────────────────────────────────────
	 *
	 * 🔴 Without a connected account, settlement answers SUPPLIER_NOT_ONBOARDED
	 * for ever and a supplier can never be paid automatically however complete
	 * the rest of the rail is. This is the only thing that writes that record.
	 *
	 * 🔑 Onboarding is STRIPE-HOSTED. The supplier verifies their identity with
	 * Stripe directly and their bank details, tax id and documents never pass
	 * through QuickEngine, so no screen here has to collect or store any of it.
	 */
	const supplierAccountError = (c: Context<PlatformEnv>, error: unknown) => {
		if (!(error instanceof SupplierAccountError)) throw error;
		if (error.code === "NOT_CONNECTED") {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"This supplier has not started connecting a payout account yet.",
				409,
			);
		}
		return respondError(c, "NOT_FOUND", "Supplier record not found.", 404);
	};

	app.get(
		"/v1/inventory/suppliers/:id/payment-account",
		readAccess,
		readLimit,
		async (c) => {
			try {
				const workspaceId = c.get("authorized").workspaceId;
				const supplierId = uuid.parse(c.req.param("id"));
				// `refresh=1` asks the provider rather than trusting our stored copy:
				// onboarding finishes in Stripe's UI and nothing tells us when.
				if (c.req.query("refresh") === "1") {
					const { readSupplierAccount } = await import(
						"@quickengine/mod-payments"
					);
					return respond(
						c,
						await refreshSupplierPaymentAccount(
							workspaceId,
							supplierId,
							readSupplierAccount,
						),
					);
				}
				return respond(c, {
					account: await getSupplierPaymentAccount(workspaceId, supplierId),
				});
			} catch (error) {
				return supplierAccountError(c, error);
			}
		},
	);

	app.post(
		"/v1/inventory/suppliers/:id/payment-account",
		writeAccess,
		writeLimit,
		async (c) => {
			try {
				const body = supplierPayoutOnboardingSchema.parse(await c.req.json());
				const { startSupplierOnboarding } = await import(
					"@quickengine/mod-payments"
				);
				return respond(
					c,
					await connectSupplierPaymentAccount({
						workspaceId: c.get("authorized").workspaceId,
						supplierId: uuid.parse(c.req.param("id")),
						refreshUrl: body.refreshUrl,
						returnUrl: body.returnUrl,
						country: body.country ?? null,
						onboard: startSupplierOnboarding,
					}),
					201,
				);
			} catch (error) {
				return supplierAccountError(c, error);
			}
		},
	);

	app.get("/v1/inventory/supplier-skus", readAccess, readLimit, async (c) => {
		const supplierId = c.req.query("supplierId");
		return respond(c, {
			items: await listSupplierSkus(
				c.get("authorized").workspaceId,
				supplierId ? uuid.parse(supplierId) : undefined,
			),
		});
	});
	app.post(
		"/v1/inventory/supplier-skus",
		writeAccess,
		writeLimit,
		async (c) => {
			try {
				return respond(
					c,
					await createSupplierSku(
						c.get("authorized").workspaceId,
						supplierSkuInputSchema.parse(await c.req.json()),
					),
					201,
				);
			} catch (error) {
				return supplierError(c, error);
			}
		},
	);
	app.patch(
		"/v1/inventory/supplier-skus/:id",
		writeAccess,
		writeLimit,
		async (c) => {
			try {
				return respond(
					c,
					await updateSupplierSku(
						c.get("authorized").workspaceId,
						uuid.parse(c.req.param("id")),
						supplierSkuPatchSchema.parse(await c.req.json()),
					),
				);
			} catch (error) {
				return supplierError(c, error);
			}
		},
	);
	app.delete(
		"/v1/inventory/supplier-skus/:id",
		writeAccess,
		writeLimit,
		async (c) => {
			try {
				return respond(
					c,
					await deleteSupplierSku(
						c.get("authorized").workspaceId,
						uuid.parse(c.req.param("id")),
					),
				);
			} catch (error) {
				return supplierError(c, error);
			}
		},
	);

	app.get("/v1/inventory/:id", readAccess, readLimit, async (c) => {
		const item = await getInventoryItemDto(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return item
			? respond(c, item)
			: respondError(c, "NOT_FOUND", "The stock record was not found.", 404);
	});
	app.patch("/v1/inventory/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const body = await c.req.json();
		const context = await mutationContext(c, "inventory.update", { body, id });
		return respondMutation(
			c,
			await updateInventoryItemCommand(context, id, body, options.uow),
		);
	});
	app.post("/v1/inventory/:id/status", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const { status } = statusSchema.parse(await c.req.json());
		const context = await mutationContext(c, "inventory.set-status", {
			id,
			status,
		});
		return respondMutation(
			c,
			await setInventoryItemStatusCommand(context, id, status, options.uow),
		);
	});
	app.get("/v1/inventory/:id/adjustments", readAccess, readLimit, async (c) =>
		respond(
			c,
			await listInventoryAdjustmentsPage(
				c.get("authorized").workspaceId,
				uuid.parse(c.req.param("id")),
				{ limit: c.req.query("limit") },
			),
		),
	);
	app.post(
		"/v1/inventory/:id/adjustments",
		writeAccess,
		writeLimit,
		async (c) => {
			const id = uuid.parse(c.req.param("id"));
			const body = await c.req.json();
			const settings = await inventorySettings(c.get("authorized").workspaceId);
			const context = await mutationContext(c, "inventory.adjust", {
				body,
				id,
			});
			return respondMutation(
				c,
				await applyInventoryAdjustmentCommand(
					context,
					id,
					body,
					{ allowNegativeStock: settings.allowNegativeStock },
					options.uow,
				),
			);
		},
	);
	app.delete("/v1/inventory/:id", writeAccess, writeLimit, async (c) => {
		const id = uuid.parse(c.req.param("id"));
		const context = await mutationContext(c, "inventory.delete", { id });
		return respondMutation(
			c,
			await deleteInventoryItemCommand(context, id, options.uow),
		);
	});
}
