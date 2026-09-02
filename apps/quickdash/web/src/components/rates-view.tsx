import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { isAmount, parseAmountCents } from "../lib/money-input";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, rowBusy, WriteFailure } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error that produces names React
// internals rather than the missing import.
import { Choice, Text as TextField } from "./product-fields";

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

const _pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const _field =
	"h-9 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

const money = (cents: number) =>
	new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: "USD",
	}).format(cents / 100);

export function RatesView({ workspaceId }: { workspaceId: string }) {
	const statusFilter = useChipFilter();
	const { layout, setLayout } = useListLayout(workspaceId);
	const queryClient = useQueryClient();
	const [creating, setCreating] = useState(false);
	const [search, setSearch] = useState("");
	const [zoneId, setZoneId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [price, setPrice] = useState("");
	/**
	 * 🔴 Nine of the twelve columns on `shipping_rates` had no field.
	 *
	 * The engine already prices free-over-an-amount, weight bands, order-value
	 * bands, per-kilo and delivery estimates — every one of them unreachable, so
	 * a shop could offer exactly one flat price per zone and nothing else. "Free
	 * shipping over $X" is table stakes and could not be expressed at all.
	 */
	const [description, setDescription] = useState("");
	const [perKg, setPerKg] = useState("");
	const [freeOver, setFreeOver] = useState("");
	const [minWeight, setMinWeight] = useState("");
	const [maxWeight, setMaxWeight] = useState("");
	const [minOrder, setMinOrder] = useState("");
	const [maxOrder, setMaxOrder] = useState("");
	const [daysMin, setDaysMin] = useState("");
	const [daysMax, setDaysMax] = useState("");
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

	// What the picker shows, and therefore what must be submitted.
	const chosenZone = zoneId ?? zones.data?.items[0]?.id ?? null;

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "shipping-zones"],
		});

	const create = useMutation({
		mutationFn: async () => {
			/**
			 * 🔑 One form, two verbs. Editing seeds this same state and sets
			 * `editingId`, so the fields cannot drift apart the way a separate edit
			 * form would.
			 */
			await workspaceApi(workspaceId).request(
				editingId ? `/shipping/rates/${editingId}` : "/shipping/rates",
				{
					method: editingId ? "PATCH" : "POST",
					body: {
						/**
						 * 🔴 `chosenZone`, not `zoneId`.
						 *
						 * The picker DISPLAYS a zone by falling back to the first one when
						 * nothing has been clicked, but the raw state stays null until
						 * somebody actually clicks. So the form showed "Canada" selected and
						 * submitted nothing, and the server rejected it as an invalid
						 * request — an error that describes the payload accurately and the
						 * user's experience not at all, because they had chosen a zone.
						 *
						 * Sending the same value the form renders is the fix: what you see
						 * selected is what gets sent.
						 */
						zoneId: chosenZone,
						name: name.trim(),
						// Entered in currency, stored in minor units. One conversion, at the
						// edge, so nothing downstream has to wonder which it is holding.
						baseCents: parseAmountCents(price) ?? 0,
						/**
						 * ⚠️ Omitted when blank, never sent as 0. `freeOverCents: 0` would
						 * mean "free on every order"; `perKgCents: 0` would silently pin a
						 * weight-priced rate to its base. Absent has to stay absent.
						 */
						...(description.trim() ? { description: description.trim() } : {}),
						...(parseAmountCents(perKg) != null
							? { perKgCents: parseAmountCents(perKg) }
							: {}),
						...(parseAmountCents(freeOver) != null
							? { freeOverCents: parseAmountCents(freeOver) }
							: {}),
						...(minWeight.trim()
							? { minWeightGrams: Number.parseInt(minWeight, 10) }
							: {}),
						...(maxWeight.trim()
							? { maxWeightGrams: Number.parseInt(maxWeight, 10) }
							: {}),
						...(parseAmountCents(minOrder) != null
							? { minOrderCents: parseAmountCents(minOrder) }
							: {}),
						...(parseAmountCents(maxOrder) != null
							? { maxOrderCents: parseAmountCents(maxOrder) }
							: {}),
						...(daysMin.trim()
							? { estimatedDaysMin: Number.parseInt(daysMin, 10) }
							: {}),
						...(daysMax.trim()
							? { estimatedDaysMax: Number.parseInt(daysMax, 10) }
							: {}),
						active: true,
					},
				},
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That rate could not be created."),
		onSuccess: () => {
			setCreating(false);
			setEditingId(null);
			setName("");
			setPrice("");
			setDescription("");
			setPerKg("");
			setFreeOver("");
			setMinWeight("");
			setMaxWeight("");
			setMinOrder("");
			setMaxOrder("");
			setDaysMin("");
			setDaysMax("");
			refresh();
		},
	});

	// Every page's create lives in the header, in the same place. It REVEALS
	// the form rather than submitting it: the fields belong together, and a
	// submit button parted from its inputs is a button that does nothing
	// visible.
	useHeaderAction({
		label: "Add rate",
		onClick: () => setCreating((open) => !open),
	});

	/** The rate being edited, or null when the form is creating a new one. */
	const [editingId, setEditingId] = useState<string | null>(null);

	/**
	 * 🔴 A rate could be CREATED and then never changed or removed.
	 *
	 * `PATCH` and `DELETE` on `/v1/shipping/rates/:id` have existed all along and
	 * neither had a control. A rate saved with the wrong price stayed wrong for
	 * ever — and because a zone refuses to delete while it still has rates, one
	 * mistyped price made the ZONE permanent too. A dead end with no way out of
	 * the console at all.
	 *
	 * ⚠️ A blank price saves as `0`, which is free shipping, silently. That is
	 * how a wrong value gets in; being unable to correct it is what made it
	 * serious.
	 */
	const remove = useMutation({
		mutationFn: async (id: string) => {
			await workspaceApi(workspaceId).request(`/shipping/rates/${id}`, {
				method: "DELETE",
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That rate could not be deleted."),
		onSuccess: () => refresh(),
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

	const valid = Boolean(chosenZone) && name.trim() && isAmount(price);

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{creating ? (
				<CreatePanel
					title={editingId ? "Edit rate" : "New rate"}
					submitLabel={editingId ? "Save rate" : "Add rate"}
					busy={create.isPending}
					valid={Boolean(valid)}
					failure={failure}
					onClose={() => {
						setCreating(false);
						// 🔴 Or the next 'New rate' would silently UPDATE the last one
						// edited instead of creating anything.
						setEditingId(null);
					}}
					onSubmit={() => create.mutate()}
				>
					<Choice
						label="Zone"
						hint="where this price applies"
						options={(zones.data?.items ?? []).map((zone) => zone.name)}
						value={
							(zones.data?.items ?? []).find((zone) => zone.id === chosenZone)
								?.name ?? ""
						}
						onChange={(chosen) =>
							setZoneId(
								(zones.data?.items ?? []).find((zone) => zone.name === chosen)
									?.id ?? null,
							)
						}
					/>
					<TextField
						label="Name"
						value={name}
						onChange={setName}
						placeholder="Standard post"
					/>
					<TextField
						label="Price"
						value={price}
						onChange={setPrice}
						placeholder="12.00"
						inputMode="decimal"
					/>
					<TextField
						label="Description"
						hint="what the customer sees beside the price"
						value={description}
						onChange={setDescription}
						placeholder="3 to 8 business days, tracked"
					/>
					<TextField
						label="Free over"
						hint="orders at or above this ship free — leave empty for never"
						value={freeOver}
						onChange={setFreeOver}
						placeholder="250.00"
						inputMode="decimal"
					/>
					<TextField
						label="Per kg"
						hint="added on top of the price, by weight"
						value={perKg}
						onChange={setPerKg}
						placeholder="8.00"
						inputMode="decimal"
					/>
					<TextField
						label="Delivery from"
						hint="days"
						value={daysMin}
						onChange={setDaysMin}
						placeholder="3"
						inputMode="decimal"
					/>
					<TextField
						label="Delivery to"
						hint="days"
						value={daysMax}
						onChange={setDaysMax}
						placeholder="8"
						inputMode="decimal"
					/>
					{/*
					  ⚠️ Bands decide whether this rate APPLIES at all, which is a
					  different question from what it costs — a basket outside every
					  band gets no delivery option and a checkout that refuses.
					*/}
					<TextField
						label="Only over"
						hint="order value — leave empty to always apply"
						value={minOrder}
						onChange={setMinOrder}
						placeholder=""
						inputMode="decimal"
					/>
					<TextField
						label="Only under"
						hint="order value"
						value={maxOrder}
						onChange={setMaxOrder}
						placeholder=""
						inputMode="decimal"
					/>
					<TextField
						label="Min weight"
						hint="grams"
						value={minWeight}
						onChange={setMinWeight}
						placeholder=""
						inputMode="decimal"
					/>
					<TextField
						label="Max weight"
						hint="grams"
						value={maxWeight}
						onChange={setMaxWeight}
						placeholder=""
						inputMode="decimal"
					/>
				</CreatePanel>
			) : null}

			<ListControls
				filter={statusFilter.chips("State", ["active", "off"])}
				filterCount={statusFilter.count}
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search rates"
			/>

			{failure ? <WriteFailure message={failure} /> : null}

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
								(rate) =>
									statusFilter.keep(rate.active ? "active" : "off") &&
									(!needle || rate.name.toLowerCase().includes(needle)),
							),
						}))
						/* A zone whose every rate was filtered out is an empty heading,
						   so it goes too — but only when something IS filtering. */
						.filter(
							(group) =>
								(!needle && statusFilter.count === 0) || group.rates.length > 0,
						);

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
										<PagedTable
											workspaceId={workspaceId}
											layout={layout}
											caption={`Rates for ${zone.name}`}
											rows={rates}
											columns={[
												{
													key: "name",
													header: "Rate",
													render: (rate) => rate.name,
												},
												{
													key: "free",
													header: "Free over",
													width: "w-28",
													align: "right",
													tight: true,
													render: (rate) =>
														rate.freeOverCents !== null ? (
															<span className="text-[11px] text-[var(--ink-30)]">
																{money(rate.freeOverCents)}
															</span>
														) : null,
												},
												{
													key: "days",
													header: "Delivery",
													width: "w-28",
													align: "right",
													tight: true,
													render: (rate) =>
														rate.estimatedDaysMin !== null ? (
															<span className="text-[11px] text-[var(--ink-30)]">
																{rate.estimatedDaysMin}
																{rate.estimatedDaysMax !== null &&
																rate.estimatedDaysMax !== rate.estimatedDaysMin
																	? `-${rate.estimatedDaysMax}`
																	: ""}{" "}
																days
															</span>
														) : null,
												},
												{
													key: "price",
													header: "Price",
													width: "w-24",
													align: "right",
													tight: true,
													render: (rate) => money(rate.baseCents),
												},
												{
													key: "actions",
													header: "",
													align: "right",
													tight: true,
													render: (rate) => (
														<div className="flex items-center justify-end gap-1.5">
															<button
																type="button"
																className={quiet}
																onClick={() => {
																	// Seeds the same form the create panel uses, so there is one
																	// set of fields rather than two that can drift apart.
																	setEditingId(rate.id);
																	setZoneId(rate.zoneId);
																	setName(rate.name);
																	setPrice((rate.baseCents / 100).toFixed(2));
																	setCreating(true);
																}}
															>
																Edit
															</button>
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
															<button
																type="button"
																className={quiet}
																disabled={rowBusy(remove, rate.id)}
																onClick={() => {
																	if (
																		window.confirm(`Delete “${rate.name}”?`)
																	) {
																		remove.mutate(rate.id);
																	}
																}}
															>
																Delete
															</button>
														</div>
													),
												},
											]}
										/>
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
