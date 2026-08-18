import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { workspaceApi } from "../lib/api";
import {
	Block,
	BlockEmpty,
	BlockFailure,
	DetailPanel,
	Fact,
} from "./detail-panel";
import { Text } from "./product-fields";

/**
 * One stocked item: how much there is, and everything that changed it.
 *
 * 🔑 The low-stock threshold is EDITABLE here and nowhere else. It is what the
 * low-stock notification fires on, so until this existed the warning could not
 * be turned on at all from the console — the feature was reachable only by
 * writing to the database.
 */

type InventoryDetail = {
	id: string;
	catalogItemId: string;
	status: string;
	onHand: number;
	reserved: number;
	lowStockThreshold: number;
};

type Adjustment = {
	id: string;
	kind: string;
	quantity: number;
	resultingOnHand: number;
	note: string | null;
	createdAt: string;
};

export function InventoryPanel({
	workspaceId,
	id,
	name,
	onClose,
}: {
	workspaceId: string;
	id: string;
	/** The product's name, which the inventory row itself does not carry. */
	name: string;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [threshold, setThreshold] = useState("");
	const [failure, setFailure] = useState<string | null>(null);

	const item = useQuery({
		queryKey: ["quickdash", workspaceId, "inventory", id],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<InventoryDetail>(
					`/inventory/${id}`,
				)
			).data,
	});

	const adjustments = useQuery({
		queryKey: ["quickdash", workspaceId, "inventory", id, "adjustments"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Adjustment[] }>(
					`/inventory/${id}/adjustments?limit=100`,
				)
			).data,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: seed the field once the record arrives
	useEffect(() => {
		if (item.data) setThreshold(String(item.data.lowStockThreshold));
	}, [item.data?.id, item.data?.lowStockThreshold]);

	const save = useMutation({
		mutationFn: async () => {
			const value = Number(threshold.trim());
			await workspaceApi(workspaceId).request(`/inventory/${id}`, {
				method: "PATCH",
				idempotencyKey: crypto.randomUUID(),
				body: {
					lowStockThreshold:
						Number.isFinite(value) && value >= 0 ? Math.round(value) : 0,
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That did not save."),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "inventory"],
			}),
	});

	const data = item.data;
	// What can actually be sold: reserved stock is spoken for by open orders.
	const available = data ? data.onHand - data.reserved : 0;

	return (
		<DetailPanel
			title={name}
			subtitle={
				data ? `${available} available · ${data.onHand} on hand` : undefined
			}
			onClose={onClose}
			footer={
				<>
					{failure ? (
						<p className="mb-2 text-[11.5px] text-[var(--signal-failure)]">
							{failure}
						</p>
					) : null}
					<button
						type="button"
						disabled={save.isPending || !data}
						onClick={() => save.mutate()}
						className={`${save.isPending ? "shimmer-busy" : ""} inline-flex h-9 w-full items-center justify-center rounded-full bg-[rgb(var(--console-ink))] text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40`}
					>
						{save.isPending ? "Saving…" : "Save"}
					</button>
				</>
			}
		>
			{item.isError ? (
				<BlockFailure query={item} />
			) : item.isPending ? (
				<BlockEmpty>Loading…</BlockEmpty>
			) : !data ? (
				<BlockEmpty>That item could not be loaded.</BlockEmpty>
			) : (
				<>
					<div className="grid grid-cols-3 gap-3">
						<Fact label="On hand">{data.onHand}</Fact>
						<Fact label="Reserved">{data.reserved}</Fact>
						<Fact label="Available">{available}</Fact>
					</div>

					<Block title="Low stock warning">
						<Text
							label="Warn at"
							hint="0 means never warn"
							value={threshold}
							onChange={setThreshold}
							placeholder="5"
							inputMode="decimal"
						/>
						<p className="mt-1.5 text-[11px] text-[var(--ink-30)] leading-4">
							{Number(threshold) > 0
								? `Everyone in this workspace is told once a day while stock is at or below ${Math.round(Number(threshold) || 0)}.`
								: "No warning is sent, however low this gets."}
						</p>
					</Block>

					<Block
						title="History"
						aside={adjustments.data?.items.length || undefined}
					>
						{adjustments.isError ? (
							<BlockFailure query={adjustments} />
						) : adjustments.isPending ? (
							<BlockEmpty>Loading…</BlockEmpty>
						) : (adjustments.data?.items.length ?? 0) === 0 ? (
							<BlockEmpty>Nothing has moved yet.</BlockEmpty>
						) : (
							<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
								{(adjustments.data?.items ?? []).map((entry) => (
									<div key={entry.id} className="flex items-center gap-3 py-2">
										<span className="w-24 shrink-0 text-[11px] text-[var(--ink-60)] capitalize">
											{entry.kind.replace(/[_-]/g, " ")}
										</span>
										<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-30)]">
											{entry.note ?? ""}
										</span>
										<span className="w-14 shrink-0 text-right text-[12.5px] text-[var(--ink-85)]">
											{entry.quantity > 0
												? `+${entry.quantity}`
												: entry.quantity}
										</span>
										<span className="w-10 shrink-0 text-right text-[11px] text-[var(--ink-30)]">
											{entry.resultingOnHand}
										</span>
									</div>
								))}
							</div>
						)}
					</Block>
				</>
			)}
		</DetailPanel>
	);
}
