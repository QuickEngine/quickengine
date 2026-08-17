import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { ListControls } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error that produces names React
// internals rather than the missing import.
import { Text as TextField } from "./product-fields";

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

const _pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const _field =
	"h-9 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

export function ZonesView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	const queryClient = useQueryClient();
	const [creating, setCreating] = useState(false);
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
			setCreating(false);
			setName("");
			setCountries("");
			refresh();
		},
	});

	// Every page's create lives in the header, in the same place. It REVEALS
	// the form rather than submitting it: the fields belong together, and a
	// submit button parted from its inputs is a button that does nothing
	// visible.
	useHeaderAction({
		label: "New zone",
		onClick: () => setCreating((open) => !open),
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
			{creating ? (
				<CreatePanel
					title="New zone"
					submitLabel="Add zone"
					busy={create.isPending}
					valid={name.trim().length > 0}
					failure={failure}
					onClose={() => setCreating(false)}
					onSubmit={() => create.mutate()}
				>
					<TextField
						label="Name"
						value={name}
						onChange={setName}
						placeholder="Canada"
					/>
					<TextField
						label="Countries"
						hint="two letter codes, comma separated"
						value={countries}
						onChange={setCountries}
						placeholder="CA, US"
					/>
				</CreatePanel>
			) : null}

			<ListControls
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
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
						<PagedTable
							workspaceId={workspaceId}
							layout={layout}
							caption="Shipping zones"
							rows={rows}
							columns={[
								{ key: "name", header: "Zone", render: (zone) => zone.name },
								{
									key: "countries",
									header: "Countries",
									render: (zone) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{(zone.countryCodes ?? []).join(", ") ||
												"No countries set"}
										</span>
									),
								},
								{
									key: "rates",
									header: "Rates",
									width: "w-48",
									tight: true,
									render: (zone) =>
										// 🔴 The state that silently breaks checkout.
										zone.rates.length === 0 ? (
											<span className="rounded-full bg-[rgb(var(--console-ink)/0.08)] px-2 py-0.5 text-[10.5px] text-[var(--signal-attention)]">
												No rates, cannot quote
											</span>
										) : (
											<span className="text-[11px] text-[var(--ink-30)]">
												{zone.rates.length}
											</span>
										),
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (zone) => (
										<button
											type="button"
											className={quiet}
											disabled={remove.isPending}
											onClick={() => remove.mutate(zone.id)}
										>
											Delete
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
