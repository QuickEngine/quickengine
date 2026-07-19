"use server";

import { getSession } from "@quickengine/auth/server";
import { claimIdempotencyKey } from "@quickengine/db";
import {
	getPayment,
	paymentsSettingsSchema,
	recordPayment,
	refundPayment,
} from "@quickengine/mod-payments";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type PaymentActionState = {
	error: string | null;
	completionId: string | null;
};

const failure = (error: string): PaymentActionState => ({
	error,
	completionId: null,
});

async function authorize(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session)
		return {
			ok: false,
			error: "Your session expired. Please sign in again.",
		} as const;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access)
		return { ok: false, error: "Workspace access was not found." } as const;
	const module = access.modules.find((item) => item.id === "payments");
	if (!module)
		return {
			ok: false,
			error: "Payments is not enabled for this workspace.",
		} as const;
	return {
		ok: true,
		settings: paymentsSettingsSchema.parse(module.settings),
	} as const;
}

function decimalToCents(value: FormDataEntryValue | null, label: string) {
	const text = String(value ?? "").trim();
	if (!/^\d+(\.\d{1,2})?$/.test(text)) {
		throw new Error(
			`${label} must be a positive amount with at most two decimals.`,
		);
	}
	const [whole, fraction = ""] = text.split(".");
	const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
	if (!Number.isSafeInteger(cents) || cents <= 0)
		throw new Error(`${label} is invalid.`);
	return cents;
}

export async function recordOfflinePaymentAction(
	_previous: PaymentActionState,
	formData: FormData,
): Promise<PaymentActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);

	// Idempotency: a double-fire or retry can't record the same payment twice
	// (a duplicate payment would mis-count money against the invoice).
	const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
	if (
		!(await claimIdempotencyKey(
			idempotencyKey,
			`payments.record:${workspaceId}`,
		))
	) {
		revalidatePath(`/${workspaceId}/payments`);
		revalidatePath(`/${workspaceId}/invoicing`);
		return { error: null, completionId: crypto.randomUUID() };
	}

	try {
		await recordPayment(workspaceId, {
			invoiceId: String(formData.get("invoiceId") ?? "") || null,
			clientId: String(formData.get("clientId") ?? "") || null,
			amountCents: decimalToCents(formData.get("amount"), "Amount"),
			currency:
				String(formData.get("currency") ?? "") ||
				authorization.settings.defaultCurrency,
			provider: "manual",
			paymentMethod: String(formData.get("paymentMethod") ?? "other"),
			reference: String(formData.get("reference") ?? "") || null,
			notes: String(formData.get("notes") ?? "") || null,
			status: "succeeded",
		});
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "INVOICE_NOT_PAYABLE")
				return failure("Only issued invoices can receive payments.");
			if (error.message === "PAYMENT_CURRENCY_MISMATCH")
				return failure("The payment currency must match the invoice.");
			if (error.message === "PAYMENT_EXCEEDS_INVOICE_BALANCE")
				return failure("The payment exceeds the invoice's remaining balance.");
			if (error.name === "ZodError" || error.message.startsWith("Amount "))
				return failure("Check the amount and payment details.");
		}
		return failure("We couldn't record this payment. Please try again.");
	}
	revalidatePath(`/${workspaceId}/payments`);
	revalidatePath(`/${workspaceId}/invoicing`);
	return { error: null, completionId: crypto.randomUUID() };
}

export async function refundOfflinePaymentAction(
	_previous: PaymentActionState,
	formData: FormData,
): Promise<PaymentActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const paymentId = String(formData.get("paymentId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const payment = await getPayment(workspaceId, paymentId);
		if (!payment) return failure("This payment no longer exists.");
		if (payment.provider !== "manual") {
			return failure(
				"Provider payments must be refunded through their connected provider.",
			);
		}
		await refundPayment(workspaceId, paymentId, {
			amountCents: decimalToCents(formData.get("amount"), "Refund"),
			reason: String(formData.get("reason") ?? "") || null,
		});
	} catch (error) {
		if (error instanceof Error && error.message === "REFUND_EXCEEDS_PAYMENT") {
			return failure(
				"The refund exceeds the payment's remaining refundable amount.",
			);
		}
		return failure("We couldn't record this refund. Please try again.");
	}
	revalidatePath(`/${workspaceId}/payments`);
	revalidatePath(`/${workspaceId}/invoicing`);
	return { error: null, completionId: crypto.randomUUID() };
}
