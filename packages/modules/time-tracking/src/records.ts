import {
	and,
	asc,
	db,
	desc,
	eq,
	gt,
	inArray,
	invoices,
	isNull,
	lt,
	ne,
	or,
	projects,
	projectTasks,
	timeEntries,
} from "@quickengine/db";
import {
	appendDraftInvoiceLineItems,
	removeDraftInvoiceLineItemsBySource,
} from "@quickengine/mod-invoicing";
import {
	type BillingRoundingMode,
	billingRoundingSchema,
	calculateTimeAmountCents,
	roundBillableSeconds,
} from "./billing";
import {
	canTransitionTimeEntry,
	type ManualTimeEntryInput,
	manualTimeEntryInputSchema,
	stopTimer,
	type TimeEntryDetailsInput,
	type TimerStartInput,
	timeEntryDetailsInputSchema,
	timerStartInputSchema,
} from "./time-entry";

type QueryExecutor = Pick<typeof db, "select">;

const TIME_TRACKING_SOURCE = "time-tracking";
const MAX_INVOICE_BATCH_SIZE = 500;

function normalizeEntryIds(entryIds: string[]) {
	const uniqueIds = [...new Set(entryIds)];
	if (uniqueIds.length === 0) throw new Error("TIME_ENTRY_IDS_REQUIRED");
	if (uniqueIds.length > MAX_INVOICE_BATCH_SIZE) {
		throw new Error("TIME_ENTRY_BATCH_TOO_LARGE");
	}
	return uniqueIds;
}

function describeInvoiceTimeEntry(entry: {
	projectName: string;
	taskTitle: string | null;
	description: string | null;
	billableSeconds: number | null;
}) {
	const context = entry.taskTitle
		? `${entry.projectName} — ${entry.taskTitle}`
		: entry.projectName;
	const description = entry.description
		? `${context}: ${entry.description}`
		: context;
	const hours = ((entry.billableSeconds ?? 0) / 3600).toFixed(2);
	return `${description} (${hours} hours)`;
}

async function resolveWorkContext(
	executor: QueryExecutor,
	workspaceId: string,
	projectId: string,
	taskId: string | null,
	options: { requireOperationalProject?: boolean } = {},
) {
	const [project] = await executor
		.select({
			workspaceId: projects.workspaceId,
			name: projects.name,
			clientId: projects.clientId,
			clientName: projects.clientName,
			status: projects.status,
			archivedAt: projects.archivedAt,
		})
		.from(projects)
		.where(eq(projects.id, projectId))
		.limit(1)
		.for("update");
	if (!project) throw new Error("PROJECT_NOT_FOUND");
	if (project.workspaceId !== workspaceId) {
		throw new Error("PROJECT_WORKSPACE_MISMATCH");
	}
	if (project.archivedAt) throw new Error("PROJECT_ARCHIVED");
	if (
		options.requireOperationalProject &&
		(project.status === "completed" || project.status === "cancelled")
	) {
		throw new Error("PROJECT_CLOSED");
	}

	if (!taskId) {
		return {
			projectName: project.name,
			taskTitle: null,
			clientIdSnapshot: project.clientId,
			clientName: project.clientName,
		};
	}
	const [task] = await executor
		.select({
			workspaceId: projectTasks.workspaceId,
			projectId: projectTasks.projectId,
			title: projectTasks.title,
		})
		.from(projectTasks)
		.where(eq(projectTasks.id, taskId))
		.limit(1);
	if (!task) throw new Error("TASK_NOT_FOUND");
	if (task.workspaceId !== workspaceId) {
		throw new Error("TASK_WORKSPACE_MISMATCH");
	}
	if (task.projectId !== projectId) throw new Error("TASK_PROJECT_MISMATCH");
	return {
		projectName: project.name,
		taskTitle: task.title,
		clientIdSnapshot: project.clientId,
		clientName: project.clientName,
	};
}

async function assertNoTimerOverlap(
	executor: QueryExecutor,
	workspaceId: string,
	trackerKey: string,
	startsAt: Date,
	endsAt: Date,
	excludeId?: string,
) {
	const conditions = [
		eq(timeEntries.workspaceId, workspaceId),
		eq(timeEntries.trackerKey, trackerKey),
		eq(timeEntries.source, "timer"),
		ne(timeEntries.status, "void"),
		lt(timeEntries.startedAt, endsAt),
		or(gt(timeEntries.endedAt, startsAt), isNull(timeEntries.endedAt)),
	];
	if (excludeId) conditions.push(ne(timeEntries.id, excludeId));
	const [overlap] = await executor
		.select({ id: timeEntries.id })
		.from(timeEntries)
		.where(and(...conditions))
		.limit(1);
	if (overlap) throw new Error("TIME_ENTRY_OVERLAP");
}

function isRunningTimerConstraint(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as {
		code?: string;
		constraint_name?: string;
		cause?: { code?: string; constraint_name?: string };
	};
	const details = candidate.cause ?? candidate;
	return (
		details.code === "23505" &&
		details.constraint_name === "time_entries_one_running_tracker_idx"
	);
}

export async function createManualTimeEntry(
	workspaceId: string,
	input: ManualTimeEntryInput,
) {
	const parsed = manualTimeEntryInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const context = await resolveWorkContext(
			tx,
			workspaceId,
			parsed.projectId,
			parsed.taskId,
		);
		const [created] = await tx
			.insert(timeEntries)
			.values({
				workspaceId,
				...parsed,
				...context,
				status: "draft",
			})
			.returning();
		return created;
	});
}

export async function startTimer(
	workspaceId: string,
	input: TimerStartInput,
	options: { now?: Date } = {},
) {
	const parsed = timerStartInputSchema.parse(input);
	const now = options.now ?? new Date();
	if (parsed.startedAt > now) throw new Error("TIMER_START_IN_FUTURE");
	try {
		return await db.transaction(async (tx) => {
			const context = await resolveWorkContext(
				tx,
				workspaceId,
				parsed.projectId,
				parsed.taskId,
				{ requireOperationalProject: true },
			);
			await assertNoTimerOverlap(
				tx,
				workspaceId,
				parsed.trackerKey,
				parsed.startedAt,
				now,
			);
			const [created] = await tx
				.insert(timeEntries)
				.values({
					workspaceId,
					...parsed,
					...context,
					status: "running",
					durationSeconds: 0,
				})
				.returning();
			return created;
		});
	} catch (error) {
		if (isRunningTimerConstraint(error)) {
			throw new Error("TIMER_ALREADY_RUNNING");
		}
		throw error;
	}
}

export async function stopTimeEntryTimer(
	workspaceId: string,
	id: string,
	endedAt: Date,
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(timeEntries)
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TIME_ENTRY_NOT_FOUND");
		if (current.source !== "timer" || current.status !== "running") {
			throw new Error("TIME_ENTRY_NOT_RUNNING");
		}
		if (!current.startedAt || !current.timeZone) {
			throw new Error("TIME_ENTRY_TIMER_INVALID");
		}
		const stopped = stopTimer(current.startedAt, endedAt, current.timeZone);
		await assertNoTimerOverlap(
			tx,
			workspaceId,
			current.trackerKey,
			current.startedAt,
			endedAt,
			id,
		);
		const [updated] = await tx
			.update(timeEntries)
			.set({
				status: "draft",
				endedAt,
				...stopped,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(timeEntries.workspaceId, workspaceId),
					eq(timeEntries.id, id),
					eq(timeEntries.status, "running"),
				),
			)
			.returning();
		if (!updated) throw new Error("TIME_ENTRY_CONCURRENT_UPDATE");
		return updated;
	});
}

export async function listTimeEntries(workspaceId: string) {
	return db
		.select()
		.from(timeEntries)
		.where(eq(timeEntries.workspaceId, workspaceId))
		.orderBy(desc(timeEntries.createdAt));
}

export async function getTimeEntry(workspaceId: string, id: string) {
	const [entry] = await db
		.select()
		.from(timeEntries)
		.where(
			and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
		)
		.limit(1);
	return entry;
}

export async function updateManualTimeEntry(
	workspaceId: string,
	id: string,
	input: ManualTimeEntryInput,
) {
	const parsed = manualTimeEntryInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const context = await resolveWorkContext(
			tx,
			workspaceId,
			parsed.projectId,
			parsed.taskId,
		);
		const [current] = await tx
			.select({ source: timeEntries.source, status: timeEntries.status })
			.from(timeEntries)
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TIME_ENTRY_NOT_FOUND");
		if (current.source !== "manual" || current.status !== "draft") {
			throw new Error("TIME_ENTRY_NOT_EDITABLE");
		}
		const [updated] = await tx
			.update(timeEntries)
			.set({ ...parsed, ...context, updatedAt: new Date() })
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.returning();
		return updated;
	});
}

export async function updateTimeEntryDetails(
	workspaceId: string,
	id: string,
	input: TimeEntryDetailsInput,
) {
	const parsed = timeEntryDetailsInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const context = await resolveWorkContext(
			tx,
			workspaceId,
			parsed.projectId,
			parsed.taskId,
		);
		const [current] = await tx
			.select({ status: timeEntries.status })
			.from(timeEntries)
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TIME_ENTRY_NOT_FOUND");
		if (current.status !== "draft") throw new Error("TIME_ENTRY_NOT_EDITABLE");
		const [updated] = await tx
			.update(timeEntries)
			.set({ ...parsed, ...context, updatedAt: new Date() })
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.returning();
		return updated;
	});
}

export async function approveTimeEntry(
	workspaceId: string,
	id: string,
	options: { mode?: BillingRoundingMode; incrementMinutes?: number } = {},
) {
	const rounding = billingRoundingSchema.parse({
		mode: options.mode,
		incrementMinutes: options.incrementMinutes,
	});
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(timeEntries)
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TIME_ENTRY_NOT_FOUND");
		if (!canTransitionTimeEntry(current.status, "approved")) {
			throw new Error("TIME_ENTRY_NOT_APPROVABLE");
		}
		if (current.durationSeconds <= 0) {
			throw new Error("TIME_ENTRY_DURATION_REQUIRED");
		}
		const billableSeconds = current.billable
			? roundBillableSeconds(
					current.durationSeconds,
					rounding.incrementMinutes,
					rounding.mode,
				)
			: 0;
		const amountCents =
			current.billable && current.hourlyRateCents !== null
				? calculateTimeAmountCents(
						current.durationSeconds,
						current.hourlyRateCents,
						rounding.incrementMinutes,
						rounding.mode,
					)
				: current.billable
					? null
					: 0;
		const now = new Date();
		const [updated] = await tx
			.update(timeEntries)
			.set({
				status: "approved",
				billableSeconds,
				amountCents,
				billingRoundingMode: rounding.mode,
				billingIncrementMinutes: rounding.incrementMinutes,
				approvedAt: now,
				voidedAt: null,
				updatedAt: now,
			})
			.where(
				and(
					eq(timeEntries.workspaceId, workspaceId),
					eq(timeEntries.id, id),
					eq(timeEntries.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("TIME_ENTRY_CONCURRENT_UPDATE");
		return updated;
	});
}

export async function unapproveTimeEntry(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: timeEntries.status })
			.from(timeEntries)
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TIME_ENTRY_NOT_FOUND");
		if (!canTransitionTimeEntry(current.status, "draft")) {
			throw new Error("TIME_ENTRY_NOT_UNAPPROVABLE");
		}
		const [updated] = await tx
			.update(timeEntries)
			.set({
				status: "draft",
				billableSeconds: null,
				amountCents: null,
				billingRoundingMode: null,
				billingIncrementMinutes: null,
				approvedAt: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(timeEntries.workspaceId, workspaceId),
					eq(timeEntries.id, id),
					eq(timeEntries.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("TIME_ENTRY_CONCURRENT_UPDATE");
		return updated;
	});
}

export async function voidTimeEntry(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: timeEntries.status })
			.from(timeEntries)
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TIME_ENTRY_NOT_FOUND");
		if (!canTransitionTimeEntry(current.status, "void")) {
			throw new Error("TIME_ENTRY_NOT_VOIDABLE");
		}
		const now = new Date();
		const [updated] = await tx
			.update(timeEntries)
			.set({ status: "void", voidedAt: now, updatedAt: now })
			.where(
				and(
					eq(timeEntries.workspaceId, workspaceId),
					eq(timeEntries.id, id),
					eq(timeEntries.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("TIME_ENTRY_CONCURRENT_UPDATE");
		return updated;
	});
}

export async function restoreVoidedTimeEntry(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({
				status: timeEntries.status,
				duration: timeEntries.durationSeconds,
			})
			.from(timeEntries)
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TIME_ENTRY_NOT_FOUND");
		if (!canTransitionTimeEntry(current.status, "draft")) {
			throw new Error("TIME_ENTRY_NOT_RESTORABLE");
		}
		if (current.duration <= 0) throw new Error("TIME_ENTRY_DURATION_REQUIRED");
		const [updated] = await tx
			.update(timeEntries)
			.set({ status: "draft", voidedAt: null, updatedAt: new Date() })
			.where(
				and(
					eq(timeEntries.workspaceId, workspaceId),
					eq(timeEntries.id, id),
					eq(timeEntries.status, current.status),
				),
			)
			.returning();
		if (!updated) throw new Error("TIME_ENTRY_CONCURRENT_UPDATE");
		return updated;
	});
}

export async function deleteTimeEntry(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: timeEntries.status, invoiceId: timeEntries.invoiceId })
			.from(timeEntries)
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.limit(1)
			.for("update");
		if (!current) throw new Error("TIME_ENTRY_NOT_FOUND");
		if (current.invoiceId) throw new Error("TIME_ENTRY_ATTACHED_TO_INVOICE");
		if (current.status !== "draft" && current.status !== "void") {
			throw new Error("TIME_ENTRY_NOT_DELETABLE");
		}
		const [deleted] = await tx
			.delete(timeEntries)
			.where(
				and(eq(timeEntries.workspaceId, workspaceId), eq(timeEntries.id, id)),
			)
			.returning();
		return deleted;
	});
}

/**
 * Turn approved billable time into draft invoice lines in one transaction.
 * Either every line and entry is updated, or none of them are.
 */
export async function invoiceApprovedTimeEntries(
	workspaceId: string,
	invoiceId: string,
	entryIds: string[],
) {
	const uniqueIds = normalizeEntryIds(entryIds);
	return db.transaction(async (tx) => {
		// Always lock the invoice before entries. Keeping a stable lock order avoids
		// deadlocks when two requests touch the same draft invoice concurrently.
		const [invoice] = await tx
			.select({
				clientId: invoices.clientId,
				currency: invoices.currency,
				status: invoices.status,
			})
			.from(invoices)
			.where(
				and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, invoiceId)),
			)
			.limit(1)
			.for("update");
		if (!invoice) throw new Error("INVOICE_NOT_FOUND");
		if (invoice.status !== "draft") throw new Error("INVOICE_NOT_EDITABLE");

		const entries = await tx
			.select()
			.from(timeEntries)
			.where(
				and(
					eq(timeEntries.workspaceId, workspaceId),
					inArray(timeEntries.id, uniqueIds),
				),
			)
			.orderBy(asc(timeEntries.id))
			.for("update");
		if (entries.length !== uniqueIds.length) {
			throw new Error("TIME_ENTRY_NOT_FOUND");
		}
		for (const entry of entries) {
			if (entry.status === "invoiced") {
				throw new Error("TIME_ENTRY_ALREADY_INVOICED");
			}
			if (entry.status !== "approved") {
				throw new Error("TIME_ENTRY_NOT_APPROVED");
			}
			if (!entry.billable || entry.amountCents === null) {
				throw new Error("TIME_ENTRY_NOT_BILLABLE");
			}
			if (entry.currency !== invoice.currency) {
				throw new Error("TIME_ENTRY_CURRENCY_MISMATCH");
			}
			if (entry.clientIdSnapshot !== invoice.clientId) {
				throw new Error("TIME_ENTRY_CLIENT_MISMATCH");
			}
		}

		await appendDraftInvoiceLineItems(
			tx,
			workspaceId,
			invoiceId,
			entries.map((entry) => ({
				description: describeInvoiceTimeEntry(entry),
				quantity: 1,
				unitPriceCents: entry.amountCents ?? 0,
				sourceModule: TIME_TRACKING_SOURCE,
				sourceRecordId: entry.id,
			})),
		);

		const now = new Date();
		const updated = await tx
			.update(timeEntries)
			.set({
				status: "invoiced",
				invoiceId,
				invoicedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(timeEntries.workspaceId, workspaceId),
					inArray(timeEntries.id, uniqueIds),
					eq(timeEntries.status, "approved"),
				),
			)
			.returning();
		if (updated.length !== uniqueIds.length) {
			throw new Error("TIME_ENTRY_CONCURRENT_UPDATE");
		}
		return updated;
	});
}

/** Detach previously invoiced time while the target invoice remains a draft. */
export async function detachTimeEntriesFromDraftInvoice(
	workspaceId: string,
	invoiceId: string,
	entryIds: string[],
) {
	const uniqueIds = normalizeEntryIds(entryIds);
	return db.transaction(async (tx) => {
		const [invoice] = await tx
			.select({ status: invoices.status })
			.from(invoices)
			.where(
				and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, invoiceId)),
			)
			.limit(1)
			.for("update");
		if (!invoice) throw new Error("INVOICE_NOT_FOUND");
		if (invoice.status !== "draft") throw new Error("INVOICE_NOT_EDITABLE");

		const entries = await tx
			.select({ id: timeEntries.id })
			.from(timeEntries)
			.where(
				and(
					eq(timeEntries.workspaceId, workspaceId),
					inArray(timeEntries.id, uniqueIds),
					eq(timeEntries.status, "invoiced"),
					eq(timeEntries.invoiceId, invoiceId),
				),
			)
			.orderBy(asc(timeEntries.id))
			.for("update");
		if (entries.length !== uniqueIds.length) {
			throw new Error("TIME_ENTRY_INVOICE_MISMATCH");
		}

		await removeDraftInvoiceLineItemsBySource(
			tx,
			workspaceId,
			invoiceId,
			TIME_TRACKING_SOURCE,
			uniqueIds,
		);
		const updated = await tx
			.update(timeEntries)
			.set({
				status: "approved",
				invoiceId: null,
				invoicedAt: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(timeEntries.workspaceId, workspaceId),
					inArray(timeEntries.id, uniqueIds),
					eq(timeEntries.status, "invoiced"),
					eq(timeEntries.invoiceId, invoiceId),
				),
			)
			.returning();
		if (updated.length !== uniqueIds.length) {
			throw new Error("TIME_ENTRY_CONCURRENT_UPDATE");
		}
		return updated;
	});
}
