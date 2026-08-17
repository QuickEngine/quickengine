import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { ListControls } from "./list-controls";
import { EmptyState, PageState, rowBusy } from "./page-state";

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

const pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const field =
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
	const queryClient = useQueryClient();
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
			const entered = Number(amount);
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
			setCode("");
			setAmount("");
			refresh();
		},
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

	const valid = code.trim().length >= 3 && Number(amount) > 0;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<form
				className="mb-4 flex flex-wrap items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (valid) create.mutate();
				}}
			>
				<input
					value={code}
					onChange={(event) => setCode(event.target.value)}
					placeholder="CODE"
					className={`${field} w-40 font-mono uppercase`}
				/>
				<div className="flex h-9 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink)/0.07)] p-0.5">
					{(
						[
							["percentage", "%"],
							["fixed", "$"],
						] as const
					).map(([option, glyph]) => (
						<button
							key={option}
							type="button"
							onClick={() => setValueType(option)}
							className={`h-8 w-10 rounded-full text-[12px] transition-colors ${
								valueType === option
									? "bg-[var(--console-pop)] text-[var(--ink-90)]"
									: "text-[var(--ink-30)] hover:text-[var(--ink-60)]"
							}`}
						>
							{glyph}
						</button>
					))}
				</div>
				<input
					value={amount}
					onChange={(event) => setAmount(event.target.value)}
					placeholder={valueType === "percentage" ? "20" : "5.00"}
					inputMode="decimal"
					className={`${field} w-28`}
				/>
				<button
					type="submit"
					className={pill}
					disabled={create.isPending || !valid}
				>
					{create.isPending ? "Creating…" : "Create code"}
				</button>
				<p className="text-[11px] text-[var(--ink-30)]">
					{valueType === "percentage"
						? "A percentage off the cart."
						: "A fixed amount off the cart."}
				</p>
			</form>

			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search codes"
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

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
						<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
							{rows.map((discount) => {
								const state = liveness(discount);
								return (
									<div
										key={discount.id}
										className="flex items-center gap-3 py-2.5"
									>
										<span className="w-32 shrink-0 font-mono text-[12px] text-[var(--ink-85)]">
											{discount.code}
										</span>
										<span className="min-w-0 flex-1 text-[12px] text-[var(--ink-60)]">
											{describe(discount)}
											{discount.minimumSubtotalCents > 0
												? ` · over ${new Intl.NumberFormat(undefined, {
														style: "currency",
														currency: "USD",
													}).format(discount.minimumSubtotalCents / 100)}`
												: ""}
										</span>
										<span className="shrink-0 text-[11px] text-[var(--ink-30)]">
											{discount.timesRedeemed}
											{discount.maxRedemptions !== null
												? ` / ${discount.maxRedemptions}`
												: ""}{" "}
											used
										</span>
										<span
											className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] ${
												state.muted
													? "bg-[rgb(var(--console-ink)/0.04)] text-[var(--ink-30)]"
													: "bg-[rgb(var(--console-ink)/0.08)] text-[var(--ink-70)]"
											}`}
										>
											{state.label}
										</span>
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
									</div>
								);
							})}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
