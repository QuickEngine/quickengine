import { getSession } from "@quickengine/auth/server";
import {
	clientRecordsSettingsSchema,
	listClientRecords,
} from "@quickengine/mod-client-records";
import {
	getInvoice,
	invoicingSettingsSchema,
	listInvoices,
} from "@quickengine/mod-invoicing";
import {
	getPayment,
	listPayments,
	paymentsSettingsSchema,
} from "@quickengine/mod-payments";
import { Badge } from "@quickengine/ui/components/ui/badge";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ClientRecordsView } from "../../_components/client-records-view";
import { InvoicesView } from "../../_components/invoices-view";
import { ModuleIcon } from "../../_components/module-icon";
import { PaymentsView } from "../../_components/payments-view";
import { getModuleNavigation } from "../../_lib/module-navigation";
import { requireWorkspaceAccess } from "../../_lib/workspace-access";

export default async function Page({
	params,
}: {
	params: Promise<{ workspace: string; module: string }>;
}) {
	const session = await getSession(await headers());
	if (!session) {
		return null;
	}
	const { workspace: workspaceId, module: moduleId } = await params;
	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) {
		notFound();
	}
	const enabledModule = access.modules.find((module) => module.id === moduleId);
	const navigation = getModuleNavigation(moduleId);
	if (!enabledModule || !navigation) {
		notFound();
	}
	const clientRecords =
		moduleId === "client-records"
			? await listClientRecords(access.workspace.id)
			: null;
	const clientSettings =
		moduleId === "client-records"
			? clientRecordsSettingsSchema.parse(enabledModule.settings)
			: null;
	const invoicingSettings =
		moduleId === "invoicing"
			? invoicingSettingsSchema.parse(enabledModule.settings)
			: null;
	const invoiceRows =
		moduleId === "invoicing" ? await listInvoices(access.workspace.id) : null;
	const invoiceDetails = invoiceRows
		? await Promise.all(
				invoiceRows.map((invoice) =>
					getInvoice(access.workspace.id, invoice.id),
				),
			)
		: null;
	const invoiceClients =
		moduleId === "invoicing"
			? await listClientRecords(access.workspace.id)
			: null;
	const paymentsSettings =
		moduleId === "payments"
			? paymentsSettingsSchema.parse(enabledModule.settings)
			: null;
	const paymentRows =
		moduleId === "payments" ? await listPayments(access.workspace.id) : null;
	const paymentDetails = paymentRows
		? await Promise.all(
				paymentRows.map((payment) =>
					getPayment(access.workspace.id, payment.id),
				),
			)
		: null;
	const paymentInvoices =
		moduleId === "payments" ? await listInvoices(access.workspace.id) : null;
	const paymentClients =
		moduleId === "payments"
			? await listClientRecords(access.workspace.id)
			: null;
	const today = new Date();
	const defaultDueDate = invoicingSettings
		? new Date(
				today.getTime() + invoicingSettings.defaultDueInDays * 86_400_000,
			)
				.toISOString()
				.slice(0, 10)
		: "";
	return (
		<main className="p-6">
			<div className="flex items-start gap-4">
				<div className="flex size-11 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.04]">
					<ModuleIcon id={moduleId} className="size-5" />
				</div>
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="font-semibold text-2xl">{navigation.label}</h1>
						<Badge variant="secondary">Enabled</Badge>
					</div>
					<p className="mt-2 text-muted-foreground text-sm">
						{enabledModule.description}
					</p>
				</div>
			</div>
			{clientRecords && clientSettings ? (
				<ClientRecordsView
					workspaceId={access.workspace.id}
					records={clientRecords.map((record) => ({
						id: record.id,
						name: record.name,
						email: record.email,
						phone: record.phone,
						company: record.company,
						notes: record.notes,
						createdAt: record.createdAt.toISOString(),
					}))}
					labelSingular={clientSettings.recordLabelSingular}
					labelPlural={clientSettings.recordLabelPlural}
					fields={clientSettings.fields}
				/>
			) : invoiceDetails && invoiceClients && invoicingSettings ? (
				<InvoicesView
					workspaceId={access.workspace.id}
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
			) : paymentDetails &&
				paymentInvoices &&
				paymentClients &&
				paymentsSettings ? (
				<PaymentsView
					workspaceId={access.workspace.id}
					defaultCurrency={paymentsSettings.defaultCurrency}
					clients={paymentClients.map((client) => ({
						id: client.id,
						name: client.name,
						company: client.company,
					}))}
					invoices={paymentInvoices
						.filter(
							(invoice) =>
								invoice.status === "sent" || invoice.status === "paid",
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
			) : (
				<section className="mt-8 rounded-xl border border-dashed p-8">
					<h2 className="font-medium">Module connected</h2>
					<p className="mt-2 max-w-xl text-muted-foreground text-sm">
						QuickDash resolved this module from the workspace registry and
						enforced workspace ownership before rendering it. Its operational
						interface is the next layer to build.
					</p>
				</section>
			)}
		</main>
	);
}
