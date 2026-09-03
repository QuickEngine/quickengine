import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useRecordSignals } from "../lib/record-signals";
import { useSelectedRecord } from "../lib/selected-record";
import { BulkDelete } from "./bulk-delete";
import { type ClientRecord as Client, ClientPanel } from "./client-panel";
import { CreatePanel } from "./create-panel";
import { useHeaderAction, useHeaderCrumb } from "./header-action";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState, WriteFailure } from "./page-state";
// ⚠️ Aliased: an unaliased `Text` silently resolves to the DOM's global `Text`
// if the import is ever dropped, and the error that produces names React
// internals rather than the missing import.
import { Text as TextField } from "./product-fields";

/**
 * Clients — the people a business deals with.
 *
 * 🔑 Deliberately not called "customers". A client record is anyone the business
 * keeps details about: a shopper, a wholesale buyer, a supplier contact. The
 * shopper who checked out last night is one of these, created automatically —
 * which is why this page must never assume a record was typed in by hand.
 */

const _pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const _field =
	"h-9 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

export function ClientsView({ workspaceId }: { workspaceId: string }) {
	const statusFilter = useChipFilter();
	const { layout, setLayout } = useListLayout(workspaceId);
	const rowSignal = useRecordSignals(workspaceId);
	const queryClient = useQueryClient();
	const [creating, setCreating] = useState(false);
	const [selectedId, setSelectedId] = useSelectedRecord();
	const [search, setSearch] = useState("");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
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

	const clients = useQuery({
		queryKey: ["quickdash", workspaceId, "clients"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Client[] }>(
					"/clients?limit=100",
				)
			).data,
	});

	// Resolved from the live list, so a save is reflected without extra state.
	const selected =
		(clients.data?.items ?? []).find((client) => client.id === selectedId) ??
		null;

	useHeaderCrumb(selected?.name ?? null);

	const create = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).request("/clients", {
				method: "POST",
				body: {
					name: name.trim(),
					// Sent only when given. An empty string is a value, and storing one
					// makes "has no email" indistinguishable from "email is blank".
					email: email.trim() || undefined,
				},
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That person could not be added." }),
		onSuccess: () => {
			setCreating(false);
			setName("");
			setEmail("");
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "clients"],
			});
		},
	});

	// Every page's create lives in the header, in the same place. It REVEALS
	// the form rather than submitting it: the fields belong together, and a
	// submit button parted from its inputs is a button that does nothing
	// visible.
	useHeaderAction({
		label: "Add client",
		onClick: () => setCreating((open) => !open),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{creating ? (
				<CreatePanel
					title="New client"
					submitLabel="Add person"
					busy={create.isPending}
					valid={name.trim().length > 0}
					failure={failure}
					onClose={() => setCreating(false)}
					onSubmit={() => create.mutate()}
				>
					<TextField label="Name" value={name} onChange={setName} />
					<TextField
						label="Email"
						hint="optional"
						value={email}
						onChange={setEmail}
						placeholder="name@example.com"
					/>
				</CreatePanel>
			) : null}

			<ListControls
				onClearFilter={() => statusFilter.clear()}
				filter={statusFilter.chips("Details", ["has email", "has company"])}
				filterCount={statusFilter.count}
				exportRows={() => clients.data?.items ?? []}
				exportName="customers"
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search by name, email or company"
			/>

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<PageState
				query={clients}
				loadingLabel="Loading people…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nobody here yet"
						detail="People appear here when they buy something, book you, or when you add them. Nothing needs doing first."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter(
						(client) =>
							(statusFilter.count === 0 ||
								(client.email && statusFilter.keep("has email")) ||
								(client.company && statusFilter.keep("has company"))) &&
							(!needle ||
								client.name.toLowerCase().includes(needle) ||
								(client.email ?? "").toLowerCase().includes(needle) ||
								(client.company ?? "").toLowerCase().includes(needle)),
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
							exportName="customers"
							bulkActions={(chosen) => (
								<BulkDelete
									workspaceId={workspaceId}
									rows={chosen}
									path="/clients"
									noun="customers"
									invalidate={["quickdash", workspaceId, "clients"]}
								/>
							)}
							workspaceId={workspaceId}
							layout={layout}
							caption="Customers"
							rowSignal={rowSignal}
							rows={rows}
							selectedId={selectedId}
							onOpen={(client) => setSelectedId(client.id)}
							columns={[
								{
									key: "name",
									header: "Name",
									render: (client) => (
										<>
											{client.name}
											{client.company ? (
												<span className="ml-2 text-[11px] text-[var(--ink-30)]">
													{client.company}
												</span>
											) : null}
										</>
									),
								},
								{
									key: "contact",
									header: "Contact",
									width: "w-56",
									render: (client) => (
										<span className="text-[11.5px] text-[var(--ink-60)]">
											{client.email ?? client.phone ?? "No contact details"}
										</span>
									),
								},
								{
									key: "notes",
									header: "Notes",
									render: (client) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{client.notes ?? ""}
										</span>
									),
								},
								{
									key: "added",
									header: "Added",
									width: "w-24",
									align: "right",
									tight: true,
									render: (client) => (
										<span className="text-[10.5px] text-[var(--ink-30)]">
											{new Date(client.createdAt).toLocaleDateString()}
										</span>
									),
								},
							]}
						/>
					);
				}}
			</PageState>

			{selected ? (
				<ClientPanel
					workspaceId={workspaceId}
					client={selected}
					onClose={() => setSelectedId(null)}
				/>
			) : null}
		</main>
	);
}
