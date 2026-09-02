import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, WriteFailure } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error that produces names React
// internals rather than the missing import.
import { Text as TextField, Toggle } from "./product-fields";

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
	const statusFilter = useChipFilter();
	const queryClient = useQueryClient();
	const [creating, setCreating] = useState(false);
	const [search, setSearch] = useState("");
	const [name, setName] = useState("");
	const [countries, setCountries] = useState("");
	/**
	 * 🔴 Regions and priority existed on the table and had no field.
	 *
	 * A zone could only ever mean "this whole country", so a shop could not
	 * charge differently for the territories, and two overlapping zones had no
	 * way to say which one wins — the engine reads `priority`, and nothing could
	 * set it.
	 */
	const [regions, setRegions] = useState("");
	const [priority, setPriority] = useState("0");
	const [carrierRates, setCarrierRates] = useState(false);
	/**
	 * The zone being edited, or null when the form is creating a new one.
	 *
	 * 🔴 A zone could be created and deleted but never CORRECTED. `PATCH
	 * /v1/shipping/zones/:id` has existed all along with no control, so a
	 * mistyped country code meant deleting the zone — which first means deleting
	 * every rate under it — and building the whole thing again.
	 */
	const [editingId, setEditingId] = useState<string | null>(null);
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
			// 🔑 One form, two verbs — editing seeds this same state, so the fields
			// cannot drift apart the way a separate edit form would.
			await workspaceApi(workspaceId).request(
				editingId ? `/shipping/zones/${editingId}` : "/shipping/zones",
				{
					method: editingId ? "PATCH" : "POST",
					body: {
						name: name.trim(),
						// Two-letter ISO codes, upper-cased for them. Typing "ca, us" is
						// what a person does; rejecting it for case would be pedantry.
						countryCodes: countries
							.split(",")
							.map((code) => code.trim().toUpperCase())
							.filter(Boolean),
						// Empty means the whole country, which is why it is omitted rather
						// than sent as an empty list.
						...(regions.trim()
							? {
									regionCodes: regions
										.split(",")
										.map((code) => code.trim().toUpperCase())
										.filter(Boolean),
								}
							: {}),
						priority: Number.parseInt(priority, 10) || 0,
						useCarrierRates: carrierRates,
						active: true,
					},
				},
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That zone could not be created."),
		onSuccess: () => {
			setCreating(false);
			setEditingId(null);
			setName("");
			setCountries("");
			setRegions("");
			setPriority("0");
			setCarrierRates(false);
			refresh();
		},
	});

	// Every page's create lives in the header, in the same place. It REVEALS
	// the form rather than submitting it: the fields belong together, and a
	// submit button parted from its inputs is a button that does nothing
	// visible.
	useHeaderAction({
		label: "Add zone",
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
					title={editingId ? "Edit zone" : "New zone"}
					submitLabel={editingId ? "Save zone" : "Add zone"}
					busy={create.isPending}
					valid={name.trim().length > 0}
					failure={failure}
					onClose={() => {
						setCreating(false);
						// 🔴 Or the next "New zone" would silently UPDATE the last one
						// edited instead of creating anything.
						setEditingId(null);
					}}
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
					<TextField
						label="Regions"
						hint="optional — leave empty for the whole country"
						value={regions}
						onChange={setRegions}
						placeholder="AB, BC"
					/>
					<TextField
						label="Priority"
						hint="when zones overlap, higher wins"
						value={priority}
						onChange={setPriority}
						inputMode="decimal"
						placeholder="0"
					/>
					<Toggle
						label="Use carrier rates"
						hint="price from the courier instead of your own rates"
						value={carrierRates}
						onChange={setCarrierRates}
					/>
				</CreatePanel>
			) : null}

			<ListControls
				filter={statusFilter.chips("State", ["active", "off"])}
				filterCount={statusFilter.count}
				exportRows={() => zones.data?.items ?? []}
				exportName="shipping-zones"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search zones"
			/>

			{failure ? <WriteFailure message={failure} /> : null}

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
						(zone) =>
							statusFilter.keep(zone.active === false ? "off" : "active") &&
							(!needle || zone.name.toLowerCase().includes(needle)),
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
										<div className="flex items-center justify-end gap-1.5">
											<button
												type="button"
												className={quiet}
												onClick={() => {
													setEditingId(zone.id);
													setName(zone.name);
													setCountries((zone.countryCodes ?? []).join(", "));
													setCreating(true);
												}}
											>
												Edit
											</button>
											<button
												type="button"
												className={quiet}
												disabled={remove.isPending}
												onClick={() => remove.mutate(zone.id)}
											>
												Delete
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
