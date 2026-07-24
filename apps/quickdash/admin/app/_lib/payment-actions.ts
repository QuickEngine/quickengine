"use server";

import {
	fingerprintCanonicalInput,
	idempotencyKeySchema,
} from "@quickengine/api-contracts/mutations";
import { getSession } from "@quickengine/auth/server";
import {
	getPayment,
	paymentsSettingsSchema,
	recordPaymentCommand,
	refundPaymentCommand,
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
const success = (): PaymentActionState => ({
	error: null,
	completionId: crypto.randomUUID(),
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
		access,
		actorId: session.user.id,
		settings: paymentsSettingsSchema.parse(module.settings),
	} as const;
}

async function mutationContext(
	authorization: Extract<Awaited<ReturnType<typeof authorize>>, { ok: true }>,
	operation: string,
	idempotencyKey: string,
	canonicalInput: unknown,
) {
	return {
		abortSignal: new AbortController().signal,
		actor: { id: authorization.actorId, type: "user" as const },
		deadlineAtMs: Date.now() + 10_000,
		fingerprint: await fingerprintCanonicalInput(canonicalInput),
		idempotencyKey: idempotencyKeySchema.parse(idempotencyKey),
		operation,
		organizationId: authorization.access.organizationId,
		requestId: crypto.randomUUID(),
		source: "quickdash" as const,
		workspaceId: authorization.access.workspace.id,
	};
}

const outcomeFailure = (kind: "conflict" | "in_progress") =>
	failure(
		kind === "conflict"
			? "This request was already used with different details. Try again."
			: "This payment change is still being processed. Try again shortly.",
	);

const key = (formData: FormData) =>
	String(formData.get("idempotencyKey") ?? "");

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

const friendlyFailure = (error: unknown, fallback: string) => {
	if (error instanceof Error && error.name === "DomainError")
		return error.message;
	if (error instanceof Error) {
		if (error.name === "ZodError" || error.message.startsWith("Amount "))
			return "Check the amount and payment details.";
		if (error.message.startsWith("Refund ")) return "Check the refund amount.";
	}
	return fallback;
};

export async function recordOfflinePaymentAction(
	_previous: PaymentActionState,
	formData: FormData,
): Promise<PaymentActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const input = {
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
			status: "succeeded" as const,
		};
		const context = await mutationContext(
			authorization,
			"payments.record",
			key(formData),
			input,
		);
		const outcome = await recordPaymentCommand(context, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			friendlyFailure(
				error,
				"We couldn't record this payment. Please try again.",
			),
		);
	}
	revalidatePath(`/${workspaceId}/payments`);
	revalidatePath(`/${workspaceId}/invoicing`);
	return success();
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
		const input = {
			amountCents: decimalToCents(formData.get("amount"), "Refund"),
			reason: String(formData.get("reason") ?? "") || null,
		};
		const context = await mutationContext(
			authorization,
			"payments.refund",
			key(formData),
			{ id: paymentId, input },
		);
		const outcome = await refundPaymentCommand(context, paymentId, input);
		if (outcome.kind !== "success") return outcomeFailure(outcome.kind);
	} catch (error) {
		return failure(
			friendlyFailure(
				error,
				"We couldn't record this refund. Please try again.",
			),
		);
	}
	revalidatePath(`/${workspaceId}/payments`);
	revalidatePath(`/${workspaceId}/invoicing`);
	return success();
}
