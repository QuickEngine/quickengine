import {
	catalogItems,
	createNotification,
	db,
	eq,
	inventoryItems,
	listOrganizationMembers,
	quickengineWorkspaces,
} from "@quickengine/db";
import type { OutboxEvent, OutboxHandler } from "@quickengine/events";

/**
 * The bell — telling the people who run a business what just happened in it.
 *
 * ── What earns a notification ───────────────────────────────────────────────
 *
 * 🔴 Deliberately a SHORT list. A bell that reports everything is a bell nobody
 * reads, and the moment it is ignored it is worse than absent, because the one
 * thing that mattered is now hidden among forty that did not. The test applied
 * here: **would a person want to be interrupted by this while doing something
 * else?** Money arriving, money failing, and a customer waiting on a reply pass.
 * A price being edited does not — the activity feed already records that.
 *
 * ⚠️ NOT the same as the customer's email. `customer-notifications` tells the
 * SHOPPER their order is confirmed; this tells the SELLER they made a sale.
 * Same event, different audience, and conflating them is how a business ends up
 * emailing itself.
 */

type Notice = {
	type: string;
	/** How loudly to say it. See the column comment on `notifications.signal`. */
	signal: "news" | "attention" | "failure";
	title: string;
	body?: string;
	/** Where to land. Relative to QuickDash, resolved against the workspace. */
	path?: string;
	/**
	 * Overrides the outbox event id as the idempotency key.
	 *
	 * 🔑 Only for notices where the EVENT is not the thing you want to be told
	 * about once. Low stock is the case: every adjustment while an item sits
	 * below its threshold is a separate event, and keying on the event would
	 * report the same shortage on every sale of that item all afternoon.
	 */
	sourceKey?: string;
};

/**
 * Which events reach a person, and what they say.
 *
 * Returning null means "record it in activity and leave the bell alone", which
 * is the right answer for most of what the system emits.
 */
async function noticeFor(event: OutboxEvent): Promise<Notice | null> {
	const payload = (event.payload ?? {}) as Record<string, unknown>;

	if (event.eventName === "order.paid") {
		return {
			type: "order.paid",
			signal: "news",
			title: "New order",
			body: "An order has been paid for and is ready to work on.",
			path: "/orders",
		};
	}

	/**
	 * 🔴 DISPUTES ONLY, and that is a deliberate narrowing.
	 *
	 * `payment.status-changed` also fires on `succeeded` — the same fact as the
	 * "New order" above — and on `failed`. A declined card is ordinary shop
	 * traffic: wrong CVC, insufficient funds, and the customer retries seconds
	 * later. Reporting each one buries the dispute underneath it.
	 *
	 * A dispute is different in kind: the money has already left the business's
	 * balance and there is a window to respond, after which it is lost by
	 * default. It is the only payment event worth interrupting somebody for.
	 */
	if (event.eventName === "payment.status-changed") {
		if (String(payload.status ?? "") !== "disputed") return null;
		return {
			type: "payment.disputed",
			signal: "failure",
			title: "Payment disputed",
			body: "A customer disputed a payment. There is a deadline to respond.",
			path: "/payments",
		};
	}

	if (event.eventName === "customer.message.received") {
		return {
			type: "customer.message",
			signal: "news",
			title: "New message",
			body: "A customer is waiting on a reply.",
			path: "/client-records/messages",
		};
	}

	/**
	 * A parcel somebody flagged as having gone wrong.
	 *
	 * ⚠️ There is NO carrier integration. Nothing polls a tracking API, so this
	 * fires when a human sets the status — the person packing boxes telling the
	 * person who answers the emails, which in a business with more than one
	 * person is the whole point. Worded accordingly: claiming "the carrier
	 * reported a problem" would be describing an integration that does not exist.
	 */
	if (event.eventName === "shipment.status-changed") {
		if (String(payload.status ?? "") !== "exception") return null;
		return {
			type: "shipment.exception",
			signal: "attention",
			title: "Shipment problem",
			body: "A shipment was marked as having a problem.",
			// ⚠️ The module is `shipping` and shipments are its index. There is no
			// `/fulfillment` route — a notification that deep-links to a 404 is worse
			// than one with no link at all.
			path: "/shipping",
		};
	}

	if (event.eventName === "inventory-item.adjusted") {
		return lowStockNotice(payload);
	}

	return null;
}

/**
 * Selling something you are about to run out of.
 *
 * ⚠️ A threshold of 0 means "not tracked", not "warn me at zero" — the column
 * defaults to 0 and most items never set it, so treating 0 as a trigger would
 * fire on every item in the catalog the first time it sold out.
 */
async function lowStockNotice(
	payload: Record<string, unknown>,
): Promise<Notice | null> {
	const onHand = Number(payload.resultingOnHand);
	const itemId = String(payload.inventoryItemId ?? "");
	if (!itemId || !Number.isFinite(onHand)) return null;

	const [item] = await db
		.select({
			threshold: inventoryItems.lowStockThreshold,
			status: inventoryItems.status,
			name: catalogItems.name,
		})
		.from(inventoryItems)
		.innerJoin(catalogItems, eq(inventoryItems.catalogItemId, catalogItems.id))
		.where(eq(inventoryItems.id, itemId))
		.limit(1);

	if (!item || item.status !== "active") return null;
	if (item.threshold <= 0 || onHand > item.threshold) return null;

	return {
		type: "inventory.low-stock",
		signal: "attention",
		title: onHand <= 0 ? `${item.name} is out of stock` : `${item.name} is low`,
		body:
			onHand <= 0
				? "It is still listed, so it can be ordered and then not shipped."
				: `${onHand} left, against a threshold of ${item.threshold}.`,
		path: "/inventory",
		// 🔑 Once per item per day. The next sale of the same low item is the same
		// fact, and being told it eleven times is how a bell gets ignored.
		sourceKey: `low-stock:${itemId}:${new Date().toISOString().slice(0, 10)}`,
	};
}

/**
 * Who runs this workspace.
 *
 * Everyone in the organization today. Narrowing by permission is the obvious
 * next step — a bookkeeper does not need every shipment — but sending to
 * nobody because the filter was wrong is a worse failure than sending to one
 * person too many, so the broad version ships first.
 */
async function recipients(workspaceId: string) {
	const [workspace] = await db
		.select({
			organizationId: quickengineWorkspaces.organizationId,
			slug: quickengineWorkspaces.slug,
			id: quickengineWorkspaces.id,
		})
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace?.organizationId) return null;
	const members = await listOrganizationMembers(workspace.organizationId);
	return { workspace, members };
}

export function operatorNotificationHandler(): OutboxHandler {
	return {
		name: "operator-notifications",
		async handle(event: OutboxEvent) {
			const notice = await noticeFor(event);
			if (!notice) return;

			const target = await recipients(event.workspaceId);
			// A workspace with no organization has nobody to tell. Not an error:
			// personal workspaces exist and simply have no member list.
			if (!target || target.members.length === 0) return;

			// The slug where there is one, so a link opens at an address that reads
			// as the business rather than as a uuid.
			const base = `/${target.workspace.slug ?? target.workspace.id}`;

			for (const member of target.members) {
				await createNotification({
					userId: member.userId,
					organizationId: target.workspace.organizationId,
					type: notice.type,
					signal: notice.signal,
					title: notice.title,
					body: notice.body ?? null,
					href: notice.path ? `${base}${notice.path}` : null,
					// 🔴 The outbox row id by default. Delivery is at-least-once, so this
					// is what makes a redelivery a no-op instead of a second "New order".
					sourceKey: notice.sourceKey ?? event.id,
				});
			}
		},
	};
}
