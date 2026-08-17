import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { ListControls } from "./list-controls";
import { EmptyState, PageState, rowBusy } from "./page-state";

/**
 * Shipping rates — what delivery costs, per zone.
 *
 * 🔴 Rates are what checkout actually quotes. A zone without one cannot price
 * an order, so checkout refuses it — which looks to the customer like the shop
 * being broken rather than a setting being unset.
 *
 * 🔑 Grouped UNDER their zone rather than listed flat. A rate means nothing on
 * its own; "$12" is only an answer once you know where to.
 */

type Rate = {
	id: string;
	zoneId: string;
	name: string;
	baseCents: number;
	perKgCents: number | null;
	freeOverCents: number | null;
	estimatedDaysMin: number | null;
	estimatedDaysMax: number | null;
	active: boolean;
};

type Zone = { id: string; name: string; rates: Rate[] };

const pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const field =
	"h-9 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

const money = (cents: number) =>
	new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: "USD",
	}).format(cents / 100);

export function RatesView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [zoneId, setZoneId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [price, setPrice] = useState("");
	const [failure, setFailure] = useState<string | null>(null);

	const zones = useQuery({
		queryKey: ["quickdash", workspaceId, "shipping-zones"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Zone[] }>(
					"/shipping/zones",
				)
			).data,
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "shipping-zones"],
		});

	const create = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).request("/shipping/rates", {
				method: "POST",
				body: {
					zoneId,
					name: name.trim(),
					// Entered in currency, stored in minor units. One conversion, at the
					// edge, so nothing downstream has to wonder which it is holding.
					baseCents: Math.round(Number(price) * 100),
					active: true,
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That rate could not be created."),
		onSuccess: () => {
			setName("");
			setPrice("");
			refresh();
		},
	});

	const setActive = useMutation({
		mutationFn: async (input: { id: string; active: boolean }) => {
			await workspaceApi(workspaceId).request(`/shipping/rates/${input.id}`, {
				method: "PATCH",
				body: { active: input.active },
			});
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That change did not save."),
		onSuccess: refresh,
	});

	const chosenZone = zoneId ?? zones.data?.items[0]?.id ?? null;
	const valid = Boolean(chosenZone) && name.trim() && Number(price) >= 0;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{(zones.data?.items.length ?? 0) > 0 ? (
				<form
					className="mb-4 flex flex-wrap items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (valid) create.mutate();
					}}
				>
					{/* Zones as buttons, never an OS dropdown. There are few of them and
					    which one you are pricing is the most important thing on the row. */}
					<div className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-[rgb(var(--console-ink)/0.07)] p-0.5">
						{(zones.data?.items ?? []).map((zone) => (
							<button
								key={zone.id}
								type="button"
								onClick={() => setZoneId(zone.id)}
								className={`h-8 rounded-full px-3 text-[11.5px] transition-colors ${
									chosenZone === zone.id
										? "bg-[var(--console-pop)] text-[var(--ink-90)]"
										: "text-[var(--ink-30)] hover:text-[var(--ink-60)]"
								}`}
							>
								{zone.name}
							</button>
						))}
					</div>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Rate name, e.g. Standard post"
						className={`${field} w-56`}
					/>
					<input
						value={price}
						onChange={(event) => setPrice(event.target.value)}
						placeholder="12.00"
						inputMode="decimal"
						className={`${field} w-28`}
					/>
					<button
						type="submit"
						className={pill}
						disabled={create.isPending || !valid}
					>
						{create.isPending ? "Adding…" : "Add rate"}
					</button>
				</form>
			) : null}

			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search rates"
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

			<PageState
				query={zones}
				loadingLabel="Loading rates…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No zones to price"
						detail="Rates belong to a zone. Create a zone first, then come back and say what delivery there costs."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const groups = data.items
						.map((zone) => ({
							zone,
							rates: zone.rates.filter(
								(rate) => !needle || rate.name.toLowerCase().includes(needle),
							),
						}))
						.filter((group) => !needle || group.rates.length > 0);

					if (groups.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search."
							/>
						);
					}

					return (
						<div className="space-y-5">
							{groups.map(({ zone, rates }) => (
								<section key={zone.id}>
									<p className="mb-1 text-[11px] text-[var(--ink-45)]">
										{zone.name}
									</p>
									{rates.length === 0 ? (
										<p className="border-[var(--console-line-soft)] border-t py-2.5 text-[11.5px] text-[#f5b44a]">
											No rates here, so checkout cannot quote this zone.
										</p>
									) : (
										<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
											{rates.map((rate) => (
												<div
													key={rate.id}
													className="flex items-center gap-3 py-2.5"
												>
													<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
														{rate.name}
													</p>
													{rate.freeOverCents !== null ? (
														<span className="shrink-0 text-[11px] text-[var(--ink-30)]">
															free over {money(rate.freeOverCents)}
														</span>
													) : null}
													{rate.estimatedDaysMin !== null ? (
														<span className="shrink-0 text-[11px] text-[var(--ink-30)]">
															{rate.estimatedDaysMin}
															{rate.estimatedDaysMax !== null &&
															rate.estimatedDaysMax !== rate.estimatedDaysMin
																? `–${rate.estimatedDaysMax}`
																: ""}{" "}
															days
														</span>
													) : null}
													<span className="w-20 shrink-0 text-right text-[12.5px] text-[var(--ink-85)]">
														{money(rate.baseCents)}
													</span>
													<button
														type="button"
														className={quiet}
														disabled={rowBusy(setActive, rate.id)}
														onClick={() =>
															setActive.mutate({
																id: rate.id,
																active: !rate.active,
															})
														}
													>
														{rate.active ? "On" : "Off"}
													</button>
												</div>
											))}
										</div>
									)}
								</section>
							))}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
