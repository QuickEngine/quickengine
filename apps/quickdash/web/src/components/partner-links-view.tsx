import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { parseAmountCents } from "../lib/money-input";
import { useRecordSignals } from "../lib/record-signals";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, WriteFailure } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error names React internals rather
// than the missing import.
import { Choice, Text as TextField } from "./product-fields";

/**
 * Partner links — the codes creators and developers hand to their audience.
 *
 * ── Why this is not a new kind of discount ───────────────────────────────────
 *
 * 🔑 A partner link is a REFERRAL that happens to carry a discount. Referrals
 * already model an owner, attributed orders and accrued earnings, so reusing
 * them means checkout, order totals and every report over them need no new
 * concept — and the two can never disagree about what a code did.
 *
 * The link itself is `yoursite.com/<code>`, resolved at request time. Adding a
 * partner is a row here, never a deploy of the storefront.
 */

type PartnerLink = {
	id: string;
	code: string;
	ownerName: string;
	commissionBasisPoints: number | null;
	discountCode: string | null;
	totalReferrals: number;
	totalEarnedCents: number;
	active: boolean;
};

type Client = { id: string; name: string };
type Discount = { id: string; code: string };

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const money = (cents: number) =>
	new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: "USD",
	}).format(cents / 100);

export function PartnerLinksView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	// The dots come from the bell, so marking a notification read clears the row.
	const rowSignal = useRecordSignals(workspaceId);
	const statusFilter = useChipFilter();
	const queryClient = useQueryClient();
	const api = workspaceApi(workspaceId);

	const [creating, setCreating] = useState(false);
	const [search, setSearch] = useState("");
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	const [code, setCode] = useState("");
	const [owner, setOwner] = useState("");
	const [commission, setCommission] = useState("");
	const [discount, setDiscount] = useState("");

	const links = useQuery({
		queryKey: ["quickdash", workspaceId, "partner-links"],
		queryFn: async () =>
			(await api.request<{ items: PartnerLink[] }>("/partner-links")).data,
	});
	const clients = useQuery({
		queryKey: ["quickdash", workspaceId, "clients", "for-partners"],
		queryFn: async () =>
			(await api.request<{ items: Client[] }>("/clients?limit=100")).data,
	});
	const discounts = useQuery({
		queryKey: ["quickdash", workspaceId, "discounts"],
		queryFn: async () =>
			(await api.request<{ items: Discount[] }>("/discounts")).data,
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "partner-links"],
		});

	const create = useMutation({
		mutationFn: async () => {
			const chosen = (clients.data?.items ?? []).find(
				(client) => client.name === owner,
			);
			const chosenDiscount = (discounts.data?.items ?? []).find(
				(row) => row.code === discount,
			);
			await api.request("/partner-links", {
				method: "POST",
				body: {
					clientRecordId: chosen?.id,
					code: code.trim(),
					// 🔑 Typed as a percentage, stored as basis points — 7.5 becomes
					// 750, so no payout is ever rounded down by a float.
					commissionBasisPoints:
						commission.trim() === "" ? null : parseAmountCents(commission),
					discountId: chosenDiscount?.id ?? null,
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That link could not be created." }),
		onSuccess: () => {
			setCreating(false);
			setCode("");
			setOwner("");
			setCommission("");
			setDiscount("");
			refresh();
		},
	});

	const setActive = useMutation({
		mutationFn: async (input: { id: string; active: boolean }) => {
			await api.request(`/partner-links/${input.id}`, {
				method: "PATCH",
				body: { active: input.active },
			});
		},
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That link could not be changed." }),
		onSuccess: refresh,
	});

	useHeaderAction({
		label: "Add partner",
		onClick: () => setCreating((was) => !was),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{creating ? (
				<CreatePanel
					title="New partner"
					submitLabel="Add partner"
					busy={create.isPending}
					valid={code.trim().length >= 3 && owner.length > 0}
					blockedReason={"Give this link a code"}
					failure={failure}
					onClose={() => setCreating(false)}
					onSubmit={() => create.mutate()}
				>
					<TextField
						label="Code"
						hint="becomes the web address, so letters, numbers and hyphens only"
						value={code}
						onChange={setCode}
						placeholder="jordanreviews"
					/>
					{/* The partner is a client record, because that is what they are:
					    somebody the business has a relationship and contact details for. */}
					<Choice
						label="Partner"
						hint="add them under Clients first if they are not here"
						options={(clients.data?.items ?? [])
							.slice(0, 12)
							.map((c) => c.name)}
						value={owner}
						onChange={setOwner}
					/>
					<TextField
						label="Commission"
						hint="percent of the order subtotal, never of shipping or tax"
						value={commission}
						onChange={setCommission}
						placeholder="10"
					/>
					<Choice
						label="Visitor discount"
						hint="optional; the link still attributes the order without one"
						options={(discounts.data?.items ?? [])
							.slice(0, 12)
							.map((d) => d.code)}
						value={discount}
						onChange={setDiscount}
					/>
				</CreatePanel>
			) : null}

			<ListControls
				onClearFilter={() => statusFilter.clear()}
				filter={statusFilter.chips("State", ["active", "off"])}
				filterCount={statusFilter.count}
				exportRows={() => links.data?.items ?? []}
				exportName="partners"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search partners"
			/>

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<PageState
				query={links}
				loadingLabel="Loading partners…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No partners yet"
						detail="A partner link is a code somebody shares with their audience. Orders placed through it are credited to them, and you can give their audience a discount at the same time."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter(
						(link) =>
							statusFilter.keep(link.active ? "active" : "off") &&
							(!needle ||
								link.code.toLowerCase().includes(needle) ||
								link.ownerName.toLowerCase().includes(needle)),
					);
					return (
						<PagedTable
							rowSignal={rowSignal}
							empty={
								<EmptyState
									title="Nothing matches"
									detail="Try a different search."
								/>
							}
							workspaceId={workspaceId}
							layout={layout}
							caption="Partners"
							rows={rows}
							columns={[
								{
									key: "code",
									header: "Link",
									render: (link) => (
										<code className="font-mono text-[11.5px] text-[var(--ink-85)]">
											/{link.code.toLowerCase()}
										</code>
									),
								},
								{
									key: "owner",
									header: "Partner",
									render: (link) => link.ownerName,
								},
								{
									key: "commission",
									header: "Commission",
									width: "w-28",
									tight: true,
									render: (link) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{link.commissionBasisPoints
												? `${link.commissionBasisPoints / 100}%`
												: "-"}
										</span>
									),
								},
								{
									key: "orders",
									header: "Orders",
									width: "w-20",
									tight: true,
									render: (link) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{link.totalReferrals}
										</span>
									),
								},
								{
									key: "earned",
									header: "Owed",
									width: "w-24",
									tight: true,
									render: (link) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{money(link.totalEarnedCents)}
										</span>
									),
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (link) => (
										<button
											type="button"
											className={quiet}
											disabled={setActive.isPending}
											onClick={() =>
												setActive.mutate({
													id: link.id,
													active: !link.active,
												})
											}
										>
											{link.active ? "Retire" : "Restore"}
										</button>
									),
								},
							]}
						/>
					);
				}}
			</PageState>
		</main>
	);
}
