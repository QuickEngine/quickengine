import { DomainError } from "@quickengine/api-contracts/errors";
import type {
	MutationExecutionContext,
	MutationResult,
	MutationUnitOfWork,
} from "@quickengine/api-contracts/mutations";
import type { DatabaseTransaction, SortMap } from "@quickengine/db";
import {
	afterCursor,
	and,
	asc,
	contractSigners,
	contracts,
	db,
	decodeCursor,
	eq,
	mutationUnitOfWork,
	pageOrder,
	resolveSort,
} from "@quickengine/db";
import { z } from "zod";
import type { ContractInput } from "./contract";
import {
	type CreateContractInput,
	createContractInTx,
	deleteDraftContractInTx,
	expireContractInTx,
	reviseContractInTx,
	sendContractInTx,
	updateDraftContractInTx,
	voidContractInTx,
} from "./records";
import { CONTRACT_STATUSES } from "./status";

export type ContractMutationUnitOfWork =
	MutationUnitOfWork<DatabaseTransaction>;

/**
 * What an operator would order this list by.
 *
 * An allowlist, never a column name from the request: an arbitrary column
 * would let a caller sort by fields the DTO never exposes and read their
 * values off the ordering.
 */
const CONTRACT_SORTS = {
	number: contracts.number,
	title: contracts.title,
	status: contracts.status,
	sentAt: contracts.sentAt,
	createdAt: contracts.createdAt,
	updatedAt: contracts.updatedAt,
} as const satisfies SortMap;

export const contractListQuerySchema = z.object({
	// Opaque now: it encodes (sortValue, id), so it is no longer a bare uuid.
	cursor: z.string().trim().min(1).optional(),
	direction: z.enum(["asc", "desc"]).default("desc"),
	sort: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	clientId: z.uuid().optional(),
	status: z.enum(CONTRACT_STATUSES).optional(),
});

const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	CLIENT_NOT_FOUND: "The client on this contract was not found.",
	CLIENT_WORKSPACE_MISMATCH: "That client belongs to another workspace.",

	CONTRACT_NOT_FOUND: "The contract was not found.",
	CONTRACT_NOT_EDITABLE: "Only a draft contract can be edited.",
	CONTRACT_NOT_SENDABLE: "This contract can't be sent from its current status.",
	CONTRACT_NOT_VOIDABLE:
		"This contract can't be voided from its current status.",
	CONTRACT_NOT_EXPIRABLE:
		"This contract can't be expired from its current status.",
	CONTRACT_NOT_EXPIRED: "This contract hasn't expired.",
	CONTRACT_NOT_REVISABLE:
		"This contract can't be revised from its current status.",
	CONTRACT_NOT_DELETABLE: "Only a draft contract can be deleted.",
	CONTRACT_REQUIRES_SIGNERS: "Add at least one signer before sending.",
	CONTRACT_EXPIRY_INVALID: "Check the expiry date on this contract.",
	CONTRACT_SEQUENCE_INVALID: "Check the signing order on this contract.",
	CONTRACT_REVISION_INVALID: "That revision is not valid.",
	CONTRACT_REVISION_SOURCE_INVALID:
		"The contract being revised is no longer a valid source.",
	CONTRACT_CONCURRENT_UPDATE:
		"The contract changed while this update was in flight. Try again.",

	FILE_DOCUMENT_UNAVAILABLE:
		"The document attached to this contract isn't available.",
	FILE_VERSION_NOT_FOUND:
		"The document version on this contract was not found.",
	FILE_VERSION_NOT_AVAILABLE:
		"The document version on this contract isn't ready yet.",
	FILE_VERSION_WORKSPACE_MISMATCH:
		"That document version belongs to another workspace.",

	// Token failures belong to the public signing route, never to a workspace API caller.
	SIGNING_TOKEN_INVALID: "That signing link isn't valid.",
	SIGNING_TOKEN_EXPIRED: "That signing link has expired.",
	SIGNING_TOKEN_USED: "That signing link has already been used.",
};

function mapContractError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (/(MISMATCH|_INVALID)/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		if (
			/(NOT_EDITABLE|NOT_SENDABLE|NOT_VOIDABLE|NOT_EXPIRABLE|NOT_EXPIRED|NOT_REVISABLE|NOT_DELETABLE|REQUIRES_SIGNERS|CONCURRENT_UPDATE|UNAVAILABLE|NOT_AVAILABLE|TOKEN_EXPIRED|TOKEN_USED)/.test(
				error.message,
			)
		) {
			throw new DomainError("CONFLICT", message);
		}
	}
	throw error;
}

function serializeDates<T extends Record<string, unknown>>(
	row: T,
): { [K in keyof T]: T[K] extends Date ? string : T[K] } {
	return Object.fromEntries(
		Object.entries(row).map(([key, value]) => [
			key,
			value instanceof Date ? value.toISOString() : value,
		]),
	) as { [K in keyof T]: T[K] extends Date ? string : T[K] };
}

const serializeContract = (row: typeof contracts.$inferSelect) =>
	serializeDates(row);

/**
 * Signers are returned without their token material. `tokenHash` authenticates the public
 * `/sign/[token]` page and must never reach a workspace API response, a log, an audit record,
 * or an outbox payload.
 */
const serializeSigner = ({
	tokenHash: _tokenHash,
	...safe
}: typeof contractSigners.$inferSelect) => serializeDates(safe);

export type ContractDto = ReturnType<typeof serializeContract>;

export async function listContractsPage(
	workspaceId: string,
	query: {
		cursor?: string;
		direction?: string;
		limit?: number | string;
		sort?: string;
		clientId?: string;
		status?: string;
	},
) {
	const page = contractListQuerySchema.parse(query);
	// Newest first by default: a list ordered by id is effectively random
	// to the person reading it.
	const sort = resolveSort(CONTRACT_SORTS, page.sort, "createdAt");
	const where = and(
		eq(contracts.workspaceId, workspaceId),
		afterCursor(
			sort.column,
			contracts.id,
			decodeCursor(page.cursor),
			page.direction,
		),
		page.clientId ? eq(contracts.clientId, page.clientId) : undefined,
		page.status ? eq(contracts.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(contracts)
		.where(where)
		.orderBy(...pageOrder(sort.column, contracts.id, page.direction))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeContract),
		page: { hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
	};
}

export async function getContractDto(workspaceId: string, id: string) {
	const [contract] = await db
		.select()
		.from(contracts)
		.where(and(eq(contracts.workspaceId, workspaceId), eq(contracts.id, id)))
		.limit(1);
	if (!contract) return null;
	const signers = await db
		.select()
		.from(contractSigners)
		.where(eq(contractSigners.contractId, id))
		.orderBy(asc(contractSigners.position));
	return {
		...serializeContract(contract),
		signers: signers.map(serializeSigner),
	};
}

/** Shared shape: run the InTx helper, then audit + outbox inside the same transaction. */
function contractCommand(
	context: MutationExecutionContext,
	uow: ContractMutationUnitOfWork,
	action: string,
	status: number,
	run: (tx: DatabaseTransaction) => Promise<typeof contracts.$inferSelect>,
	metadata?: Record<string, string>,
): Promise<MutationResult<ContractDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await run(transaction.db);
			await transaction.audit({
				action,
				...(metadata ? { metadata } : {}),
				resourceId: row.id,
				resourceType: "contract",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "contract",
				eventName: action,
				// Deliberately no signer tokens or signing links in the payload.
				payload: { contractId: row.id, status: row.status },
				version: 1,
			});
			return { result: serializeContract(row), status };
		})
		.catch(mapContractError);
}

export function createContractCommand(
	context: MutationExecutionContext,
	input: CreateContractInput,
	uow: ContractMutationUnitOfWork = mutationUnitOfWork,
) {
	return contractCommand(context, uow, "contract.created", 201, (tx) =>
		createContractInTx(tx, context.workspaceId, input),
	);
}

export function updateDraftContractCommand(
	context: MutationExecutionContext,
	id: string,
	input: ContractInput,
	uow: ContractMutationUnitOfWork = mutationUnitOfWork,
) {
	return contractCommand(context, uow, "contract.updated", 200, (tx) =>
		updateDraftContractInTx(tx, context.workspaceId, id, input),
	);
}

/**
 * Send a contract, minting a signing link per signer.
 *
 * **The raw signing tokens are deliberately dropped before this returns.** A durable command's
 * result is persisted in `api_mutations` so a retry can replay it, so anything returned here is
 * written to the database in plaintext and handed back on every replay. Signing tokens are
 * credentials for the public `/sign/[token]` page, so they must never enter that record — nor the
 * audit trail, the outbox, or any log. Only non-secret invitation metadata comes back; delivering
 * the actual links is an out-of-band concern (email) belonging outside this transaction.
 */
export function sendContractCommand(
	context: MutationExecutionContext,
	id: string,
	options: Parameters<typeof sendContractInTx>[3] = {},
	uow: ContractMutationUnitOfWork = mutationUnitOfWork,
): Promise<
	MutationResult<
		ContractDto & {
			invitations: Array<{
				signerId: string;
				name: string;
				email: string;
				expiresAt: string;
			}>;
		}
	>
> {
	return uow
		.execute(context, async (transaction) => {
			const { contract, invitations } = await sendContractInTx(
				transaction.db,
				context.workspaceId,
				id,
				options,
			);
			await transaction.audit({
				action: "contract.sent",
				metadata: { signerCount: String(invitations.length) },
				resourceId: contract.id,
				resourceType: "contract",
			});
			await transaction.outbox({
				aggregateId: contract.id,
				aggregateType: "contract",
				eventName: "contract.sent",
				payload: {
					contractId: contract.id,
					signerCount: invitations.length,
					status: contract.status,
				},
				version: 1,
			});
			return {
				result: {
					...serializeContract(contract),
					// `token` is intentionally omitted — see the note above.
					invitations: invitations.map(
						({ signerId, name, email, expiresAt }) => ({
							signerId,
							name,
							email,
							expiresAt: expiresAt.toISOString(),
						}),
					),
				},
				status: 200,
			};
		})
		.catch(mapContractError);
}

export function expireContractCommand(
	context: MutationExecutionContext,
	id: string,
	options: { now?: Date } = {},
	uow: ContractMutationUnitOfWork = mutationUnitOfWork,
) {
	return contractCommand(context, uow, "contract.expired", 200, (tx) =>
		expireContractInTx(tx, context.workspaceId, id, options),
	);
}

export function voidContractCommand(
	context: MutationExecutionContext,
	id: string,
	options: { now?: Date } = {},
	uow: ContractMutationUnitOfWork = mutationUnitOfWork,
) {
	return contractCommand(context, uow, "contract.voided", 200, (tx) =>
		voidContractInTx(tx, context.workspaceId, id, options),
	);
}

/** Supersedes the source contract and returns the new revision. */
export function reviseContractCommand(
	context: MutationExecutionContext,
	id: string,
	uow: ContractMutationUnitOfWork = mutationUnitOfWork,
) {
	return contractCommand(context, uow, "contract.revised", 201, (tx) =>
		reviseContractInTx(tx, context.workspaceId, id),
	);
}

export function deleteDraftContractCommand(
	context: MutationExecutionContext,
	id: string,
	uow: ContractMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteDraftContractInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "contract.deleted",
				resourceId: row.id,
				resourceType: "contract",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "contract",
				eventName: "contract.deleted",
				payload: { contractId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapContractError);
}
