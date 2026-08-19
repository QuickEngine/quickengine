import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { parseAmount } from "../lib/money-input";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, rowBusy, WriteFailure } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error that produces names React
// internals rather than the missing import.
import { Choice, Text as TextField } from "./product-fields";

/**
 * Discount codes — money deliberately given away.
 *
 * 🔴 The value is stored in BASIS POINTS for a percentage and minor units for a
 * fixed amount, in one column, because a discount is never both at once. This
 * page shows and accepts human numbers — 20 means 20% — and converts at the
 * edge. Getting that backwards turns a 20% code into 0.2%, which a migration
 * from another system has already had to be careful about.
 */

type Discount = {
	id: string;
	name: string;
	code: string;
	valueType: "percentage" | "fixed";
	value: number;
	minimumSubtotalCents: number;
	maxRedemptions: number | null;
	timesRedeemed: number;
	startsAt: string | null;
	endsAt: string | null;
	active: boolean;
};

const _pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const _field =
	"h-9 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

/** What a person reads. 2000 basis points is "20% off"; 500 minor units is "$5 off". */
const describe = (discount: Discount) =>
	discount.valueType === "percentage"
		? `${discount.value / 100}% off`
		: `${new Intl.NumberFormat(undefined, {
				style: "currency",
				currency: "USD",
			}).format(discount.value / 100)} off`;

/**
 * Whether a code would actually apply right now.
 *
 * 🔑 "Active" is not the whole answer — a code can be active and still refuse
 * every customer because it has not started, has expired, or is used up. An
 * operator wondering "why isn't my code working" is asking about THIS, and a
 * bare on/off toggle cannot tell them.
 */
function liveness(discount: Discount): { label: string; muted: boolean } {
	if (!discount.active) return { label: "Off", muted: true };
	const now = Date.now();
	if (discount.startsAt && new Date(discount.startsAt).getTime() > now) {
		return { label: "Not started", muted: true };
	}
	if (discount.endsAt && new Date(discount.endsAt).getTime() <= now) {
		return { label: "Expired", muted: true };
	}
	if (
		discount.maxRedemptions !== null &&
		discount.timesRedeemed >= discount.maxRedemptions
	) {
		return { label: "Used up", muted: true };
	}
	return { label: "Live", muted: false };
}

export function DiscountsView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const queryClient = useQueryClient();
	const [creating, setCreating] = useState(false);
	const [code, setCode] = useState("");
	const [amount, setAmount] = useState("");
	const [valueType, setValueType] = useState<"percentage" | "fixed">(
		"percentage",
	);
	const [failure, setFailure] = useState<string | null>(null);
	const [search, setSearch] = useState("");

	const discounts = useQuery({
		queryKey: ["quickdash", workspaceId, "discounts"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Discount[] }>(
					"/discounts",
				)
			).data,
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "discounts"],
		});

	const create = useMutation({
		mutationFn: async () => {
			// 🔴 Tolerant of what people actually type. `Number("$5.00")` and
			// `Number("15%")` are both NaN, and the only symptom was a create
			// button that stayed dead with nothing on screen explaining why.
			const entered = parseAmount(amount) ?? 0;
			await workspaceApi(workspaceId).request("/discounts", {
				method: "POST",
				body: {
					name: code.trim().toUpperCase(),
					code: code.trim().toUpperCase(),
					valueType,
					// 🔴 Converted here, once. 20 becomes 2000 basis points; $5.00
					// becomes 500 minor units. Both are "× 100", which is a coincidence
					// worth naming rather than relying on.
					value: Math.round(entered * 100),
					active: true,
				},
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That code could not be created."),
		onSuccess: () => {
			setCreating(false);
			setCode("");
			setAmount("");
			refresh();
		},
	});

	// Every page's create lives in the header, in the same place. It REVEALS
	// the form rather than submitting it: the fields belong together, and a
	// submit button parted from its inputs is a button that does nothing
	// visible.
	useHeaderAction({
		label: "New discount",
		onClick: () => setCreating((open) => !open),
	});

	const setActive = useMutation({
		mutationFn: async (input: { id: string; active: boolean }) => {
			await workspaceApi(workspaceId).request(`/discounts/${input.id}`, {
				method: "PATCH",
				body: { active: input.active },
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That change did not save."),
		onSuccess: refresh,
	});

	const valid = code.trim().length >= 3 && (parseAmount(amount) ?? 0) > 0;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{creating ? (
				<CreatePanel
					title="New discount"
					submitLabel="Create code"
					busy={create.isPending}
					valid={Boolean(valid)}
					failure={failure}
					onClose={() => setCreating(false)}
					onSubmit={() => create.mutate()}
				>
					<TextField
						label="Code"
						hint="what a shopper types at checkout"
						value={code}
						onChange={(value) => setCode(value.toUpperCase())}
						placeholder="WELCOME10"
					/>
					<Choice
						label="Kind"
						options={["percentage", "fixed"]}
						value={valueType}
						onChange={(value) => setValueType(value as "percentage" | "fixed")}
					/>
					<TextField
						label="Amount"
						hint={valueType === "percentage" ? "percent off" : "off the total"}
						value={amount}
						onChange={setAmount}
						placeholder={valueType === "percentage" ? "20" : "5.00"}
						inputMode="decimal"
					/>
				</CreatePanel>
			) : null}

			<ListControls
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search codes"
			/>

			{failure ? <WriteFailure message={failure} /> : null}

			<PageState
				query={discounts}
				loadingLabel="Loading codes…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No discount codes"
						detail="Create one above and customers can enter it at checkout. The cart total goes down; prices never change."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter(
						(discount) =>
							!needle ||
							discount.code.toLowerCase().includes(needle) ||
							discount.name.toLowerCase().includes(needle),
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
							workspaceId={workspaceId}
							layout={layout}
							caption="Discount codes"
							rows={rows}
							columns={[
								{
									key: "code",
									header: "Code",
									width: "w-32",
									tight: true,
									render: (discount) => (
										<span className="font-mono text-[12px] text-[var(--ink-85)]">
											{discount.code}
										</span>
									),
								},
								{
									key: "offer",
									header: "Offer",
									render: (discount) => (
										<span className="text-[12px] text-[var(--ink-60)]">
											{describe(discount)}
											{discount.minimumSubtotalCents > 0
												? ` · over ${new Intl.NumberFormat(undefined, {
														style: "currency",
														currency: "USD",
													}).format(discount.minimumSubtotalCents / 100)}`
												: ""}
										</span>
									),
								},
								{
									key: "used",
									header: "Used",
									width: "w-24",
									align: "right",
									tight: true,
									render: (discount) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{discount.timesRedeemed}
											{discount.maxRedemptions !== null
												? ` / ${discount.maxRedemptions}`
												: ""}
										</span>
									),
								},
								{
									key: "state",
									header: "State",
									width: "w-28",
									tight: true,
									render: (discount) => {
										const state = liveness(discount);
										return (
											<span
												className={`rounded-full px-2 py-0.5 text-[10.5px] ${
													state.muted
														? "bg-[rgb(var(--console-ink)/0.04)] text-[var(--ink-30)]"
														: "bg-[rgb(var(--console-ink)/0.08)] text-[var(--ink-70)]"
												}`}
											>
												{state.label}
											</span>
										);
									},
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (discount) => (
										<button
											type="button"
											className={quiet}
											disabled={rowBusy(setActive, discount.id)}
											onClick={() =>
												setActive.mutate({
													id: discount.id,
													active: !discount.active,
												})
											}
										>
											{discount.active ? "Turn off" : "Turn on"}
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
