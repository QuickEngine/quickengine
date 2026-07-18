import { listClientRecords } from "@quickengine/mod-client-records";
import {
	fulfillmentSettingsSchema,
	listFulfillments,
} from "@quickengine/mod-fulfillment";
import { listInvoices } from "@quickengine/mod-invoicing";
import { FulfillmentsView } from "../_components/fulfillments-view";
import type { ModulePageProps } from "./types";

export default async function FulfillmentPage({
	workspaceId,
	settings,
	today,
}: ModulePageProps) {
	const fulfillmentSettings = fulfillmentSettingsSchema.parse(settings);
	const fulfillmentRows = await listFulfillments(workspaceId);
	const fulfillmentInvoices = await listInvoices(workspaceId);
	const fulfillmentClients = await listClientRecords(workspaceId);
	return (
		<FulfillmentsView
			workspaceId={workspaceId}
			defaultKind={fulfillmentSettings.defaultKind}
			completionLabel={fulfillmentSettings.completionLabel}
			clients={fulfillmentClients.map((client) => ({
				id: client.id,
				name: client.name,
				company: client.company,
			}))}
			invoices={fulfillmentInvoices
				.filter(
					(invoice) =>
						invoice.status === "paid" &&
						!fulfillmentRows.some(
							(item) =>
								item.sourceModule === "invoicing" &&
								item.sourceRecordId === invoice.id,
						),
				)
				.map((invoice) => ({
					id: invoice.id,
					number: invoice.number,
					clientId: invoice.clientId,
					clientName: invoice.clientName,
				}))}
			fulfillments={fulfillmentRows.map((item) => {
				const overdue =
					(item.status === "pending" || item.status === "in_progress") &&
					item.dueAt !== null &&
					item.dueAt.getTime() < today.getTime();
				return {
					id: item.id,
					title: item.title,
					kind: item.kind,
					status: item.status,
					displayStatus: overdue ? ("overdue" as const) : item.status,
					clientName: item.clientName,
					clientCompany: item.clientCompany,
					invoiceNumber: item.invoiceNumber,
					instructions: item.instructions,
					dueDate: item.dueAt?.toISOString().slice(0, 10) ?? null,
					fulfilledAt: item.fulfilledAt?.toISOString() ?? null,
					createdAt: item.createdAt.toISOString(),
				};
			})}
		/>
	);
}
