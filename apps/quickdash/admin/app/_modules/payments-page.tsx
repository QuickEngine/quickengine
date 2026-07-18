import { listClientRecords } from "@quickengine/mod-client-records";
import { listInvoices } from "@quickengine/mod-invoicing";
import {
	getPayment,
	listPayments,
	paymentsSettingsSchema,
} from "@quickengine/mod-payments";
import { PaymentsView } from "../_components/payments-view";
import type { ModulePageProps } from "./types";

export default async function PaymentsPage({
	workspaceId,
	settings,
}: ModulePageProps) {
	const paymentsSettings = paymentsSettingsSchema.parse(settings);
	const paymentRows = await listPayments(workspaceId);
	const paymentDetails = await Promise.all(
		paymentRows.map((payment) => getPayment(workspaceId, payment.id)),
	);
	const paymentInvoices = await listInvoices(workspaceId);
	const paymentClients = await listClientRecords(workspaceId);
	return (
		<PaymentsView
			workspaceId={workspaceId}
			defaultCurrency={paymentsSettings.defaultCurrency}
			clients={paymentClients.map((client) => ({
				id: client.id,
				name: client.name,
				company: client.company,
			}))}
			invoices={paymentInvoices
				.filter(
					(invoice) => invoice.status === "sent" || invoice.status === "paid",
				)
				.map((invoice) => {
					const related = paymentDetails.flatMap((payment) =>
						payment?.invoiceId === invoice.id ? [payment] : [],
					);
					const collected = related
						.filter((payment) =>
							["succeeded", "refunded"].includes(payment.status),
						)
						.reduce((total, payment) => total + payment.amountCents, 0);
					const refunded = related.reduce(
						(total, payment) =>
							total +
							payment.refunds.reduce(
								(sum, refund) => sum + refund.amountCents,
								0,
							),
						0,
					);
					return {
						id: invoice.id,
						number: invoice.number,
						clientId: invoice.clientId,
						clientName: invoice.clientName,
						currency: invoice.currency,
						totalCents: invoice.totalCents,
						netPaidCents: collected - refunded,
					};
				})
				.filter((invoice) => invoice.netPaidCents < invoice.totalCents)}
			payments={paymentDetails.flatMap((payment) => {
				if (!payment) return [];
				const invoice = paymentInvoices.find(
					(item) => item.id === payment.invoiceId,
				);
				return [
					{
						id: payment.id,
						invoiceId: payment.invoiceId,
						invoiceNumber: invoice?.number ?? null,
						clientName: payment.clientName,
						clientCompany: payment.clientCompany,
						amountCents: payment.amountCents,
						refundedCents: payment.refunds.reduce(
							(sum, refund) => sum + refund.amountCents,
							0,
						),
						currency: payment.currency,
						status: payment.status,
						provider: payment.provider,
						paymentMethod: payment.paymentMethod,
						reference: payment.reference,
						notes: payment.notes,
						createdAt: payment.createdAt.toISOString(),
						refunds: payment.refunds.map((refund) => ({
							id: refund.id,
							amountCents: refund.amountCents,
							reason: refund.reason,
							createdAt: refund.createdAt.toISOString(),
						})),
					},
				];
			})}
		/>
	);
}
