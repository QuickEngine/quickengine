import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RequestFailure } from "../components/page-state";
import { SkeletonRows } from "../components/skeletons";
import type { Integration } from "../lib/account-api";
import { accountQueries, useActiveOrganization } from "../lib/account-api";
import { clientEnv } from "../lib/env";

/**
 * Integrations — what this organization has connected, and whether it works.
 *
 * 🔑 Built as a CATALOG, not a list of payment providers. Categories are data
 * here, so adding shipping carriers, accounting or email is a new entry rather
 * than a rewrite of the page. Today only payments have anything to connect, so
 * only payments is shown — a grid of greyed-out logos for things that do not
 * exist yet is a brochure, not a control plane.
 *
 * 🔴 The status that matters is `connected`, not `status`. A provider can report
 * `active` while refusing to take a card; that combination looks healthy on a
 * badge and loses the sale. Anything not actually chargeable is called out.
 */

const openAction =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-3 text-[11px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.06)]";

const providerName = (id: string) =>
	({ stripe: "Stripe", paypal: "PayPal", square: "Square" })[id] ??
	id.charAt(0).toUpperCase() + id.slice(1);

/**
 * What is wrong, in the operator's terms, or null when nothing is.
 *
 * Deliberately one sentence naming the consequence rather than the field that is
 * false: "onboarding is unfinished" is a fact, "cannot take payments" is the
 * reason anybody cares.
 */
const problem = (integration: Integration): string | null => {
	if (integration.status === "disabled")
		return "The provider disabled this account. Payments cannot be taken.";
	if (integration.status === "restricted")
		return "The provider restricted this account, it usually wants more details before it will release money.";
	if (!integration.chargesEnabled)
		return "Onboarding is unfinished, so this workspace cannot take payments yet.";
	if (!integration.payoutsEnabled)
		return "Charges work, but payouts are still held while the provider finishes its review.";
	return null;
};

function IntegrationsPage() {
	const { active } = useActiveOrganization();
	const organizationId = active?.id ?? "";
	const integrations = useQuery(accountQueries.integrations(organizationId));
	const workspaces = useQuery(accountQueries.workspaces(organizationId));

	const items = integrations.data?.items ?? [];
	const byWorkspace = new Map<string, Integration[]>();
	for (const item of items) {
		byWorkspace.set(item.workspaceId, [
			...(byWorkspace.get(item.workspaceId) ?? []),
			item,
		]);
	}
	const activeWorkspaces = (workspaces.data?.items ?? []).filter(
		(workspace) => !workspace.archivedAt,
	);

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<p className="mb-5 max-w-2xl text-[11.5px] text-[var(--ink-30)] leading-5">
				Connections belong to a workspace, one business's payment account is not
				another's. This is every one of them in{" "}
				{active?.name ?? "this organization"}, and whether it currently works.
			</p>

			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Payments</p>

			{integrations.isPending || workspaces.isPending ? (
				<SkeletonRows rows={3} />
			) : integrations.isError ? (
				<RequestFailure
					error={integrations.error}
					onRetry={() => {
						void integrations.refetch();
					}}
				/>
			) : activeWorkspaces.length === 0 ? (
				<p className="py-6 text-[12px] text-[var(--ink-30)]">
					No workspaces to connect anything to yet.
				</p>
			) : (
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{activeWorkspaces.map((workspace) => {
						const connections = byWorkspace.get(workspace.id) ?? [];
						return (
							<div key={workspace.id} className="py-3">
								<div className="flex items-center gap-2">
									<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
										{workspace.name}
									</p>
									{workspace.environment === "test" ? (
										<span className="shrink-0 rounded-[3px] bg-[var(--signal-attention)]/[0.14] px-1.5 py-0.5 font-medium text-[9px] text-[var(--signal-attention-text)] uppercase tracking-[0.09em]">
											Test
										</span>
									) : null}
									<a
										href={`${clientEnv.DASH_URL}/${workspace.slug ?? workspace.id}/payments`}
										className={openAction}
									>
										Manage
									</a>
								</div>

								{/* 🔴 A workspace with no provider is the loudest state on this
								    page. It cannot take a single payment, and nothing else about
								    it being set up correctly changes that. */}
								{connections.length === 0 ? (
									<p className="mt-1.5 text-[11.5px] text-[var(--signal-attention-text)]">
										No payment provider connected, this workspace cannot take
										money.
									</p>
								) : (
									<div className="mt-2 flex flex-col gap-1.5">
										{connections.map((integration) => {
											const fault = problem(integration);
											return (
												<div
													key={`${integration.workspaceId}:${integration.provider}`}
													className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
												>
													<span
														aria-hidden="true"
														className={`size-1.5 shrink-0 rounded-full ${
															integration.connected
																? "bg-[var(--signal-success)]"
																: "bg-[var(--signal-attention)]"
														}`}
													/>
													<p className="text-[12px] text-[var(--ink-75)]">
														{providerName(integration.provider)}
													</p>
													<p className="text-[11px] text-[var(--ink-30)]">
														{integration.environment} ·{" "}
														{integration.isDefault
															? "used at checkout"
															: "connected, not default"}
													</p>
													{fault ? (
														<p className="w-full text-[11px] text-[var(--signal-attention-text)] leading-4">
															{fault}
														</p>
													) : null}
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</main>
	);
}

export const Route = createFileRoute("/integrations")({
	component: IntegrationsPage,
});
