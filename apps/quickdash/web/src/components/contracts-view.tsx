import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { FilterChip, ListControls } from "./list-controls";
import { EmptyState, PageState } from "./page-state";

/**
 * Contracts — agreements sent for signature.
 *
 * 🔴 A sent contract is never edited. Changing terms somebody is looking at, or
 * has already signed, would make the signature meaningless — so the only way to
 * change one is to REVISE it, which supersedes the old version and leaves both
 * on the record.
 *
 * 🔑 `partially_signed` is shown as itself. With two signers, one having signed
 * is a materially different state from nobody having signed, and it is usually
 * the state where somebody needs chasing.
 */

const STATUSES = [
	"draft",
	"sent",
	"partially_signed",
	"completed",
	"declined",
	"expired",
	"voided",
	"superseded",
] as const;

type Contract = {
	id: string;
	number: string;
	title: string;
	status: string;
	clientName: string;
	sentAt: string | null;
	completedAt: string | null;
	expiresAt: string | null;
	createdAt: string;
};

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const readable = (value: string) => value.replace(/_/g, " ");

/** Waiting on a signature, and past the date it was meant to be done. */
const isLapsed = (contract: Contract) =>
	Boolean(
		contract.expiresAt &&
			new Date(contract.expiresAt).getTime() < Date.now() &&
			(contract.status === "sent" || contract.status === "partially_signed"),
	);

export function ContractsView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [failure, setFailure] = useState<string | null>(null);

	const contracts = useQuery({
		queryKey: ["quickdash", workspaceId, "contracts"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Contract[] }>(
					"/contracts?limit=100",
				)
			).data,
	});

	const act = useMutation({
		mutationFn: async (input: {
			id: string;
			action: "send" | "void" | "revise";
		}) => {
			await workspaceApi(workspaceId).request(
				`/contracts/${input.id}/${input.action}`,
				{ method: "POST", idempotencyKey: crypto.randomUUID() },
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That did not save."),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "contracts"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search contracts by title, number or customer"
				filterCount={statuses.length}
				filter={
					<>
						<p className="mb-2 text-[11px] text-[var(--ink-45)]">Status</p>
						<div className="flex flex-wrap gap-1.5">
							{STATUSES.map((status) => (
								<FilterChip
									key={status}
									label={readable(status)}
									active={statuses.includes(status)}
									onToggle={() =>
										setStatuses(
											statuses.includes(status)
												? statuses.filter((value) => value !== status)
												: [...statuses, status],
										)
									}
								/>
							))}
						</div>
					</>
				}
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

			<PageState
				query={contracts}
				loadingLabel="Loading contracts…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No contracts"
						detail="An agreement you send for signature. Once signed it is fixed; changing it means issuing a revision."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((contract) =>
							statuses.length === 0 ? true : statuses.includes(contract.status),
						)
						.filter(
							(contract) =>
								!needle ||
								contract.title.toLowerCase().includes(needle) ||
								contract.number.toLowerCase().includes(needle) ||
								contract.clientName.toLowerCase().includes(needle),
						);

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						);
					}

					const awaiting = rows.filter(
						(contract) =>
							contract.status === "sent" ||
							contract.status === "partially_signed",
					).length;

					return (
						<>
							{awaiting > 0 ? (
								<p className="mb-3 text-[11.5px] text-[var(--ink-30)]">
									{awaiting} waiting on a signature.
								</p>
							) : null}
							<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
								{rows.map((contract) => {
									const lapsed = isLapsed(contract);
									return (
										<div
											key={contract.id}
											className="flex items-center gap-3 py-2.5"
										>
											<span className="w-24 shrink-0 font-mono text-[11.5px] text-[var(--ink-60)]">
												{contract.number}
											</span>
											<div className="min-w-0 flex-1">
												<p className="truncate text-[12.5px] text-[var(--ink-85)]">
													{contract.title}
												</p>
												<p className="truncate text-[11px] text-[var(--ink-30)]">
													{contract.clientName}
												</p>
											</div>
											<span
												className={`w-32 shrink-0 text-[11px] capitalize ${
													lapsed ? "text-[#f5b44a]" : "text-[var(--ink-30)]"
												}`}
											>
												{lapsed ? "expired" : readable(contract.status)}
											</span>
											<div className="flex shrink-0 items-center gap-1.5">
												{contract.status === "draft" ? (
													<button
														type="button"
														className={quiet}
														disabled={act.isPending}
														onClick={() =>
															act.mutate({ id: contract.id, action: "send" })
														}
													>
														Send
													</button>
												) : null}
												{contract.status === "sent" ||
												contract.status === "partially_signed" ? (
													<>
														{/* Revise rather than edit: the old version is
														    superseded and stays on the record. */}
														<button
															type="button"
															className={quiet}
															disabled={act.isPending}
															onClick={() =>
																act.mutate({
																	id: contract.id,
																	action: "revise",
																})
															}
														>
															Revise
														</button>
														<button
															type="button"
															className={quiet}
															disabled={act.isPending}
															onClick={() =>
																act.mutate({ id: contract.id, action: "void" })
															}
														>
															Void
														</button>
													</>
												) : null}
											</div>
										</div>
									);
								})}
							</div>
						</>
					);
				}}
			</PageState>
		</main>
	);
}
