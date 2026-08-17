import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { ListControls } from "./list-controls";
import { EmptyState, PageState } from "./page-state";

/**
 * Shipping zones — where a business will send things.
 *
 * 🔴 A zone with no rates cannot quote, and checkout refuses an order it cannot
 * price. So a zone that exists but is empty is worse than no zone at all: it
 * looks configured and turns customers away. This page says so on the row
 * rather than leaving it to be discovered at checkout.
 *
 * ⚠️ Priority decides which zone wins when two both match an address. Lower is
 * checked first, so a specific zone must sit above a catch-all.
 */

type Rate = {
	id: string;
	name: string;
	baseCents: number;
	freeOverCents: number | null;
	active: boolean;
};

type Zone = {
	id: string;
	name: string;
	countryCodes?: string[];
	regionCodes?: string[];
	priority?: number;
	active?: boolean;
	rates: Rate[];
};

const pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const field =
	"h-9 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

export function ZonesView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [name, setName] = useState("");
	const [countries, setCountries] = useState("");
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
			await workspaceApi(workspaceId).request("/shipping/zones", {
				method: "POST",
				body: {
					name: name.trim(),
					// Two-letter ISO codes, upper-cased for them. Typing "ca, us" is
					// what a person does; rejecting it for case would be pedantry.
					countryCodes: countries
						.split(",")
						.map((code) => code.trim().toUpperCase())
						.filter(Boolean),
					active: true,
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That zone could not be created."),
		onSuccess: () => {
			setName("");
			setCountries("");
			refresh();
		},
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			await workspaceApi(workspaceId).request(`/shipping/zones/${id}`, {
				method: "DELETE",
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That zone could not be removed."),
		onSuccess: refresh,
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<form
				className="mb-4 flex flex-wrap items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (name.trim()) create.mutate();
				}}
			>
				<input
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Zone name, e.g. Canada"
					className={`${field} w-56`}
				/>
				<input
					value={countries}
					onChange={(event) => setCountries(event.target.value)}
					placeholder="CA, US"
					className={`${field} w-40 uppercase`}
				/>
				<button
					type="submit"
					className={pill}
					disabled={create.isPending || !name.trim()}
				>
					{create.isPending ? "Adding…" : "Add zone"}
				</button>
			</form>

			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search zones"
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

			<PageState
				query={zones}
				loadingLabel="Loading zones…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nowhere to ship yet"
						detail="A zone is a group of countries you deliver to. Add one, then give it rates so checkout can quote a price."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter(
						(zone) => !needle || zone.name.toLowerCase().includes(needle),
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
							{rows.map((zone) => (
								<div key={zone.id} className="flex items-center gap-3 py-2.5">
									<div className="min-w-0 flex-1">
										<p className="truncate text-[12.5px] text-[var(--ink-85)]">
											{zone.name}
										</p>
										<p className="truncate text-[11px] text-[var(--ink-30)]">
											{(zone.countryCodes ?? []).join(", ") ||
												"No countries set"}
										</p>
									</div>

									{/* 🔴 The state that silently breaks checkout. */}
									{zone.rates.length === 0 ? (
										<span className="shrink-0 rounded-full bg-[rgb(var(--console-ink)/0.08)] px-2 py-0.5 text-[10.5px] text-[#f5b44a]">
											No rates — cannot quote
										</span>
									) : (
										<span className="shrink-0 text-[11px] text-[var(--ink-30)]">
											{zone.rates.length}{" "}
											{zone.rates.length === 1 ? "rate" : "rates"}
										</span>
									)}

									<button
										type="button"
										className={quiet}
										disabled={remove.isPending}
										onClick={() => remove.mutate(zone.id)}
									>
										Remove
									</button>
								</div>
							))}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
