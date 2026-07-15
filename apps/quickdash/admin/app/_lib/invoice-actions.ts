"use server";

import { getSession } from "@quickengine/auth/server";
import {
	createInvoice,
	deleteInvoice,
	invoicingSettingsSchema,
	setInvoiceStatus,
	updateDraftInvoice,
} from "@quickengine/mod-invoicing";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireWorkspaceAccess } from "./workspace-access";

export type InvoiceActionState = {
	error: string | null;
	completionId: string | null;
};

const failure = (error: string): InvoiceActionState => ({
	error,
	completionId: null,
});

async function authorize(workspaceId: string) {
	const session = await getSession(await headers());
	if (!session) {
		return {
			ok: false,
			error: "Your session expired. Please sign in again.",
		} as const;
	}
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) {
		return { ok: false, error: "Workspace access was not found." } as const;
	}
	const module = access.modules.find((item) => item.id === "invoicing");
	if (!module) {
		return {
			ok: false,
			error: "Invoicing is not enabled for this workspace.",
		} as const;
	}
	return {
		ok: true,
		settings: invoicingSettingsSchema.parse(module.settings),
	} as const;
}

function decimalToCents(value: FormDataEntryValue | null, label: string) {
	const text = String(value ?? "").trim();
	if (!/^\d+(\.\d{1,2})?$/.test(text)) {
		throw new Error(
			`${label} must be a non-negative amount with at most two decimals.`,
		);
	}
	const [whole, fraction = ""] = text.split(".");
	const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
	if (!Number.isSafeInteger(cents)) throw new Error(`${label} is too large.`);
	return cents;
}

function readInvoiceInput(formData: FormData) {
	const descriptions = formData.getAll("lineDescription");
	const quantities = formData.getAll("lineQuantity");
	const prices = formData.getAll("lineUnitPrice");
	if (
		descriptions.length === 0 ||
		descriptions.length !== quantities.length ||
		descriptions.length !== prices.length
	) {
		throw new Error("Add at least one complete invoice line.");
	}
	const dueDate = String(formData.get("dueDate") ?? "");
	return {
		clientId: String(formData.get("clientId") ?? "") || null,
		currency: String(formData.get("currency") ?? ""),
		taxCents: decimalToCents(formData.get("tax"), "Tax"),
		notes: String(formData.get("notes") ?? ""),
		dueAt: dueDate ? new Date(`${dueDate}T23:59:59.999Z`) : null,
		lineItems: descriptions.map((description, index) => ({
			description: String(description),
			quantity: Number(quantities[index]),
			unitPriceCents: decimalToCents(prices[index] ?? null, "Unit price"),
			position: index,
		})),
	};
}

const friendlyFailure = (error: unknown) => {
	if (!(error instanceof Error)) return "We couldn't save this invoice.";
	if (
		error.message === "CLIENT_WORKSPACE_MISMATCH" ||
		error.message === "CLIENT_NOT_FOUND"
	) {
		return "Choose a client from this workspace.";
	}
	if (error.message === "INVOICE_NOT_EDITABLE") {
		return "Only draft invoices can be edited.";
	}
	if (error.message === "INVOICE_HAS_MANAGED_LINES") {
		return "This draft contains module-managed lines and cannot be replaced here.";
	}
	if (error.name === "ZodError")
		return "Check the invoice details and line items.";
	return error.message.startsWith("Tax ") ||
		error.message.startsWith("Unit price ")
		? error.message
		: "We couldn't save this invoice. Please try again.";
};

export async function createInvoiceAction(
	_previous: InvoiceActionState,
	formData: FormData,
): Promise<InvoiceActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const input = readInvoiceInput(formData);
		await createInvoice(workspaceId, {
			...input,
			currency: input.currency || authorization.settings.defaultCurrency,
			numberPrefix: authorization.settings.numberPrefix,
		});
	} catch (error) {
		return failure(friendlyFailure(error));
	}
	revalidatePath(`/${workspaceId}/invoicing`);
	return { error: null, completionId: crypto.randomUUID() };
}

export async function updateInvoiceAction(
	_previous: InvoiceActionState,
	formData: FormData,
): Promise<InvoiceActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const invoiceId = String(formData.get("invoiceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		await updateDraftInvoice(
			workspaceId,
			invoiceId,
			readInvoiceInput(formData),
		);
	} catch (error) {
		return failure(friendlyFailure(error));
	}
	revalidatePath(`/${workspaceId}/invoicing`);
	return { error: null, completionId: crypto.randomUUID() };
}

export async function changeInvoiceStatusAction(
	_previous: InvoiceActionState,
	formData: FormData,
): Promise<InvoiceActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const invoiceId = String(formData.get("invoiceId") ?? "");
	const target = String(formData.get("target") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	if (target !== "sent" && target !== "void")
		return failure("Invalid invoice action.");
	try {
		await setInvoiceStatus(workspaceId, invoiceId, target);
	} catch {
		return failure("This invoice can no longer make that lifecycle change.");
	}
	revalidatePath(`/${workspaceId}/invoicing`);
	return { error: null, completionId: crypto.randomUUID() };
}

export async function deleteInvoiceAction(
	_previous: InvoiceActionState,
	formData: FormData,
): Promise<InvoiceActionState> {
	const workspaceId = String(formData.get("workspaceId") ?? "");
	const invoiceId = String(formData.get("invoiceId") ?? "");
	const authorization = await authorize(workspaceId);
	if (!authorization.ok) return failure(authorization.error);
	try {
		const deleted = await deleteInvoice(workspaceId, invoiceId);
		if (!deleted) return failure("This invoice no longer exists.");
	} catch {
		return failure("Only ordinary draft invoices can be permanently deleted.");
	}
	revalidatePath(`/${workspaceId}/invoicing`);
	return { error: null, completionId: crypto.randomUUID() };
}
