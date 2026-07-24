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
	eq,
	gt,
	gte,
	lte,
	mutationUnitOfWork,
	timeEntries,
} from "@quickengine/db";
import { z } from "zod";
import type { BillingRoundingMode } from "./billing";
import {
	approveTimeEntryInTx,
	createManualTimeEntryInTx,
	deleteTimeEntryInTx,
	detachTimeEntriesFromDraftInvoiceInTx,
	invoiceApprovedTimeEntriesInTx,
	isRunningTimerConstraint,
	restoreVoidedTimeEntryInTx,
	startTimerInTx,
	stopTimeEntryTimerInTx,
	unapproveTimeEntryInTx,
	updateManualTimeEntryInTx,
	updateTimeEntryDetailsInTx,
	voidTimeEntryInTx,
} from "./records";
import {
	type ManualTimeEntryInput,
	TIME_ENTRY_STATUSES,
	type TimeEntryDetailsInput,
	type TimerStartInput,
} from "./time-entry";

export type TimeMutationUnitOfWork = MutationUnitOfWork<DatabaseTransaction>;

export const timeEntryListQuerySchema = z.object({
	cursor: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	projectId: z.uuid().optional(),
	taskId: z.uuid().optional(),
	trackerKey: z.string().trim().min(1).max(200).optional(),
	status: z.enum(TIME_ENTRY_STATUSES).optional(),
	/** Inclusive window on the entry's start time. */
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
});

const FRIENDLY: Record<string, string> = {
	PROJECT_NOT_FOUND: "The project on this entry was not found.",
	PROJECT_WORKSPACE_MISMATCH: "That project belongs to another workspace.",
	PROJECT_ARCHIVED: "That project is archived and can't take new time.",
	PROJECT_CLOSED: "That project is closed and can't take new time.",
	TASK_NOT_FOUND: "The task on this entry was not found.",
	TASK_WORKSPACE_MISMATCH: "That task belongs to another workspace.",
	TASK_PROJECT_MISMATCH: "That task belongs to a different project.",
	INVOICE_NOT_FOUND: "The invoice was not found.",
	INVOICE_NOT_EDITABLE: "Only a draft invoice can be changed.",

	TIMER_ALREADY_RUNNING:
		"A timer is already running for this tracker. Stop it before starting another.",
	TIMER_START_IN_FUTURE: "A timer can't start in the future.",
	TIMER_END_MUST_FOLLOW_START: "The end time must come after the start time.",
	TIME_ENTRY_NOT_RUNNING: "That entry doesn't have a running timer.",
	TIME_ENTRY_TIMER_INVALID: "The timer on this entry is not in a usable state.",
	TIME_ENTRY_OVERLAP: "That time overlaps another entry on the same tracker.",

	TIME_ENTRY_NOT_FOUND: "The time entry was not found.",
	TIME_ENTRY_NOT_EDITABLE: "This entry can no longer be edited.",
	TIME_ENTRY_NOT_DELETABLE: "This entry can no longer be deleted.",
	TIME_ENTRY_NOT_APPROVABLE: "This entry can't be approved from its status.",
	TIME_ENTRY_NOT_UNAPPROVABLE:
		"This entry can't be unapproved from its status.",
	TIME_ENTRY_NOT_VOIDABLE: "This entry can't be voided from its status.",
	TIME_ENTRY_NOT_RESTORABLE: "Only a voided entry can be restored.",
	TIME_ENTRY_NOT_APPROVED: "Only approved time can be invoiced.",
	TIME_ENTRY_NOT_BILLABLE: "Only billable time can be invoiced.",
	TIME_ENTRY_ALREADY_INVOICED: "That time is already on an invoice.",
	TIME_ENTRY_ATTACHED_TO_INVOICE:
		"Detach this entry from its invoice before changing it.",
	TIME_ENTRY_INVOICE_MISMATCH: "That entry belongs to a different invoice.",
	TIME_ENTRY_CLIENT_MISMATCH:
		"All invoiced time must belong to the invoice's client.",
	TIME_ENTRY_CURRENCY_MISMATCH:
		"All invoiced time must share the invoice's currency.",
	TIME_ENTRY_DURATION_REQUIRED: "This entry needs a duration first.",
	TIME_ENTRY_DURATION_EXCEEDED: "That duration is too large.",
	TIME_ENTRY_AMOUNT_EXCEEDED: "That billable amount is too large.",
	TIME_ENTRY_IDS_REQUIRED: "Choose at least one time entry.",
	TIME_ENTRY_BATCH_TOO_LARGE: "That's too many entries in one request.",
	TIME_ENTRY_CONCURRENT_UPDATE:
		"Some of that time changed while this ran. Try again.",
	INVALID_TIME_ENTRY_DURATION: "Check the entry's duration.",
	INVALID_HOURLY_RATE: "Check the hourly rate.",
	INVALID_BILLING_INCREMENT: "Check the billing increment.",
};

function mapTimeError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	// A running-timer collision is a unique-index violation, not a coded throw: inside a unit of
	// work it aborts the transaction and arrives here raw, so translate it before anything else.
	if (isRunningTimerConstraint(error)) {
		throw new DomainError("CONFLICT", FRIENDLY.TIMER_ALREADY_RUNNING);
	}
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (
			/(MISMATCH|IDS_REQUIRED|BATCH_TOO_LARGE|^INVALID_|START_IN_FUTURE|END_MUST_FOLLOW_START)/.test(
				error.message,
			)
		) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		if (
			/(ALREADY_RUNNING|ARCHIVED|CLOSED|NOT_EDITABLE|NOT_DELETABLE|NOT_APPROVABLE|NOT_UNAPPROVABLE|NOT_VOIDABLE|NOT_RESTORABLE|NOT_APPROVED|NOT_BILLABLE|ALREADY_INVOICED|ATTACHED_TO_INVOICE|NOT_RUNNING|TIMER_INVALID|OVERLAP|DURATION_REQUIRED|DURATION_EXCEEDED|AMOUNT_EXCEEDED|CONCURRENT_UPDATE)/.test(
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

const serializeEntry = (row: typeof timeEntries.$inferSelect) =>
	serializeDates(row);

export type TimeEntryDto = ReturnType<typeof serializeEntry>;

export async function listTimeEntriesPage(
	workspaceId: string,
	query: {
		cursor?: string;
		limit?: number | string;
		projectId?: string;
		taskId?: string;
		trackerKey?: string;
		status?: string;
		from?: string | Date;
		to?: string | Date;
	},
) {
	const page = timeEntryListQuerySchema.parse(query);
	const where = and(
		eq(timeEntries.workspaceId, workspaceId),
		page.cursor ? gt(timeEntries.id, page.cursor) : undefined,
		page.projectId ? eq(timeEntries.projectId, page.projectId) : undefined,
		page.taskId ? eq(timeEntries.taskId, page.taskId) : undefined,
		page.trackerKey ? eq(timeEntries.trackerKey, page.trackerKey) : undefined,
		page.status ? eq(timeEntries.status, page.status) : undefined,
		page.from ? gte(timeEntries.startedAt, page.from) : undefined,
		page.to ? lte(timeEntries.startedAt, page.to) : undefined,
	);
	const rows = await db
		.select()
		.from(timeEntries)
		.where(where)
		.orderBy(asc(timeEntries.id))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeEntry),
		page: { hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
	};
}

export async function getTimeEntryDto(workspaceId: string, id: string) {
	const [entry] = await db
		.select()
		.from(timeEntries)
		.where(
			and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
		)
		.limit(1);
	return entry ? serializeEntry(entry) : null;
}

/** Shared shape for the single-entry commands: run, then audit + outbox in the same transaction. */
function entryCommand(
	context: MutationExecutionContext,
	uow: TimeMutationUnitOfWork,
	action: string,
	status: number,
	run: (tx: DatabaseTransaction) => Promise<typeof timeEntries.$inferSelect>,
	metadata?: Record<string, string>,
): Promise<MutationResult<TimeEntryDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await run(transaction.db);
			await transaction.audit({
				action,
				...(metadata ? { metadata } : {}),
				resourceId: row.id,
				resourceType: "time-entry",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "time-entry",
				eventName: action,
				payload: { timeEntryId: row.id, ...(metadata ?? {}) },
				version: 1,
			});
			return { result: serializeEntry(row), status };
		})
		.catch(mapTimeError);
}

export function createManualTimeEntryCommand(
	context: MutationExecutionContext,
	input: ManualTimeEntryInput,
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
) {
	return entryCommand(context, uow, "time-entry.created", 201, (tx) =>
		createManualTimeEntryInTx(tx, context.workspaceId, input),
	);
}

/**
 * Start a timer. Retrying this call with the same idempotency key replays the stored result;
 * asking for a *second* concurrent timer on the same tracker hits the running-timer unique index
 * and comes back as a conflict. Those two cases stay distinguishable on purpose.
 */
export function startTimerCommand(
	context: MutationExecutionContext,
	input: TimerStartInput,
	options: { now?: Date } = {},
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
) {
	return entryCommand(context, uow, "time-entry.timer-started", 201, (tx) =>
		startTimerInTx(tx, context.workspaceId, input, options),
	);
}

export function stopTimerCommand(
	context: MutationExecutionContext,
	id: string,
	endedAt: Date,
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
) {
	return entryCommand(context, uow, "time-entry.timer-stopped", 200, (tx) =>
		stopTimeEntryTimerInTx(tx, context.workspaceId, id, endedAt),
	);
}

export function updateManualTimeEntryCommand(
	context: MutationExecutionContext,
	id: string,
	input: ManualTimeEntryInput,
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
) {
	return entryCommand(context, uow, "time-entry.updated", 200, (tx) =>
		updateManualTimeEntryInTx(tx, context.workspaceId, id, input),
	);
}

export function updateTimeEntryDetailsCommand(
	context: MutationExecutionContext,
	id: string,
	input: TimeEntryDetailsInput,
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
) {
	return entryCommand(context, uow, "time-entry.details-updated", 200, (tx) =>
		updateTimeEntryDetailsInTx(tx, context.workspaceId, id, input),
	);
}

export function approveTimeEntryCommand(
	context: MutationExecutionContext,
	id: string,
	options: { mode?: BillingRoundingMode; incrementMinutes?: number } = {},
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
) {
	return entryCommand(context, uow, "time-entry.approved", 200, (tx) =>
		approveTimeEntryInTx(tx, context.workspaceId, id, options),
	);
}

export function unapproveTimeEntryCommand(
	context: MutationExecutionContext,
	id: string,
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
) {
	return entryCommand(context, uow, "time-entry.unapproved", 200, (tx) =>
		unapproveTimeEntryInTx(tx, context.workspaceId, id),
	);
}

export function voidTimeEntryCommand(
	context: MutationExecutionContext,
	id: string,
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
) {
	return entryCommand(context, uow, "time-entry.voided", 200, (tx) =>
		voidTimeEntryInTx(tx, context.workspaceId, id),
	);
}

export function restoreVoidedTimeEntryCommand(
	context: MutationExecutionContext,
	id: string,
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
) {
	return entryCommand(context, uow, "time-entry.restored", 200, (tx) =>
		restoreVoidedTimeEntryInTx(tx, context.workspaceId, id),
	);
}

export function deleteTimeEntryCommand(
	context: MutationExecutionContext,
	id: string,
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteTimeEntryInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "time-entry.deleted",
				resourceId: row.id,
				resourceType: "time-entry",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "time-entry",
				eventName: "time-entry.deleted",
				payload: { timeEntryId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapTimeError);
}

/**
 * Attach approved time to a draft invoice. This writes across a module boundary — the invoice and
 * every entry move together in one transaction, so time can never be marked invoiced against an
 * invoice that didn't change. Batch ops audit each entry individually for traceability, then emit
 * a single outbox event keyed on the invoice, which is what consumers actually react to.
 */
export function invoiceApprovedTimeEntriesCommand(
	context: MutationExecutionContext,
	invoiceId: string,
	entryIds: string[],
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ entryIds: string[]; invoiceId: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const rows = await invoiceApprovedTimeEntriesInTx(
				transaction.db,
				context.workspaceId,
				invoiceId,
				entryIds,
			);
			for (const row of rows) {
				await transaction.audit({
					action: "time-entry.invoiced",
					metadata: { invoiceId },
					resourceId: row.id,
					resourceType: "time-entry",
				});
			}
			await transaction.outbox({
				aggregateId: invoiceId,
				aggregateType: "invoice",
				eventName: "invoice.time-attached",
				payload: {
					entryCount: rows.length,
					entryIds: rows.map((row) => row.id),
					invoiceId,
				},
				version: 1,
			});
			return {
				result: { entryIds: rows.map((row) => row.id), invoiceId },
				status: 200,
			};
		})
		.catch(mapTimeError);
}

export function detachTimeEntriesFromDraftInvoiceCommand(
	context: MutationExecutionContext,
	invoiceId: string,
	entryIds: string[],
	uow: TimeMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ entryIds: string[]; invoiceId: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const rows = await detachTimeEntriesFromDraftInvoiceInTx(
				transaction.db,
				context.workspaceId,
				invoiceId,
				entryIds,
			);
			for (const row of rows) {
				await transaction.audit({
					action: "time-entry.detached",
					metadata: { invoiceId },
					resourceId: row.id,
					resourceType: "time-entry",
				});
			}
			await transaction.outbox({
				aggregateId: invoiceId,
				aggregateType: "invoice",
				eventName: "invoice.time-detached",
				payload: {
					entryCount: rows.length,
					entryIds: rows.map((row) => row.id),
					invoiceId,
				},
				version: 1,
			});
			return {
				result: { entryIds: rows.map((row) => row.id), invoiceId },
				status: 200,
			};
		})
		.catch(mapTimeError);
}
