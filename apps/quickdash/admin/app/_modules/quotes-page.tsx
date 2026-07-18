import { listClientRecords } from "@quickengine/mod-client-records";
import {
	getQuoteEstimate,
	listQuoteEstimates,
	quotesEstimatesSettingsSchema,
} from "@quickengine/mod-quotes-estimates";
import { QuotesView } from "../_components/quotes-view";
import type { ModulePageProps } from "./types";

export default async function QuotesPage({
	workspaceId,
	settings,
	today,
}: ModulePageProps) {
	const quotesSettings = quotesEstimatesSettingsSchema.parse(settings);
	const quoteRows = await listQuoteEstimates(workspaceId);
	const quoteDetails = await Promise.all(
		quoteRows.map((quote) => getQuoteEstimate(workspaceId, quote.id)),
	);
	const quoteClients = await listClientRecords(workspaceId);
	const todayString = today.toISOString().slice(0, 10);
	const defaultValidUntil = new Date(
		today.getTime() + quotesSettings.defaultValidityDays * 86_400_000,
	)
		.toISOString()
		.slice(0, 10);
	return (
		<QuotesView
			workspaceId={workspaceId}
			defaultCurrency={quotesSettings.defaultCurrency}
			defaultValidUntil={defaultValidUntil}
			today={todayString}
			clients={quoteClients.map((client) => ({
				id: client.id,
				name: client.name,
				company: client.company,
			}))}
			quotes={quoteDetails.flatMap((quote) => {
				if (!quote) return [];
				return [
					{
						id: quote.id,
						number: quote.number,
						kind: quote.kind,
						status: quote.status,
						title: quote.title,
						clientId: quote.clientId,
						clientName: quote.clientName,
						clientEmail: quote.clientEmail,
						clientCompany: quote.clientCompany,
						currency: quote.currency,
						subtotalCents: quote.subtotalCents,
						taxCents: quote.taxCents,
						totalCents: quote.totalCents,
						validUntil: quote.validUntil,
						notes: quote.notes,
						terms: quote.terms,
						acceptedByName: quote.acceptedByName,
						acceptedByEmail: quote.acceptedByEmail,
						acceptanceNote: quote.acceptanceNote,
						convertedInvoiceId: quote.convertedInvoiceId,
						convertedOrderId: quote.convertedOrderId,
						revision: quote.revision,
						createdAt: quote.createdAt.toISOString(),
						lines: quote.lines.map((line) => ({
							id: line.id,
							name: line.name,
							description: line.description,
							quantity: String(line.quantity),
							unitPriceCents: line.unitPriceCents,
							lineTotalCents: line.lineTotalCents,
							position: line.position,
						})),
					},
				];
			})}
		/>
	);
}
