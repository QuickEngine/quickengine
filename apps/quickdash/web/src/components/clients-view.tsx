import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { ListControls } from "./list-controls";
import { EmptyState, PageState } from "./page-state";

/**
 * Clients — the people a business deals with.
 *
 * 🔑 Deliberately not called "customers". A client record is anyone the business
 * keeps details about: a shopper, a wholesale buyer, a supplier contact. The
 * shopper who checked out last night is one of these, created automatically —
 * which is why this page must never assume a record was typed in by hand.
 */

type Client = {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
	company: string | null;
	notes: string | null;
	createdAt: string;
};

const pill =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

const field =
	"h-9 rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]";

export function ClientsView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [failure, setFailure] = useState<string | null>(null);

	const clients = useQuery({
		queryKey: ["quickdash", workspaceId, "clients"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Client[] }>(
					"/clients?limit=100",
				)
			).data,
	});

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
			setFailure(error?.message ?? "That person could not be added."),
		onSuccess: () => {
			setName("");
			setEmail("");
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "clients"],
			});
		},
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
					placeholder="Name"
					className={`${field} w-56`}
				/>
				<input
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="Email (optional)"
					type="email"
					className={`${field} w-64`}
				/>
				<button
					type="submit"
					className={pill}
					disabled={create.isPending || !name.trim()}
				>
					{create.isPending ? "Adding…" : "Add person"}
				</button>
			</form>

			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search by name, email or company"
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
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
							!needle ||
							client.name.toLowerCase().includes(needle) ||
							(client.email ?? "").toLowerCase().includes(needle) ||
							(client.company ?? "").toLowerCase().includes(needle),
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
							{rows.map((client) => (
								<div key={client.id} className="flex items-center gap-3 py-2.5">
									<div className="min-w-0 flex-1">
										<p className="truncate text-[12.5px] text-[var(--ink-85)]">
											{client.name}
											{client.company ? (
												<span className="ml-2 text-[11px] text-[var(--ink-30)]">
													{client.company}
												</span>
											) : null}
										</p>
										{client.notes ? (
											<p className="truncate text-[11px] text-[var(--ink-30)]">
												{client.notes}
											</p>
										) : null}
									</div>
									<span className="w-56 shrink-0 truncate text-right text-[11.5px] text-[var(--ink-60)]">
										{client.email ?? client.phone ?? "No contact details"}
									</span>
									<span className="w-24 shrink-0 text-right text-[10.5px] text-[var(--ink-30)]">
										{new Date(client.createdAt).toLocaleDateString()}
									</span>
								</div>
							))}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
