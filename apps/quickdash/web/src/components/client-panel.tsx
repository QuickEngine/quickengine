import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { workspaceApi } from "../lib/api";
import { money } from "../lib/catalog";
import { Block, BlockEmpty, DetailPanel, Fact } from "./detail-panel";
import { Area, Text } from "./product-fields";

/**
 * One customer, and everything this business knows about them.
 *
 * 🔑 The point of the page: somebody emails asking about their order, and the
 * answer needs their details, their addresses and what they have bought in one
 * place. Three separate lists meant three searches for one question.
 */

export type ClientRecord = {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
	company: string | null;
	notes: string | null;
	createdAt: string;
};

type Address = {
	id: string;
	label: string | null;
	line1: string;
	line2: string | null;
	city: string | null;
	region: string | null;
	postalCode: string | null;
	countryCode: string | null;
};

type OrderRow = {
	id: string;
	number: string;
	status: string;
	currency: string;
	totalCents: number;
	clientId: string | null;
	createdAt: string;
};

type Draft = {
	name: string;
	email: string;
	phone: string;
	company: string;
	notes: string;
};

const draftFrom = (client: ClientRecord): Draft => ({
	name: client.name,
	email: client.email ?? "",
	phone: client.phone ?? "",
	company: client.company ?? "",
	notes: client.notes ?? "",
});

export function ClientPanel({
	workspaceId,
	client,
	onClose,
}: {
	workspaceId: string;
	client: ClientRecord;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState<Draft>(() => draftFrom(client));
	const [failure, setFailure] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on identity, not on every field
	useEffect(() => {
		setDraft(draftFrom(client));
		setFailure(null);
	}, [client.id]);

	const addresses = useQuery({
		queryKey: ["quickdash", workspaceId, "clients", client.id, "addresses"],
		// ⚠️ Returns a BARE ARRAY, not `{ items }` like most list routes. Assuming
		// the usual shape threw a TypeError that the console then reported as
		// "QuickDash couldn't connect" — a render crash dressed up as a network
		// fault. Fixed here and in the classifier that mislabelled it.
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<Address[]>(
					`/clients/${client.id}/addresses`,
				)
			).data,
	});

	/**
	 * Their orders.
	 *
	 * ⚠️ Filtered client-side from the workspace's orders because there is no
	 * `?clientId=` filter on the list route. Fine while a workspace has hundreds;
	 * it needs a server-side filter before it has thousands, and `TECH_DEBT.md`
	 * says so.
	 */
	const orders = useQuery({
		queryKey: ["quickdash", workspaceId, "orders"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: OrderRow[] }>(
					"/orders?limit=100",
				)
			).data,
	});

	const save = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).request(`/clients/${client.id}`, {
				method: "PATCH",
				idempotencyKey: crypto.randomUUID(),
				body: {
					name: draft.name.trim(),
					email: draft.email.trim() || null,
					phone: draft.phone.trim() || null,
					company: draft.company.trim() || null,
					notes: draft.notes.trim() || null,
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That did not save."),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "clients"],
			}),
	});

	const theirOrders = (orders.data?.items ?? []).filter(
		(order) => order.clientId === client.id,
	);
	// What they have actually spent, which is the number an operator wants first.
	const spent = theirOrders
		.filter((order) => order.status !== "cancelled")
		.reduce((total, order) => total + order.totalCents, 0);

	const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
		setDraft((current) => ({ ...current, [key]: value }));

	return (
		<DetailPanel
			title={client.name}
			subtitle={
				theirOrders.length > 0
					? `${theirOrders.length} ${theirOrders.length === 1 ? "order" : "orders"} · ${money(spent, theirOrders[0].currency)}`
					: "No orders yet"
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
						disabled={save.isPending || draft.name.trim().length === 0}
						onClick={() => save.mutate()}
						className={`${save.isPending ? "shimmer-busy" : ""} inline-flex h-9 w-full items-center justify-center rounded-full bg-[rgb(var(--console-ink))] text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40`}
					>
						{save.isPending ? "Saving…" : "Save"}
					</button>
				</>
			}
		>
			<div className="space-y-3">
				<Text
					label="Name"
					value={draft.name}
					onChange={(value) => set("name", value)}
				/>
				<div className="grid grid-cols-2 gap-2">
					<Text
						label="Email"
						value={draft.email}
						onChange={(value) => set("email", value)}
						placeholder="name@example.com"
					/>
					<Text
						label="Phone"
						value={draft.phone}
						onChange={(value) => set("phone", value)}
					/>
				</div>
				<Text
					label="Company"
					value={draft.company}
					onChange={(value) => set("company", value)}
				/>
				<Area
					label="Notes"
					hint="internal, never shown to the customer"
					rows={3}
					value={draft.notes}
					onChange={(value) => set("notes", value)}
				/>
			</div>

			<Block
				title="Addresses"
				aside={addresses.data ? `${addresses.data.length}` : undefined}
			>
				{addresses.isPending ? (
					<BlockEmpty>Loading…</BlockEmpty>
				) : (addresses.data?.length ?? 0) === 0 ? (
					<BlockEmpty>
						No addresses. One is saved automatically the first time they order.
					</BlockEmpty>
				) : (
					<div className="space-y-2">
						{(addresses.data ?? []).map((address) => (
							<Fact key={address.id} label={address.label ?? "Address"}>
								{address.line1}
								{address.line2 ? `, ${address.line2}` : ""}
								<br />
								{[address.city, address.region, address.postalCode]
									.filter(Boolean)
									.join(" ")}
								{address.countryCode ? ` · ${address.countryCode}` : ""}
							</Fact>
						))}
					</div>
				)}
			</Block>

			<Block title="Orders" aside={theirOrders.length || undefined}>
				{orders.isPending ? (
					<BlockEmpty>Loading…</BlockEmpty>
				) : theirOrders.length === 0 ? (
					<BlockEmpty>Nothing ordered yet.</BlockEmpty>
				) : (
					<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
						{theirOrders.map((order) => (
							<div key={order.id} className="flex items-center gap-3 py-2">
								<span className="w-24 shrink-0 font-mono text-[11.5px] text-[var(--ink-60)]">
									{order.number}
								</span>
								<span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-30)] capitalize">
									{order.status}
								</span>
								<span className="shrink-0 text-[12.5px] text-[var(--ink-85)]">
									{money(order.totalCents, order.currency)}
								</span>
							</div>
						))}
					</div>
				)}
			</Block>
		</DetailPanel>
	);
}
