import type {
	MutationExecutionContext,
	MutationResult,
	MutationUnitOfWork,
} from "@quickengine/api-contracts/mutations";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	and,
	asc,
	clientAddresses,
	clientRecords,
	db,
	eq,
	gt,
	mutationUnitOfWork,
} from "@quickengine/db";
import { z } from "zod";
import { clientRecordInputSchema, clientRecordPatchSchema } from "./records";

const optionalText = (maximum: number) =>
	z.preprocess(
		(value) =>
			typeof value === "string" && value.trim() === "" ? null : value,
		z.string().trim().max(maximum).nullable().optional(),
	);

export const clientAddressInputSchema = z.object({
	label: optionalText(80),
	line1: z.string().trim().min(1).max(200),
	line2: optionalText(200),
	city: z.string().trim().min(1).max(120),
	region: optionalText(120),
	postalCode: optionalText(40),
	countryCode: z.string().trim().length(2).toUpperCase(),
});
export const clientAddressPatchSchema = clientAddressInputSchema
	.partial()
	.refine((patch) => Object.keys(patch).length > 0, {
		message: "At least one address field is required.",
	});

export const clientListQuerySchema = z.object({
	cursor: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ClientAddressInput = z.input<typeof clientAddressInputSchema>;
export type ClientAddressPatch = z.input<typeof clientAddressPatchSchema>;
export type ClientMutationUnitOfWork = MutationUnitOfWork<DatabaseTransaction>;

export class ClientRecordNotFoundError extends Error {
	constructor(resource: "address" | "client") {
		super(`${resource.toUpperCase()}_NOT_FOUND`);
		this.name = "ClientRecordNotFoundError";
	}
}

const serializeClient = (record: typeof clientRecords.$inferSelect) => ({
	...record,
	createdAt: record.createdAt.toISOString(),
	updatedAt: record.updatedAt.toISOString(),
});

const serializeAddress = (address: typeof clientAddresses.$inferSelect) => ({
	...address,
	createdAt: address.createdAt.toISOString(),
	updatedAt: address.updatedAt.toISOString(),
});

export type ClientRecordDto = ReturnType<typeof serializeClient>;
export type ClientAddressDto = ReturnType<typeof serializeAddress>;

export async function listClientRecordsPage(
	workspaceId: string,
	query: z.input<typeof clientListQuerySchema>,
) {
	const page = clientListQuerySchema.parse(query);
	const where = page.cursor
		? and(
				eq(clientRecords.workspaceId, workspaceId),
				gt(clientRecords.id, page.cursor),
			)
		: eq(clientRecords.workspaceId, workspaceId);
	const rows = await db
		.select()
		.from(clientRecords)
		.where(where)
		.orderBy(asc(clientRecords.id))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeClient),
		page: {
			hasMore,
			nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
		},
	};
}

export async function getClientRecordDto(workspaceId: string, id: string) {
	const [record] = await db
		.select()
		.from(clientRecords)
		.where(
			and(eq(clientRecords.workspaceId, workspaceId), eq(clientRecords.id, id)),
		)
		.limit(1);
	return record ? serializeClient(record) : null;
}

export async function listClientAddresses(
	workspaceId: string,
	clientId: string,
) {
	return (
		await db
			.select()
			.from(clientAddresses)
			.where(
				and(
					eq(clientAddresses.workspaceId, workspaceId),
					eq(clientAddresses.clientId, clientId),
				),
			)
			.orderBy(asc(clientAddresses.id))
	).map(serializeAddress);
}

export async function getClientAddressDto(workspaceId: string, id: string) {
	const [address] = await db
		.select()
		.from(clientAddresses)
		.where(
			and(
				eq(clientAddresses.workspaceId, workspaceId),
				eq(clientAddresses.id, id),
			),
		)
		.limit(1);
	return address ? serializeAddress(address) : null;
}

export function createClientCommand(
	context: MutationExecutionContext,
	input: unknown,
	uow: ClientMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ClientRecordDto>> {
	const values = clientRecordInputSchema.parse(input);
	return uow.execute(context, async (transaction) => {
		const [record] = await transaction.db
			.insert(clientRecords)
			.values({
				company: values.company ?? null,
				email: values.email ?? null,
				fields: values.fields ?? {},
				name: values.name,
				notes: values.notes ?? null,
				phone: values.phone ?? null,
				workspaceId: context.workspaceId,
			})
			.returning();
		await transaction.audit({
			action: "client.created",
			resourceId: record.id,
			resourceType: "client",
		});
		await transaction.outbox({
			aggregateId: record.id,
			aggregateType: "client",
			eventName: "client.created",
			payload: { clientId: record.id },
			version: 1,
		});
		return { result: serializeClient(record), status: 201 };
	});
}

export function updateClientCommand(
	context: MutationExecutionContext,
	id: string,
	patch: unknown,
	uow: ClientMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ClientRecordDto>> {
	const values = clientRecordPatchSchema.parse(patch);
	return uow.execute(context, async (transaction) => {
		const [record] = await transaction.db
			.update(clientRecords)
			.set({ ...values, updatedAt: new Date() })
			.where(
				and(
					eq(clientRecords.workspaceId, context.workspaceId),
					eq(clientRecords.id, id),
				),
			)
			.returning();
		if (!record) throw new ClientRecordNotFoundError("client");
		await transaction.audit({
			action: "client.updated",
			resourceId: record.id,
			resourceType: "client",
		});
		await transaction.outbox({
			aggregateId: record.id,
			aggregateType: "client",
			eventName: "client.updated",
			payload: { clientId: record.id },
			version: 1,
		});
		return { result: serializeClient(record), status: 200 };
	});
}

export function deleteClientCommand(
	context: MutationExecutionContext,
	id: string,
	uow: ClientMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow.execute(context, async (transaction) => {
		const [record] = await transaction.db
			.delete(clientRecords)
			.where(
				and(
					eq(clientRecords.workspaceId, context.workspaceId),
					eq(clientRecords.id, id),
				),
			)
			.returning({ id: clientRecords.id });
		if (!record) throw new ClientRecordNotFoundError("client");
		await transaction.audit({
			action: "client.deleted",
			resourceId: record.id,
			resourceType: "client",
		});
		await transaction.outbox({
			aggregateId: record.id,
			aggregateType: "client",
			eventName: "client.deleted",
			payload: { clientId: record.id },
			version: 1,
		});
		return { result: record, status: 200 };
	});
}

export function createClientAddressCommand(
	context: MutationExecutionContext,
	clientId: string,
	input: unknown,
	uow: ClientMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ClientAddressDto>> {
	const values = clientAddressInputSchema.parse(input);
	return uow.execute(context, async (transaction) => {
		const [client] = await transaction.db
			.select({ id: clientRecords.id })
			.from(clientRecords)
			.where(
				and(
					eq(clientRecords.workspaceId, context.workspaceId),
					eq(clientRecords.id, clientId),
				),
			)
			.limit(1);
		if (!client) throw new ClientRecordNotFoundError("client");
		const [address] = await transaction.db
			.insert(clientAddresses)
			.values({ ...values, clientId, workspaceId: context.workspaceId })
			.returning();
		await transaction.audit({
			action: "client.address.created",
			resourceId: address.id,
			resourceType: "client_address",
		});
		await transaction.outbox({
			aggregateId: clientId,
			aggregateType: "client",
			eventName: "client.address.created",
			payload: { addressId: address.id, clientId },
			version: 1,
		});
		return { result: serializeAddress(address), status: 201 };
	});
}

export function updateClientAddressCommand(
	context: MutationExecutionContext,
	id: string,
	patch: unknown,
	uow: ClientMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ClientAddressDto>> {
	const values = clientAddressPatchSchema.parse(patch);
	return uow.execute(context, async (transaction) => {
		const [address] = await transaction.db
			.update(clientAddresses)
			.set({ ...values, updatedAt: new Date() })
			.where(
				and(
					eq(clientAddresses.workspaceId, context.workspaceId),
					eq(clientAddresses.id, id),
				),
			)
			.returning();
		if (!address) throw new ClientRecordNotFoundError("address");
		await transaction.audit({
			action: "client.address.updated",
			resourceId: address.id,
			resourceType: "client_address",
		});
		await transaction.outbox({
			aggregateId: address.clientId,
			aggregateType: "client",
			eventName: "client.address.updated",
			payload: { addressId: address.id, clientId: address.clientId },
			version: 1,
		});
		return { result: serializeAddress(address), status: 200 };
	});
}

export function deleteClientAddressCommand(
	context: MutationExecutionContext,
	id: string,
	uow: ClientMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow.execute(context, async (transaction) => {
		const [address] = await transaction.db
			.delete(clientAddresses)
			.where(
				and(
					eq(clientAddresses.workspaceId, context.workspaceId),
					eq(clientAddresses.id, id),
				),
			)
			.returning({
				clientId: clientAddresses.clientId,
				id: clientAddresses.id,
			});
		if (!address) throw new ClientRecordNotFoundError("address");
		await transaction.audit({
			action: "client.address.deleted",
			resourceId: address.id,
			resourceType: "client_address",
		});
		await transaction.outbox({
			aggregateId: address.clientId,
			aggregateType: "client",
			eventName: "client.address.deleted",
			payload: { addressId: address.id, clientId: address.clientId },
			version: 1,
		});
		return { result: { id: address.id }, status: 200 };
	});
}
