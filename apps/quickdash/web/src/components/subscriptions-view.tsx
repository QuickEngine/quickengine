import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { isAmount, parseAmountCents } from "../lib/money-input";
import { BulkDelete } from "./bulk-delete";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, WriteFailure } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`.
import { Choice, Text as TextField } from "./product-fields";

/**
 * Subscriptions — a customer paying this business again and again.
 *
 * 🔴 Not to be confused with the workspace's own QuickDash plan. That one is
 * QuickEngine billing this business; this is the business billing its customers,
 * on its own payment account, and QuickEngine takes no cut of it.
 *
 * ⚠️ Cancelling stops FUTURE cycles and never touches orders already placed. A
 * subscription is an agreement about what happens next; rewriting the past would
 * remove revenue that was genuinely earned.
 */

type Plan = {
	id: string;
	name: string;
	interval: "week" | "month" | "year";
	intervalCount: number;
	priceCents: number;
	currency: string;
	items: Array<{ name: string; quantity: number }>;
};

type Subscription = {
	id: string;
	status: string;
	planName: string;
	priceCents: number;
	currency: string;
	interval: string;
	intervalCount: number;
	nextRenewalAt: string | null;
	failedAttempts: number;
};

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const money = (cents: number, currency: string) =>
	new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
		cents / 100,
	);

const every = (count: number, interval: string) =>
	count === 1 ? `every ${interval}` : `every ${count} ${interval}s`;

/**
 * 🔑 Only `past_due` and `cancelled` earn a colour. A healthy subscription is
 * the overwhelming majority, and colouring those too would make the page a wash
 * of green that nobody scans.
 */
const STATUS_TONE: Record<string, string | undefined> = {
	past_due: "var(--signal-attention)",
	cancelled: "var(--signal-failure)",
};

export function SubscriptionsView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const statusFilter = useChipFilter();
	const queryClient = useQueryClient();
	const api = workspaceApi(workspaceId);

	const [creating, setCreating] = useState(false);
	const [search, setSearch] = useState("");
	const [failure, setFailure] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [interval, setInterval] = useState("month");
	const [price, setPrice] = useState("");
	const [product, setProduct] = useState("");

	const subscriptions = useQuery({
		queryKey: ["quickdash", workspaceId, "subscriptions"],
		queryFn: async () =>
			(await api.request<{ items: Subscription[] }>("/subscriptions")).data,
	});
	const plans = useQuery({
		queryKey: ["quickdash", workspaceId, "subscription-plans"],
		queryFn: async () =>
			(await api.request<{ items: Plan[] }>("/subscription-plans")).data,
	});
	const catalog = useQuery({
		queryKey: ["quickdash", workspaceId, "catalog", "for-plans"],
		queryFn: async () =>
			(
				await api.request<{ items: Array<{ id: string; name: string }> }>(
					"/catalog?limit=100",
				)
			).data,
	});

	const refresh = () => {
		void queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "subscriptions"],
		});
		void queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "subscription-plans"],
		});
	};

	const createPlan = useMutation({
		mutationFn: async () => {
			const chosen = (catalog.data?.items ?? []).find(
				(item) => item.name === product,
			);
			await api.request("/subscription-plans", {
				method: "POST",
				body: {
					name: name.trim(),
					interval,
					intervalCount: 1,
					/**
					 * Typed in currency units; stored as integer cents like all money.
					 *
					 * ⚠️ Throws rather than falling back to zero. The button cannot be
					 * pressed with an unparseable price, so reaching here with one is a
					 * bug — and a free subscription is far worse than a failed save.
					 */
					priceCents: (() => {
						const cents = parseAmountCents(price);
						if (cents === null) throw new Error("That price is not a number.");
						return cents;
					})(),
					items: chosen ? [{ catalogItemId: chosen.id, quantity: 1 }] : [],
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That plan could not be created."),
		onSuccess: () => {
			setCreating(false);
			setName("");
			setPrice("");
			setProduct("");
			refresh();
		},
	});

	const setStatus = useMutation({
		mutationFn: async (input: { id: string; status: string }) => {
			await api.request(`/subscriptions/${input.id}`, {
				method: "PATCH",
				body: { status: input.status },
			});
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That could not be changed."),
		onSuccess: refresh,
	});

	useHeaderAction({
		label: "Add plan",
		onClick: () => setCreating((was) => !was),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{creating ? (
				<CreatePanel
					title="New subscription plan"
					submitLabel="Offer plan"
					busy={createPlan.isPending}
					/**
					 * 🔴 `isAmount`, not "is not empty".
					 *
					 * A price of `abc` parsed to null, fell through to `?? 0`, and
					 * created a plan that charges NOTHING — silently, with no error and
					 * no way to tell from the list. Every renewal of it would bill the
					 * customer zero forever.
					 */
					valid={name.trim().length > 0 && isAmount(price) && !!product}
					failure={failure}
					onClose={() => setCreating(false)}
					onSubmit={() => createPlan.mutate()}
				>
					<TextField
						label="Name"
						hint="what a shopper sees"
						value={name}
						onChange={setName}
						placeholder="Studio essentials"
					/>
					<Choice
						label="Billed"
						options={["week", "month", "year"]}
						value={interval}
						onChange={setInterval}
					/>
					<TextField
						label="Price each time"
						value={price}
						onChange={setPrice}
						placeholder="22.00"
					/>
					{/* One product for now; the box can hold several and the API accepts
					    them, but a single choice is what a first plan needs. */}
					<Choice
						label="What is in it"
						options={(catalog.data?.items ?? [])
							.slice(0, 12)
							.map((item) => item.name)}
						value={product}
						onChange={setProduct}
					/>
				</CreatePanel>
			) : null}

			<ListControls
				filter={statusFilter.chips("Status", [
					"active",
					"past_due",
					"cancelled",
					"paused",
				])}
				filterCount={statusFilter.count}
				exportRows={() => subscriptions.data?.items ?? []}
				exportName="subscription-plans"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search subscriptions"
			/>

			{failure ? <WriteFailure message={failure} /> : null}

			{/* Plans are the OFFER, subscriptions are who took it. Both belong here:
			    a page of subscriptions with no way to see what is on sale sends
			    somebody hunting through another module. */}
			{(plans.data?.items ?? []).length > 0 ? (
				<div className="mb-4 flex flex-wrap gap-2">
					{(plans.data?.items ?? []).map((plan) => (
						<span
							key={plan.id}
							className="rounded-full border border-[var(--console-line-strong)] px-2.5 py-1 text-[11px] text-[var(--ink-50)]"
						>
							{plan.name} · {money(plan.priceCents, plan.currency)}{" "}
							{every(plan.intervalCount, plan.interval)}
						</span>
					))}
				</div>
			) : null}

			<PageState
				query={subscriptions}
				loadingLabel="Loading subscriptions…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nobody is subscribed yet"
						detail="Offer a plan and it appears on your shop. Each time one renews it places an ordinary order, so stock, fulfilment and shipping work exactly as they do for a one off sale."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter(
						(row) =>
							statusFilter.keep(row.status) &&
							(!needle ||
								row.planName.toLowerCase().includes(needle) ||
								row.status.includes(needle)),
					);
					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search."
							/>
						);
					}
					return (
						<PagedTable
							exportName="plans"
							bulkActions={(chosen) => (
								<BulkDelete
									workspaceId={workspaceId}
									rows={chosen}
									path="/subscription-plans"
									noun="plans"
									invalidate={["quickdash", workspaceId, "subscriptions"]}
								/>
							)}
							workspaceId={workspaceId}
							layout={layout}
							caption="Subscriptions"
							rows={rows}
							rowSignal={(row) =>
								row.status === "past_due"
									? "attention"
									: row.status === "cancelled"
										? "failure"
										: null
							}
							columns={[
								{
									key: "plan",
									header: "Plan",
									render: (row) => row.planName,
								},
								{
									key: "status",
									header: "Status",
									width: "w-32",
									tight: true,
									render: (row) => (
										<span
											className="text-[11px] capitalize"
											style={{
												color: STATUS_TONE[row.status] ?? "var(--ink-30)",
											}}
										>
											{row.status.replace("_", " ")}
											{row.failedAttempts > 0
												? ` · ${row.failedAttempts} failed`
												: ""}
										</span>
									),
								},
								{
									key: "amount",
									header: "Amount",
									width: "w-32",
									tight: true,
									render: (row) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{money(row.priceCents, row.currency)}{" "}
											{every(row.intervalCount, row.interval)}
										</span>
									),
								},
								{
									key: "next",
									header: "Next",
									width: "w-28",
									tight: true,
									render: (row) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{row.nextRenewalAt
												? new Date(row.nextRenewalAt).toLocaleDateString()
												: "—"}
										</span>
									),
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (row) =>
										row.status === "cancelled" ? null : (
											<div className="flex justify-end gap-1.5">
												<button
													type="button"
													className={quiet}
													disabled={setStatus.isPending}
													onClick={() =>
														setStatus.mutate({
															id: row.id,
															status:
																row.status === "paused" ? "active" : "paused",
														})
													}
												>
													{row.status === "paused" ? "Resume" : "Pause"}
												</button>
												<button
													type="button"
													className={quiet}
													disabled={setStatus.isPending}
													onClick={() =>
														setStatus.mutate({
															id: row.id,
															status: "cancelled",
														})
													}
												>
													Cancel
												</button>
											</div>
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
