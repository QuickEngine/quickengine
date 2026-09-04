import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { parseAmountCents } from "../lib/money-input";
import { useRecordSignals } from "../lib/record-signals";
import { CreatePanel } from "./create-panel";
import { useHeaderAction } from "./header-action";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, WriteFailure } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error that produces names React
// internals rather than the missing import.
import { Choice, Text as TextField } from "./product-fields";
import { SaveLabel, useSavedFlash } from "./save-button";

/**
 * Suppliers — who makes and ships what this business sells.
 *
 * 🔴 For a business that never touches its own product, this page and the
 * mapping below it are the difference between an order somebody can fulfil and
 * an order somebody has to phone about. The supplier's own code for a product
 * is the one piece of information no amount of care can reconstruct later.
 *
 * ⚠️ Nothing here sends anything anywhere yet. `handoffMethod` records how
 * orders are MEANT to reach this supplier so the agreement survives the
 * conversation it was made in; the adapter that acts on it is separate work,
 * deliberately, because guessing a supplier's format costs a rebuild.
 */

type Supplier = {
	id: string;
	name: string;
	contactName: string | null;
	contactEmail: string | null;
	handoffMethod: string;
	handoffTarget: string | null;
	leadTimeDays: number | null;
	notes: string | null;
};

type Mapping = {
	id: string;
	supplierId: string;
	catalogItemId: string;
	catalogItemName: string;
	supplierSku: string;
	unitCostCents: number | null;
	currency: string;
	leadTimeDays: number | null;
};

/**
 * How orders reach a supplier.
 *
 * 🔑 `shopify` and `woocommerce` are here because suppliers commonly ingest
 * orders through a storefront platform rather than an API of their own — EZPZ
 * Coffee's public dropshipping page says exactly that. Recording it keeps the
 * distinction visible: satisfying a platform's contract is a different and much
 * larger job than writing a client for somebody's REST API.
 */
const METHODS = [
	"unknown",
	"manual",
	"email",
	"csv",
	"api",
	"portal",
	"shopify",
	"woocommerce",
] as const;

const quiet =
	"control-raised inline-flex h-7 shrink-0 items-center rounded-md border px-2.5 text-[11px] text-[var(--ink-60)] outline-none hover:text-[var(--ink-90)] disabled:opacity-40";

const money = (cents: number | null, currency: string) =>
	cents === null
		? "-"
		: new Intl.NumberFormat(undefined, {
				style: "currency",
				currency,
			}).format(cents / 100);

export function SuppliersView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	// The dots come from the bell, so marking a notification read clears the row.
	const rowSignal = useRecordSignals(workspaceId);
	const statusFilter = useChipFilter();
	const queryClient = useQueryClient();
	const api = workspaceApi(workspaceId);

	const [creating, setCreating] = useState(false);
	const [search, setSearch] = useState("");
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	const [open, setOpen] = useState<string | null>(null);

	const [name, setName] = useState("");
	const [contactName, setContactName] = useState("");
	const [contactEmail, setContactEmail] = useState("");
	const [method, setMethod] = useState<string>("unknown");
	const [target, setTarget] = useState("");
	const [notes, setNotes] = useState("");

	const suppliers = useQuery({
		queryKey: ["quickdash", workspaceId, "suppliers"],
		queryFn: async () =>
			(await api.request<{ items: Supplier[] }>("/inventory/suppliers")).data,
	});

	// Every mapping in the workspace, fetched once. A per-supplier request would
	// mean the panel could not show a count until it was opened.
	const mappings = useQuery({
		queryKey: ["quickdash", workspaceId, "supplier-skus"],
		queryFn: async () =>
			(await api.request<{ items: Mapping[] }>("/inventory/supplier-skus"))
				.data,
	});

	const refresh = () => {
		void queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "suppliers"],
		});
		void queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "supplier-skus"],
		});
	};

	const create = useMutation({
		mutationFn: async () => {
			await api.request("/inventory/suppliers", {
				method: "POST",
				body: {
					name: name.trim(),
					contactName: contactName.trim() || null,
					contactEmail: contactEmail.trim() || null,
					handoffMethod: method,
					handoffTarget: target.trim() || null,
					notes: notes.trim() || null,
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That supplier could not be saved.",
			}),
		onSuccess: () => {
			setCreating(false);
			setName("");
			setContactName("");
			setContactEmail("");
			setMethod("unknown");
			setTarget("");
			setNotes("");
			refresh();
		},
	});

	const archive = useMutation({
		mutationFn: async (id: string) => {
			await api.request(`/inventory/suppliers/${id}`, { method: "DELETE" });
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That supplier could not be archived.",
			}),
		onSuccess: () => {
			setOpen(null);
			refresh();
		},
	});

	useHeaderAction({
		label: "Add supplier",
		onClick: () => setCreating((was) => !was),
	});

	const countFor = (supplierId: string) =>
		(mappings.data?.items ?? []).filter((row) => row.supplierId === supplierId)
			.length;

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{creating ? (
				<CreatePanel
					title="New supplier"
					submitLabel="Add supplier"
					busy={create.isPending}
					valid={name.trim().length > 0}
					blockedReason={"Give this supplier a name"}
					failure={failure}
					onClose={() => setCreating(false)}
					onSubmit={() => create.mutate()}
				>
					<TextField
						label="Name"
						value={name}
						onChange={setName}
						placeholder="Northline Components"
					/>
					<TextField
						label="Contact"
						value={contactName}
						onChange={setContactName}
						placeholder="Who you speak to"
					/>
					<TextField
						label="Email"
						value={contactEmail}
						onChange={setContactEmail}
						placeholder="orders@supplier.com"
					/>
					<Choice
						label="How orders reach them"
						hint="leave as unknown until they tell you"
						options={METHODS}
						value={method}
						onChange={setMethod}
					/>
					<TextField
						label="Where orders go"
						hint="an email address, portal URL or API base"
						value={target}
						onChange={setTarget}
						placeholder="depends on the method above"
					/>
					<TextField
						label="Notes"
						value={notes}
						onChange={setNotes}
						placeholder="Lead times, minimums, anything agreed"
					/>
				</CreatePanel>
			) : null}

			<ListControls
				onClearFilter={() => statusFilter.clear()}
				filter={statusFilter.chips("Handoff", [
					"email",
					"manual",
					"api",
					"shopify",
					"woocommerce",
				])}
				filterCount={statusFilter.count}
				exportRows={() => suppliers.data?.items ?? []}
				exportName="suppliers"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search suppliers"
			/>

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<PageState
				query={suppliers}
				loadingLabel="Loading suppliers…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No suppliers yet"
						detail="A supplier is whoever makes or ships what you sell. Record one, then map your products to the codes they use, so an order can be handed over without anybody guessing."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter(
						(supplier) =>
							statusFilter.keep(supplier.handoffMethod) &&
							(!needle || supplier.name.toLowerCase().includes(needle)),
					);
					return (
						<PagedTable
							rowSignal={rowSignal}
							empty={
								<EmptyState
									title="Nothing matches"
									detail="Try a different search."
								/>
							}
							workspaceId={workspaceId}
							layout={layout}
							caption="Suppliers"
							rows={rows}
							selectedId={open}
							onOpen={(supplier) => setOpen(supplier.id)}
							columns={[
								{
									key: "name",
									header: "Supplier",
									render: (supplier) => supplier.name,
								},
								{
									key: "contact",
									header: "Contact",
									render: (supplier) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{supplier.contactEmail ?? supplier.contactName ?? "-"}
										</span>
									),
								},
								{
									key: "method",
									header: "Handoff",
									width: "w-40",
									tight: true,
									render: (supplier) =>
										/**
										 * 🔴 The state that matters before a supplier call. An
										 * unknown handoff is not a blank field, it is the open
										 * question, and it should be visible from the list.
										 */
										supplier.handoffMethod === "unknown" ? (
											<span className="rounded-full bg-[rgb(var(--console-ink)/0.08)] px-2 py-0.5 text-[10.5px] text-[var(--signal-attention-text)]">
												Not agreed yet
											</span>
										) : (
											<span className="text-[11px] text-[var(--ink-30)]">
												{supplier.handoffMethod}
											</span>
										),
								},
								{
									key: "mapped",
									header: "Products",
									width: "w-28",
									tight: true,
									render: (supplier) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{countFor(supplier.id) || "None mapped"}
										</span>
									),
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (supplier) => (
										<button
											type="button"
											className={quiet}
											disabled={archive.isPending}
											onClick={() => archive.mutate(supplier.id)}
										>
											Archive
										</button>
									),
								},
							]}
						/>
					);
				}}
			</PageState>

			{open ? (
				<SupplierPanel
					workspaceId={workspaceId}
					supplier={
						(suppliers.data?.items ?? []).find((row) => row.id === open) ?? null
					}
					mappings={(mappings.data?.items ?? []).filter(
						(row) => row.supplierId === open,
					)}
					onClose={() => setOpen(null)}
					onChanged={refresh}
				/>
			) : null}
		</main>
	);
}

/**
 * One supplier, and the products mapped to it.
 *
 * 🔑 The mapping lives HERE rather than on its own page because it is
 * meaningless without the supplier it belongs to: "ETH-GUJI-340" answers a
 * question nobody can ask without first knowing whose code it is.
 */
/**
 * The link a supplier opens to set up their own payouts.
 *
 * 🔴 `GET /inventory/suppliers/:id/payment-account/link` has existed since the
 * feature shipped with NOTHING calling it, so the only way to get a link was to
 * mint one by hand. That is the whole feature: a partner with no QuickDash
 * account gives Stripe their bank details without anybody emailing a credential
 * around.
 *
 * ⚠️ The MODE is stamped when the link is issued and checked when the supplier
 * opens it. Issue one in sandbox and it only ever works while this workspace is
 * in sandbox — going live means issuing another and the supplier onboarding a
 * second time, because Stripe keeps test and live as different accounts. That
 * is stated on the button rather than discovered by a partner seeing a refusal.
 */
function PayoutLink({
	workspaceId,
	supplierId,
}: {
	workspaceId: string;
	supplierId: string;
}) {
	const [link, setLink] = useState<{ url: string; environment: string } | null>(
		null,
	);
	const [copied, setCopied] = useState(false);
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);

	const issue = useMutation({
		mutationFn: async () =>
			(
				await workspaceApi(workspaceId).request<{
					url: string;
					expiresAt: string;
					environment: string;
				}>(`/inventory/suppliers/${supplierId}/payment-account/link`)
			).data,
		onMutate: () => {
			setFailure(null);
			setCopied(false);
		},
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That link could not be created." }),
		onSuccess: (created) => setLink(created),
	});

	return (
		<section className="space-y-2">
			<p className="text-[11px] text-[var(--ink-45)]">Getting paid</p>
			<p className="text-[11.5px] text-[var(--ink-30)] leading-5">
				A link this supplier opens to give Stripe their bank details. It lasts
				thirty days and refreshes itself each time it is opened, so it does not
				go stale mid-setup.
			</p>

			{link ? (
				<div className="space-y-2">
					<p className="text-[11px] text-[var(--ink-40)]">
						{/* 🔑 Say which mode it is FOR. The two links look identical and
						    sending the wrong one wastes a partner's afternoon. */}
						{link.environment === "test"
							? "Sandbox link. It works while this workspace is in sandbox; going live needs a new one."
							: "Live link. Real bank details and real payouts."}
					</p>
					<code className="block overflow-x-auto rounded-lg border border-[var(--console-line)] bg-[rgb(var(--console-ink)/0.04)] p-2 font-mono text-[10.5px] text-[var(--ink-70)]">
						{link.url}
					</code>
					<button
						type="button"
						className={quiet}
						onClick={() => {
							void navigator.clipboard?.writeText(link.url);
							setCopied(true);
							window.setTimeout(() => setCopied(false), 1500);
						}}
					>
						{copied ? "Copied" : "Copy link"}
					</button>
				</div>
			) : (
				<button
					type="button"
					className={quiet}
					disabled={issue.isPending}
					onClick={() => issue.mutate()}
				>
					{issue.isPending ? "Creating…" : "Create a payout link"}
				</button>
			)}

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}
		</section>
	);
}

function SupplierPanel({
	workspaceId,
	supplier,
	mappings,
	onClose,
	onChanged,
}: {
	workspaceId: string;
	supplier: Supplier | null;
	mappings: Mapping[];
	onClose: () => void;
	onChanged: () => void;
}) {
	const api = workspaceApi(workspaceId);
	const [itemId, setItemId] = useState("");
	const [sku, setSku] = useState("");
	const [cost, setCost] = useState("");
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);

	const catalog = useQuery({
		queryKey: ["quickdash", workspaceId, "catalog", "for-mapping"],
		queryFn: async () =>
			(
				await api.request<{ items: Array<{ id: string; name: string }> }>(
					"/catalog?limit=100",
				)
			).data,
	});

	const map = useMutation({
		mutationFn: async () => {
			await api.request("/inventory/supplier-skus", {
				method: "POST",
				body: {
					supplierId: supplier?.id,
					catalogItemId: itemId,
					supplierSku: sku.trim(),
					// Typed in currency units; stored as integer cents like every
					// other money value in the system.
					unitCostCents: cost.trim() === "" ? null : parseAmountCents(cost),
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That product could not be mapped.",
			}),
		onSuccess: () => {
			setItemId("");
			setSku("");
			setCost("");
			onChanged();
		},
	});

	const unmap = useMutation({
		mutationFn: async (id: string) => {
			await api.request(`/inventory/supplier-skus/${id}`, { method: "DELETE" });
		},
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That mapping could not be removed.",
			}),
		onSuccess: onChanged,
	});

	if (!supplier) return null;

	const unmapped = (catalog.data?.items ?? []).filter(
		(item) => !mappings.some((row) => row.catalogItemId === item.id),
	);

	return (
		<aside className="fixed top-3 right-3 bottom-3 z-30 flex w-[calc(50%-0.75rem)] min-w-[24rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--console-line)] bg-[var(--console-panel)] shadow-[0_24px_60px_rgb(0_0_0/0.45)]">
			<header className="flex items-center gap-3 px-4 py-3">
				<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
					{supplier.name}
				</p>
				<button type="button" onClick={onClose} className={quiet}>
					Close
				</button>
			</header>

			<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
				<section className="space-y-1.5">
					<Fact label="Handoff" value={supplier.handoffMethod} />
					{supplier.handoffTarget ? (
						<Fact label="Goes to" value={supplier.handoffTarget} />
					) : null}
					{supplier.contactEmail ? (
						<Fact label="Email" value={supplier.contactEmail} />
					) : null}
					{supplier.leadTimeDays !== null ? (
						<Fact label="Lead time" value={`${supplier.leadTimeDays} days`} />
					) : null}
					{supplier.notes ? (
						<p className="pt-1 text-[11.5px] text-[var(--ink-45)] leading-5">
							{supplier.notes}
						</p>
					) : null}
				</section>

				<ConnectionSection
					supplier={supplier}
					mappings={mappings}
					workspaceId={workspaceId}
				/>

				<PayoutLink workspaceId={workspaceId} supplierId={supplier.id} />

				<section className="space-y-2">
					<p className="text-[11px] text-[var(--ink-45)]">
						Products mapped to this supplier
					</p>
					{mappings.length === 0 ? (
						<p className="text-[11.5px] text-[var(--ink-30)]">
							None yet. Map a product to the code this supplier uses for it.
						</p>
					) : (
						<div className="overflow-hidden rounded-xl border border-[var(--console-line)]">
							{mappings.map((row) => (
								<div key={row.id} className="flex h-10 items-center gap-3 px-3">
									<span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-85)]">
										{row.catalogItemName}
									</span>
									<code className="shrink-0 font-mono text-[11px] text-[var(--ink-45)]">
										{row.supplierSku}
									</code>
									<span className="w-20 shrink-0 text-right text-[11px] text-[var(--ink-30)]">
										{money(row.unitCostCents, row.currency)}
									</span>
									<button
										type="button"
										className={quiet}
										disabled={unmap.isPending}
										onClick={() => unmap.mutate(row.id)}
									>
										Remove
									</button>
								</div>
							))}
						</div>
					)}
				</section>

				<section className="space-y-2">
					<p className="text-[11px] text-[var(--ink-45)]">Map a product</p>
					{unmapped.length === 0 ? (
						<p className="text-[11.5px] text-[var(--ink-30)]">
							Every product is already mapped to this supplier.
						</p>
					) : (
						<>
							<Choice
								label="Product"
								options={unmapped.slice(0, 12).map((item) => item.name)}
								value={unmapped.find((item) => item.id === itemId)?.name ?? ""}
								onChange={(chosen) =>
									setItemId(
										unmapped.find((item) => item.name === chosen)?.id ?? "",
									)
								}
							/>
							<TextField
								label="Their code"
								hint="sent to them verbatim, never parsed"
								value={sku}
								onChange={setSku}
								placeholder="KA-K2-BLK"
							/>
							<TextField
								label="What you pay them"
								hint="per unit, leave blank if unknown"
								value={cost}
								onChange={setCost}
								placeholder="15.00"
							/>
							{failure ? (
								<p className="text-[11.5px] text-[var(--signal-attention-text)]">
									{failure.fallback}
								</p>
							) : null}
							<button
								type="button"
								data-hint={
									!itemId
										? "Choose which product this is"
										: !sku.trim()
											? "Enter the code the supplier uses"
											: undefined
								}
								disabled={!itemId || !sku.trim() || map.isPending}
								onClick={() => map.mutate()}
								className="inline-flex h-9 items-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40"
							>
								{map.isPending ? "Mapping…" : "Map product"}
							</button>
						</>
					)}
				</section>
			</div>
		</aside>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline gap-3">
			<span className="w-24 shrink-0 text-[11px] text-[var(--ink-30)]">
				{label}
			</span>
			<span className="min-w-0 flex-1 break-words text-[11.5px] text-[var(--ink-85)]">
				{value}
			</span>
		</div>
	);
}

/** Handoff methods QuickDash can place an order into, as opposed to email or by hand. */
const CONNECTABLE = new Set(["shopify", "woocommerce"]);

/**
 * Connecting a supplier's own system, and proving the mapping before an order
 * depends on it.
 *
 * 🔑 The reason this screen exists is the check, not the form. An unrecognised
 * product found HERE is a typo somebody fixes in ten seconds; the same typo
 * found when an order arrives is a paying customer waiting for coffee that was
 * never ordered. So unknown codes are reported against the PRODUCT NAME the
 * operator recognises, never the supplier's opaque identifier.
 *
 * 🔴 The token is write-only. Nothing here can read one back — the read returns
 * only whether one is present, which shop it points at, and whether it last
 * worked.
 */
function ConnectionSection({
	supplier,
	mappings,
	workspaceId,
}: {
	supplier: Supplier;
	mappings: Mapping[];
	workspaceId: string;
}) {
	const api = workspaceApi(workspaceId);
	const queryClient = useQueryClient();
	const [shopDomain, setShopDomain] = useState("");
	const [token, setToken] = useState("");
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [apiVersion, setApiVersion] = useState("2026-07");
	const [webhookSecret, setWebhookSecret] = useState("");
	const [replacing, setReplacing] = useState(false);
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	const [checked, setChecked] = useState<{
		ok: boolean;
		reason?: string;
		unknownSkus?: string[];
	} | null>(null);

	const provider = supplier.handoffMethod;
	const connectable = CONNECTABLE.has(provider);

	const connection = useQuery({
		queryKey: ["quickdash", workspaceId, "supplier-connection", supplier.id],
		enabled: connectable,
		queryFn: async () =>
			(
				await api.request<{
					status: string;
					shopDomain: string | null;
					apiVersion: string | null;
					present: boolean;
					lastError: string | null;
				} | null>(
					`/inventory/supplier-connections?supplierId=${supplier.id}&provider=${provider}`,
				)
			).data,
	});

	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: ["quickdash", workspaceId, "supplier-connection", supplier.id],
		});

	const connect = useMutation({
		mutationFn: async () => {
			await api.request("/inventory/supplier-connections", {
				method: "POST",
				body: {
					supplierId: supplier.id,
					provider,
					shopDomain: shopDomain.trim(),
					/**
					 * 🔴 Shopify deprecated admin-created custom apps, so a permanent
					 * `shpat_…` cannot be issued for a new store at all. A Dev Dashboard
					 * app holds a client id and secret and exchanges them for a token
					 * that expires in 24 hours, which is why the credential is stored
					 * and the token never is.
					 *
					 * The legacy field stays for stores connected before that change.
					 * Either form is accepted; the API refuses a half-filled one.
					 */
					adminAccessToken: token.trim() || undefined,
					clientId: clientId.trim() || undefined,
					clientSecret: clientSecret.trim() || undefined,
					apiVersion: apiVersion.trim(),
					/**
					 * 🔴 Without this, tracking never comes back.
					 *
					 * Inbound fulfilment events are verified against this secret and
					 * NOTHING else — an unsigned or unverifiable one is refused, which
					 * is correct but means an absent secret silently rejects every real
					 * event too. Optional because a supplier can be connected before
					 * their webhook is set up, and outbound orders work without it.
					 */
					webhookSecret: webhookSecret.trim() || undefined,
				},
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That connection could not be saved.",
			}),
		onSuccess: () => {
			// Cleared immediately. Neither secret has reason to sit in a form field.
			setToken("");
			setClientId("");
			setClientSecret("");
			setWebhookSecret("");
			setReplacing(false);
			setChecked(null);
			void refresh();
		},
	});

	const check = useMutation({
		mutationFn: async () =>
			(
				await api.request<{
					ok: boolean;
					reason?: string;
					unknownSkus?: string[];
				}>("/inventory/supplier-connections/check", {
					method: "POST",
					body: { supplierId: supplier.id, provider },
				})
			).data,
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({
				error: error,
				fallback: "That connection could not be checked.",
			}),
		onSuccess: (result) => {
			setChecked(result);
			void refresh();
		},
	});

	// 🔴 ABOVE the early return. `useSavedFlash` is a hook, so it has to run on
	// every render of this component or the hook order changes between the two
	// branches, which React reads as a different component. It sat below the
	// return that renders the collapsed state, so the order flipped the moment
	// this opened.
	const connected = useSavedFlash(connect.isSuccess);

	if (!connectable) return null;

	/** The supplier's code translated back to the name on the shelf. */
	const nameFor = (supplierSku: string) =>
		mappings.find((row) => row.supplierSku === supplierSku)?.catalogItemName ??
		supplierSku;

	const state = connection.data;

	return (
		<section className="space-y-2.5">
			<p className="text-[11px] text-[var(--ink-45)]">
				{supplier.name}&rsquo;s system
			</p>

			{state?.present ? (
				<div className="space-y-1.5">
					<Fact label="Connected to" value={state.shopDomain ?? "-"} />
					<Fact label="Status" value={state.status} />
					{state.lastError ? (
						<p className="text-[11.5px] text-[var(--ink-45)] leading-5">
							{state.lastError}
						</p>
					) : null}
				</div>
			) : null}

			{!state?.present || replacing ? (
				<div className="space-y-2">
					<p className="text-[11.5px] text-[var(--ink-30)] leading-5">
						{state?.present
							? "Everything is replaced together. Enter the current store address and credentials, whether or not either has changed."
							: "Not connected yet. Orders for this supplier will wait for you to send them by hand."}
					</p>
					<TextField
						label="Store address"
						value={shopDomain}
						onChange={setShopDomain}
						placeholder="example.myshopify.com"
					/>
					<TextField
						label="Client ID"
						hint="Dev Dashboard, App settings, Credentials"
						value={clientId}
						onChange={setClientId}
						placeholder="00d61188089568061450ba284d1f9e87"
					/>
					<TextField
						label="Client secret"
						hint="shown once when you rotate it"
						value={clientSecret}
						onChange={setClientSecret}
						placeholder="shpss_…"
					/>
					<TextField
						label="Access token"
						hint="only for stores connected before Shopify retired custom apps"
						value={token}
						onChange={setToken}
						placeholder="shpat_… (leave empty)"
					/>
					<TextField
						label="API version"
						value={apiVersion}
						onChange={setApiVersion}
					/>
					<TextField
						label="Webhook signing secret"
						hint="optional now, required before tracking can come back"
						value={webhookSecret}
						onChange={setWebhookSecret}
						placeholder="Shown once when you create the webhook"
					/>
				</div>
			) : null}

			<div className="flex items-center gap-2">
				{!state?.present || replacing ? (
					<button
						type="button"
						className={`${connect.isPending ? "shimmer-busy" : ""} ${quiet}`}
						disabled={
							connect.isPending ||
							shopDomain.trim() === "" ||
							// Either credential form, never half of one.
							(token.trim() === "" &&
								(clientId.trim() === "" || clientSecret.trim() === ""))
						}
						onClick={() => connect.mutate()}
					>
						<SaveLabel saving={connect.isPending} saved={connected}>
							{state?.present ? "Save connection" : "Connect"}
						</SaveLabel>
					</button>
				) : null}
				{state?.present ? (
					<button
						type="button"
						className={quiet}
						disabled={check.isPending}
						onClick={() => check.mutate()}
					>
						{check.isPending ? "Checking…" : "Check connection"}
					</button>
				) : null}
				{/**
				 * 🔑 The only way to add a webhook secret, or rotate a token.
				 *
				 * A connection is normally made BEFORE the webhook exists — the
				 * secret is shown once, when the webhook is created, which happens
				 * afterwards. Without this the connection would have to be deleted
				 * and rebuilt to receive tracking at all.
				 */}
				{state?.present && !replacing ? (
					<button
						type="button"
						className={quiet}
						onClick={() => setReplacing(true)}
					>
						Replace
					</button>
				) : null}
				{replacing ? (
					<button
						type="button"
						className={quiet}
						onClick={() => setReplacing(false)}
					>
						Cancel
					</button>
				) : null}
			</div>

			{checked ? (
				checked.ok ? (
					<p className="text-[11.5px] text-[var(--ink-60)] leading-5">
						Everything mapped to this supplier was recognised.
					</p>
				) : (
					<div className="space-y-1">
						<p className="text-[11.5px] text-[var(--ink-85)] leading-5">
							{checked.reason ?? "This connection could not be verified."}
						</p>
						{/* 🔑 By NAME. A list of variant ids tells an operator nothing. */}
						{(checked.unknownSkus ?? []).map((sku) => (
							<p
								key={sku}
								className="text-[11.5px] text-[var(--ink-45)] leading-5"
							>
								{nameFor(sku)}: not recognised by this store
							</p>
						))}
					</div>
				)
			) : null}

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}
		</section>
	);
}
