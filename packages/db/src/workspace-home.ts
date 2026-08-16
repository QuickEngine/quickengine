import {
	and,
	asc,
	count,
	eq,
	gte,
	inArray,
	isNull,
	lt,
	lte,
	sql,
} from "drizzle-orm";
import { db } from "./client";
import { bookings } from "./schema/bookings";
import { catalogItems } from "./schema/catalog-items";
import { contracts } from "./schema/contracts-esign";
import { inventoryItems } from "./schema/inventory";
import { invoices } from "./schema/invoices";
import { orders } from "./schema/orders";
import { payments } from "./schema/payments";
import { projectTasks } from "./schema/projects-tasks";
import { quoteEstimates } from "./schema/quotes-estimates";

/**
 * What needs a person today, in one workspace.
 *
 * 🔑 **Assembled on the server, deliberately.** Doing this in the browser is
 * eight or nine requests on every load, and a page whose answer changes
 * depending on which of them failed. One response also means the ENABLED MODULE
 * SET decides what is in it — the page never asks about a module this business
 * does not have, and a disabled module cannot leak a count into the UI.
 *
 * 🔴 Every entry names records, not just a number. A count you cannot act on is
 * decoration; `ids` is what lets the page link straight at the work.
 */

export type HomeConcern = {
	/** Stable key, so the page can decide wording and destination. */
	id:
		| "orders.unfulfilled"
		| "invoices.overdue"
		| "payments.pending"
		| "quotes.awaiting"
		| "contracts.awaiting"
		| "inventory.low";
	count: number;
	/** The first few, newest or most urgent first, for naming them inline. */
	samples: Array<{ id: string; label: string; detail?: string }>;
};

export type HomeToday = {
	id: "bookings.today" | "tasks.due";
	count: number;
	samples: Array<{ id: string; label: string; detail?: string }>;
};

export type WorkspaceHome = {
	needsYou: HomeConcern[];
	today: HomeToday[];
};

const SAMPLE = 3;

/** Start of the current day, in the workspace's own zone when it has one. */
const dayBounds = (timeZone: string) => {
	const now = new Date();
	const local = new Date(now.toLocaleString("en-US", { timeZone }));
	const offset = now.getTime() - local.getTime();
	const start = new Date(local);
	start.setHours(0, 0, 0, 0);
	const end = new Date(start);
	end.setDate(end.getDate() + 1);
	return {
		start: new Date(start.getTime() + offset),
		end: new Date(end.getTime() + offset),
	};
};

export async function getWorkspaceHome(
	workspaceId: string,
	options: { modules: readonly string[]; timeZone?: string },
): Promise<WorkspaceHome> {
	const enabled = new Set(options.modules);
	const { start, end } = dayBounds(options.timeZone ?? "UTC");
	const needsYou: HomeConcern[] = [];
	const today: HomeToday[] = [];

	// Paid and placed, but nothing is moving it. The single most expensive thing
	// to miss: the customer has been charged and is waiting.
	if (enabled.has("orders")) {
		const rows = await db
			.select({
				id: orders.id,
				number: orders.number,
				clientName: orders.clientName,
			})
			.from(orders)
			.where(
				and(
					eq(orders.workspaceId, workspaceId),
					inArray(orders.status, ["placed", "confirmed", "processing"]),
					isNull(orders.fulfillmentId),
				),
			)
			.orderBy(asc(orders.createdAt));
		if (rows.length > 0) {
			needsYou.push({
				id: "orders.unfulfilled",
				count: rows.length,
				samples: rows.slice(0, SAMPLE).map((row) => ({
					id: row.id,
					label: row.number,
					detail: row.clientName ?? undefined,
				})),
			});
		}
	}

	// Sent, past its due date, not paid.
	if (enabled.has("invoicing")) {
		const rows = await db
			.select({
				id: invoices.id,
				number: invoices.number,
				dueAt: invoices.dueAt,
				clientName: invoices.clientName,
			})
			.from(invoices)
			.where(
				and(
					eq(invoices.workspaceId, workspaceId),
					eq(invoices.status, "sent"),
					lt(invoices.dueAt, new Date()),
				),
			)
			.orderBy(asc(invoices.dueAt));
		if (rows.length > 0) {
			needsYou.push({
				id: "invoices.overdue",
				count: rows.length,
				samples: rows.slice(0, SAMPLE).map((row) => ({
					id: row.id,
					label: row.number,
					detail: row.clientName ?? undefined,
				})),
			});
		}
	}

	// Taken but never settled. A payment stuck in `pending` is money the customer
	// believes they have paid and the business has not received.
	if (enabled.has("payments")) {
		const rows = await db
			.select({
				id: payments.id,
				clientName: payments.clientName,
				amountCents: payments.amountCents,
				currency: payments.currency,
			})
			.from(payments)
			.where(
				and(
					eq(payments.workspaceId, workspaceId),
					inArray(payments.status, ["pending", "processing"]),
				),
			)
			.orderBy(asc(payments.createdAt));
		if (rows.length > 0) {
			needsYou.push({
				id: "payments.pending",
				count: rows.length,
				samples: rows.slice(0, SAMPLE).map((row) => ({
					id: row.id,
					label: row.clientName ?? "Guest",
					detail: `${(row.amountCents / 100).toFixed(2)} ${row.currency}`,
				})),
			});
		}
	}

	// Sent and neither accepted nor declined — work that cannot start.
	if (enabled.has("quotes-estimates")) {
		const rows = await db
			.select({
				id: quoteEstimates.id,
				number: quoteEstimates.number,
				clientName: quoteEstimates.clientName,
			})
			.from(quoteEstimates)
			.where(
				and(
					eq(quoteEstimates.workspaceId, workspaceId),
					eq(quoteEstimates.status, "sent"),
				),
			)
			.orderBy(asc(quoteEstimates.createdAt));
		if (rows.length > 0) {
			needsYou.push({
				id: "quotes.awaiting",
				count: rows.length,
				samples: rows.slice(0, SAMPLE).map((row) => ({
					id: row.id,
					label: row.number,
					detail: row.clientName ?? undefined,
				})),
			});
		}
	}

	// Out for signature and not back. Nothing happens until somebody signs, and
	// nothing tells you that it has not.
	if (enabled.has("contracts-esign")) {
		const rows = await db
			.select({ id: contracts.id, title: contracts.title })
			.from(contracts)
			.where(
				and(
					eq(contracts.workspaceId, workspaceId),
					inArray(contracts.status, ["sent", "partially_signed"]),
				),
			)
			.orderBy(asc(contracts.createdAt));
		if (rows.length > 0) {
			needsYou.push({
				id: "contracts.awaiting",
				count: rows.length,
				samples: rows
					.slice(0, SAMPLE)
					.map((row) => ({ id: row.id, label: row.title })),
			});
		}
	}

	// 🔴 Available stock, not stock on hand: reserved units are already promised
	// to an order. Counting them as available is how a shop oversells.
	if (enabled.has("inventory")) {
		const rows = await db
			.select({
				id: inventoryItems.id,
				name: catalogItems.name,
				onHand: inventoryItems.onHand,
				reserved: inventoryItems.reserved,
				threshold: inventoryItems.lowStockThreshold,
			})
			.from(inventoryItems)
			.innerJoin(
				catalogItems,
				eq(catalogItems.id, inventoryItems.catalogItemId),
			)
			.where(
				and(
					eq(inventoryItems.workspaceId, workspaceId),
					eq(inventoryItems.status, "active"),
					sql`${inventoryItems.onHand} - ${inventoryItems.reserved} <= ${inventoryItems.lowStockThreshold}`,
				),
			)
			.orderBy(asc(catalogItems.name));
		if (rows.length > 0) {
			needsYou.push({
				id: "inventory.low",
				count: rows.length,
				samples: rows.slice(0, SAMPLE).map((row) => ({
					id: row.id,
					label: row.name,
					detail: `${row.onHand - row.reserved} left`,
				})),
			});
		}
	}

	if (enabled.has("bookings")) {
		const rows = await db
			.select({
				id: bookings.id,
				title: bookings.title,
				startsAt: bookings.startsAt,
				clientName: bookings.clientName,
			})
			.from(bookings)
			.where(
				and(
					eq(bookings.workspaceId, workspaceId),
					inArray(bookings.status, ["requested", "confirmed", "checked_in"]),
					gte(bookings.startsAt, start),
					lt(bookings.startsAt, end),
				),
			)
			.orderBy(asc(bookings.startsAt));
		if (rows.length > 0) {
			today.push({
				id: "bookings.today",
				count: rows.length,
				samples: rows.slice(0, SAMPLE).map((row) => ({
					id: row.id,
					label: row.title,
					detail: row.clientName ?? undefined,
				})),
			});
		}
	}

	// Due today or already past it, and not finished.
	if (enabled.has("projects-tasks")) {
		const cutoff = end.toISOString().slice(0, 10);
		const rows = await db
			.select({
				id: projectTasks.id,
				title: projectTasks.title,
				due: projectTasks.dueDate,
			})
			.from(projectTasks)
			.where(
				and(
					eq(projectTasks.workspaceId, workspaceId),
					inArray(projectTasks.status, ["todo", "in_progress", "blocked"]),
					lte(projectTasks.dueDate, cutoff),
				),
			)
			.orderBy(asc(projectTasks.dueDate));
		if (rows.length > 0) {
			today.push({
				id: "tasks.due",
				count: rows.length,
				samples: rows.slice(0, SAMPLE).map((row) => ({
					id: row.id,
					label: row.title,
					detail: row.due ?? undefined,
				})),
			});
		}
	}

	return { needsYou, today };
}
