import { listClientRecords } from "@quickengine/mod-client-records";
import {
	getInvoice,
	invoicingSettingsSchema,
	listInvoices,
} from "@quickengine/mod-invoicing";
import { InvoicesView } from "../_components/invoices-view";
import type { ModulePageProps } from "./types";

export default async function InvoicingPage({
	workspaceId,
	settings,
	today,
}: ModulePageProps) {
	const invoicingSettings = invoicingSettingsSchema.parse(settings);
	const invoiceRows = await listInvoices(workspaceId);
	const invoiceDetails = await Promise.all(
		invoiceRows.map((invoice) => getInvoice(workspaceId, invoice.id)),
	);
	const invoiceClients = await listClientRecords(workspaceId);
	const defaultDueDate = new Date(
		today.getTime() + invoicingSettings.defaultDueInDays * 86_400_000,
	)
		.toISOString()
		.slice(0, 10);
	return (
		<InvoicesView
			workspaceId={workspaceId}
			clients={invoiceClients.map((client) => ({
				id: client.id,
				name: client.name,
				company: client.company,
			}))}
			invoices={invoiceDetails.flatMap((invoice) => {
				if (!invoice) return [];
				const overdue =
					invoice.status === "sent" &&
					invoice.dueAt !== null &&
					invoice.dueAt.getTime() < today.getTime();
				return [
					{
						id: invoice.id,
						number: invoice.number,
						status: invoice.status,
						displayStatus: overdue
							? ("overdue" as const)
							: invoice.status === "sent"
								? ("issued" as const)
								: invoice.status,
						clientId: invoice.clientId,
						clientName: invoice.clientName,
						clientEmail: invoice.clientEmail,
						clientCompany: invoice.clientCompany,
						currency: invoice.currency,
						subtotalCents: invoice.subtotalCents,
						taxCents: invoice.taxCents,
						totalCents: invoice.totalCents,
						notes: invoice.notes,
						dueDate: invoice.dueAt?.toISOString().slice(0, 10) ?? null,
						issuedAt: invoice.issuedAt?.toISOString() ?? null,
						paidAt: invoice.paidAt?.toISOString() ?? null,
						createdAt: invoice.createdAt.toISOString(),
						lineItems: invoice.lineItems.map((line) => ({
							id: line.id,
							description: line.description,
							quantity: line.quantity,
							unitPriceCents: line.unitPriceCents,
							position: line.position,
							sourceModule: line.sourceModule,
						})),
					},
				];
			})}
			defaultCurrency={invoicingSettings.defaultCurrency}
			defaultDueDate={defaultDueDate}
		/>
	);
}
