import { testDbClient } from "@quickengine/db/testing";
import { customerNotificationHandler } from "@quickengine/event-dispatch";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A business's own wording reaches its customers.
 *
 * 🔴 It did not. `readEmailTemplateCopy` was called by the settings PREVIEW and
 * by the "send me a test" button, and by nothing else. So a business could
 * rewrite its order confirmation, watch the preview change, receive a test email
 * with the new wording — and every real customer kept getting the built-in
 * default. Found on 2026-08-28, on a workspace that had customised its
 * templates before its first real order.
 *
 * ⚠️ Structure is still generated. The override carries the SUBJECT and the
 * HTML shell only; line items and totals are always rendered from the order, so
 * a business cannot send a receipt that disagrees with what was charged.
 */

const owner = "copy-owner";
const workspaceId = "00000000-0000-4000-8000-000000190001";
const clientId = "00000000-0000-4000-8000-000000190002";
const orderId = "00000000-0000-4000-8000-000000190003";
const catalogItemId = "00000000-0000-4000-8000-000000190004";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Asher', 'copy@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${owner}, 'Caffeinate', 'ecommerce')
	`;
	await sql`
		insert into workspace_branding (workspace_id, portal_slug, display_name, sender_email, support_email)
		values (${workspaceId}, 'caffeinate-copy', 'Caffeinate', 'hello@caffeinate.shop', 'hello@caffeinate.shop')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientId}, ${workspaceId}, 'Ada', 'ada@example.com')
	`;
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status, pricing_model, currency)
		values (${catalogItemId}, ${workspaceId}, 'Dark Mode', 'physical', 'active', 'fixed', 'CAD')
	`;
	await sql`
		insert into orders (id, workspace_id, sequence, number, status, client_id, client_name, client_email, currency, subtotal_cents, total_cents)
		values (${orderId}, ${workspaceId}, 1, 'ORD-0001', 'placed', ${clientId}, 'Ada', 'ada@example.com', 'CAD', 2900, 2900)
	`;
	await sql`
		insert into order_line_items (order_id, catalog_item_id, name, type, quantity, unit_price_cents, line_total_cents, position)
		values (${orderId}, ${catalogItemId}, 'Dark Mode', 'physical', 1, 2900, 2900, 0)
	`;
});

const paidEvent = () =>
	({
		id: "evt_copy_paid",
		workspaceId,
		aggregateType: "order",
		aggregateId: orderId,
		eventName: "order.paid",
		payload: { orderId },
	}) as never;

/** Capture what would actually be sent, without a mail provider. */
function capture() {
	return vi.fn(
		async (_input: {
			to: string;
			from?: string;
			subject: string;
			html: string;
			text: string;
		}) => undefined,
	);
}

describe("a business's own email wording", () => {
	it("reaches a real customer, not just the preview", async () => {
		const sql = testDbClient();
		await sql`
			insert into workspace_email_templates (workspace_id, template_key, subject, html)
			values (
				${workspaceId},
				'order-confirmation',
				'Your Caffeinate order is roasting',
				'<p>Thanks for ordering from Caffeinate. Your beans are on the way.</p>'
			)
		`;

		const send = capture();
		await customerNotificationHandler(send, () => {}).handle(paidEvent());

		expect(send).toHaveBeenCalledTimes(1);
		const sent = send.mock.calls[0]?.[0];
		expect(sent?.subject).toBe("Your Caffeinate order is roasting");
		expect(sent?.html).toContain("Your beans are on the way");
		// Still from the BUSINESS, never the platform. Carries a display name,
		// so the address is asserted rather than the whole formatted string.
		expect(sent?.from).toContain("hello@caffeinate.shop");
		expect(sent?.from).toContain("Caffeinate");
		expect(sent?.to).toBe("ada@example.com");
	});

	/** ⚠️ A workspace that has never touched a template must still be emailed. */
	it("falls back to the built-in wording when nothing was written", async () => {
		const send = capture();
		await customerNotificationHandler(send, () => {}).handle(paidEvent());

		expect(send).toHaveBeenCalledTimes(1);
		const sent = send.mock.calls[0]?.[0];
		expect(sent?.subject).toBeTruthy();
		// Generated structure survives with or without an override: the customer
		// still sees what they bought and what they paid.
		expect(sent?.html).toContain("Dark Mode");
		expect(sent?.html).toContain("Caffeinate");
	});

	/**
	 * 🔴 Wording for a DIFFERENT template must not leak into this one. The copy
	 * is keyed, and a mix-up would send somebody a shipping notice as a receipt.
	 */
	it("uses only the wording written for that template", async () => {
		const sql = testDbClient();
		await sql`
			insert into workspace_email_templates (workspace_id, template_key, subject, html)
			values (${workspaceId}, 'shipping-notice', 'Your parcel is on its way', '<p>Shipped</p>')
		`;

		const send = capture();
		await customerNotificationHandler(send, () => {}).handle(paidEvent());

		const sent = send.mock.calls[0]?.[0];
		expect(sent?.subject).not.toBe("Your parcel is on its way");
		expect(sent?.html).not.toContain("Shipped");
	});
});
