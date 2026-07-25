import { DomainError } from "@quickengine/api-contracts/errors";
import type {
	MutationExecutionContext,
	MutationResult,
	MutationUnitOfWork,
} from "@quickengine/api-contracts/mutations";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	and,
	asc,
	db,
	desc,
	eq,
	gt,
	mutationUnitOfWork,
	webhookDeliveries,
	webhookEndpoints,
} from "@quickengine/db";
import {
	encryptWebhookSecret,
	generateWebhookSecret,
} from "@quickengine/events";
import { z } from "zod";

/**
 * Webhook endpoint management.
 *
 * Endpoints are platform infrastructure rather than a QuickDash module, but their
 * writes still go through the durable command path: registering a destination for
 * a workspace's data is a security-relevant act and belongs in the audit trail.
 */

export type WebhookMutationUnitOfWork = MutationUnitOfWork<DatabaseTransaction>;

const FRIENDLY: Record<string, string> = {
	WEBHOOK_ENDPOINT_NOT_FOUND: "That webhook endpoint was not found.",
	WEBHOOK_DELIVERY_NOT_FOUND: "That webhook delivery was not found.",
	WEBHOOK_URL_INSECURE: "A webhook URL must use https.",
	WEBHOOK_URL_INVALID: "That webhook URL could not be parsed.",
	WEBHOOK_ENDPOINT_LIMIT:
		"This workspace has reached its webhook endpoint limit.",
};

function mapWebhookError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (/_(INSECURE|INVALID)$/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		if (error.message.endsWith("_LIMIT")) {
			throw new DomainError("CONFLICT", message);
		}
	}
	throw error;
}

/** More than this and fan-out stops being cheap; also a sane abuse ceiling. */
const MAX_ENDPOINTS_PER_WORKSPACE = 20;

// http:// is refused outright rather than warned about: the payload carries the
// workspace's business data and the signature does not provide confidentiality.
// localhost is allowed so a developer can point at a tunnel while building.
const webhookUrl = z
	.string()
	.trim()
	.max(2000)
	.superRefine((value, ctx) => {
		let parsed: URL;
		try {
			parsed = new URL(value);
		} catch {
			ctx.addIssue({ code: "custom", message: "WEBHOOK_URL_INVALID" });
			return;
		}
		if (parsed.protocol !== "https:") {
			const local =
				parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
			if (!local) {
				ctx.addIssue({ code: "custom", message: "WEBHOOK_URL_INSECURE" });
			}
		}
	});

export const webhookEndpointInputSchema = z.object({
	url: webhookUrl,
	description: z.string().trim().max(200).nullish(),
	/** Empty means every event. */
	eventTypes: z.array(z.string().trim().min(1).max(120)).max(200).default([]),
});

export const webhookEndpointPatchSchema = z
	.object({
		url: webhookUrl.optional(),
		description: z.string().trim().max(200).nullish(),
		eventTypes: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
		enabled: z.boolean().optional(),
	})
	.refine((patch) => Object.keys(patch).length > 0, {
		message: "At least one field is required.",
	});

export type WebhookEndpointInput = z.input<typeof webhookEndpointInputSchema>;

/**
 * The public shape of an endpoint. **The signing secret is never included** — it
 * is returned exactly once, by `createWebhookEndpointCommand`, and cannot be read
 * back afterwards.
 */
export type WebhookEndpointDto = {
	id: string;
	url: string;
	description: string | null;
	eventTypes: string[];
	enabled: boolean;
	disabledReason: string | null;
	createdAt: string;
	updatedAt: string;
};

const serializeEndpoint = (
	row: typeof webhookEndpoints.$inferSelect,
): WebhookEndpointDto => ({
	id: row.id,
	url: row.url,
	description: row.description,
	eventTypes: row.eventTypes,
	enabled: row.enabled,
	disabledReason: row.disabledReason,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export type WebhookDeliveryDto = {
	id: string;
	endpointId: string;
	eventId: string;
	eventName: string;
	status: string;
	attempts: number;
	responseStatus: number | null;
	responseBody: string | null;
	error: string | null;
	deliveredAt: string | null;
	createdAt: string;
};

const serializeDelivery = (
	row: typeof webhookDeliveries.$inferSelect,
): WebhookDeliveryDto => ({
	id: row.id,
	endpointId: row.endpointId,
	eventId: row.eventId,
	eventName: row.eventName,
	status: row.status,
	attempts: row.attempts,
	responseStatus: row.responseStatus,
	responseBody: row.responseBody,
	error: row.error,
	deliveredAt: row.deliveredAt?.toISOString() ?? null,
	createdAt: row.createdAt.toISOString(),
});

export async function listWebhookEndpoints(
	workspaceId: string,
): Promise<WebhookEndpointDto[]> {
	const rows = await db
		.select()
		.from(webhookEndpoints)
		.where(eq(webhookEndpoints.workspaceId, workspaceId))
		.orderBy(asc(webhookEndpoints.createdAt));
	return rows.map(serializeEndpoint);
}

export async function getWebhookEndpointDto(
	workspaceId: string,
	id: string,
): Promise<WebhookEndpointDto | null> {
	const [row] = await db
		.select()
		.from(webhookEndpoints)
		.where(
			and(
				eq(webhookEndpoints.workspaceId, workspaceId),
				eq(webhookEndpoints.id, id),
			),
		)
		.limit(1);
	return row ? serializeEndpoint(row) : null;
}

/** Delivery history for one endpoint, newest first. */
export async function listWebhookDeliveries(
	workspaceId: string,
	endpointId: string,
	options: { limit?: number; cursor?: string } = {},
): Promise<WebhookDeliveryDto[]> {
	const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
	const rows = await db
		.select()
		.from(webhookDeliveries)
		.where(
			and(
				eq(webhookDeliveries.workspaceId, workspaceId),
				eq(webhookDeliveries.endpointId, endpointId),
				options.cursor
					? gt(webhookDeliveries.createdAt, new Date(options.cursor))
					: undefined,
			),
		)
		.orderBy(desc(webhookDeliveries.createdAt))
		.limit(limit);
	return rows.map(serializeDelivery);
}

/** The endpoint plus its one-time signing secret. */
export type CreatedWebhookEndpoint = WebhookEndpointDto & { secret: string };

export async function createWebhookEndpointCommand(
	context: MutationExecutionContext,
	input: unknown,
	uow: WebhookMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<CreatedWebhookEndpoint>> {
	const values = webhookEndpointInputSchema.parse(input);
	const secret = generateWebhookSecret();

	return uow
		.execute(context, async (transaction) => {
			const existing = await transaction.db
				.select({ id: webhookEndpoints.id })
				.from(webhookEndpoints)
				.where(eq(webhookEndpoints.workspaceId, context.workspaceId));
			if (existing.length >= MAX_ENDPOINTS_PER_WORKSPACE) {
				throw new Error("WEBHOOK_ENDPOINT_LIMIT");
			}

			const [row] = await transaction.db
				.insert(webhookEndpoints)
				.values({
					workspaceId: context.workspaceId,
					url: values.url,
					description: values.description ?? null,
					eventTypes: values.eventTypes,
					secretCiphertext: encryptWebhookSecret(secret),
				})
				.returning();

			await transaction.audit({
				action: "webhook.endpoint.created",
				resourceId: row.id,
				resourceType: "webhook_endpoint",
				// The URL is the security-relevant fact; the secret must never be
				// written to the audit trail, where it would outlive its one showing.
				metadata: { url: row.url },
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "webhook_endpoint",
				eventName: "webhook.endpoint.created",
				payload: { endpointId: row.id },
				version: 1,
			});

			// The only time the secret is ever returned.
			return {
				result: { ...serializeEndpoint(row), secret },
				status: 201,
			};
		})
		.catch(mapWebhookError);
}

export async function updateWebhookEndpointCommand(
	context: MutationExecutionContext,
	id: string,
	input: unknown,
	uow: WebhookMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<WebhookEndpointDto>> {
	const patch = webhookEndpointPatchSchema.parse(input);

	return uow
		.execute(context, async (transaction) => {
			const [row] = await transaction.db
				.update(webhookEndpoints)
				.set({
					...(patch.url === undefined ? {} : { url: patch.url }),
					...(patch.description === undefined
						? {}
						: { description: patch.description ?? null }),
					...(patch.eventTypes === undefined
						? {}
						: { eventTypes: patch.eventTypes }),
					// Re-enabling clears the platform's reason for switching it off, so
					// a stale explanation can't linger on a working endpoint.
					...(patch.enabled === undefined
						? {}
						: {
								enabled: patch.enabled,
								disabledReason: patch.enabled ? null : undefined,
							}),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(webhookEndpoints.workspaceId, context.workspaceId),
						eq(webhookEndpoints.id, id),
					),
				)
				.returning();
			if (!row) throw new Error("WEBHOOK_ENDPOINT_NOT_FOUND");

			await transaction.audit({
				action: "webhook.endpoint.updated",
				resourceId: row.id,
				resourceType: "webhook_endpoint",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "webhook_endpoint",
				eventName: "webhook.endpoint.updated",
				payload: { endpointId: row.id },
				version: 1,
			});
			return { result: serializeEndpoint(row), status: 200 };
		})
		.catch(mapWebhookError);
}

export async function deleteWebhookEndpointCommand(
	context: MutationExecutionContext,
	id: string,
	uow: WebhookMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const [row] = await transaction.db
				.delete(webhookEndpoints)
				.where(
					and(
						eq(webhookEndpoints.workspaceId, context.workspaceId),
						eq(webhookEndpoints.id, id),
					),
				)
				.returning({ id: webhookEndpoints.id });
			if (!row) throw new Error("WEBHOOK_ENDPOINT_NOT_FOUND");

			await transaction.audit({
				action: "webhook.endpoint.deleted",
				resourceId: row.id,
				resourceType: "webhook_endpoint",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "webhook_endpoint",
				eventName: "webhook.endpoint.deleted",
				payload: { endpointId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapWebhookError);
}

/**
 * Queue a delivery to be attempted again.
 *
 * This resets the existing row rather than creating a second one, because the
 * unique (endpoint, event) index is what guarantees a customer never receives an
 * event twice from a single fan-out. The attempt counter carries the history.
 */
export async function replayWebhookDeliveryCommand(
	context: MutationExecutionContext,
	deliveryId: string,
	uow: WebhookMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<WebhookDeliveryDto>> {
	return uow
		.execute(context, async (transaction) => {
			const [row] = await transaction.db
				.update(webhookDeliveries)
				.set({
					status: "pending",
					attempts: 0,
					availableAt: new Date(),
					responseStatus: null,
					responseBody: null,
					error: null,
					deliveredAt: null,
				})
				.where(
					and(
						eq(webhookDeliveries.workspaceId, context.workspaceId),
						eq(webhookDeliveries.id, deliveryId),
					),
				)
				.returning();
			if (!row) throw new Error("WEBHOOK_DELIVERY_NOT_FOUND");

			await transaction.audit({
				action: "webhook.delivery.replayed",
				resourceId: row.id,
				resourceType: "webhook_delivery",
				metadata: { eventId: row.eventId },
			});
			return { result: serializeDelivery(row), status: 202 };
		})
		.catch(mapWebhookError);
}
