import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useRecordSignals } from "../lib/record-signals";
import { detailCard } from "./detail-panel";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import { EmptyState, PageState } from "./page-state";

/**
 * Messages — two-way conversations with customers.
 *
 * 🔴 Marked read only when a person OPENS one, never on arrival. A page that
 * cleared its own unread count on load would let a message be missed forever
 * while looking attended to.
 *
 * ⚠️ The customer is writing from their own portal at the same time, so a
 * conversation can change under this page. The thread refetches on open and
 * after every reply rather than trusting what it already had.
 */

type Conversation = {
	id: string;
	subject: string | null;
	status: string;
	customerName: string | null;
	customerEmail: string | null;
	unreadForOperator?: number;
	lastMessageAt: string | null;
	createdAt: string;
};

type Message = {
	id: string;
	body: string;
	authorKind: string;
	createdAt: string;
};

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const solid =
	"inline-flex h-8 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink))] px-3.5 text-[12px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

function Thread({
	workspaceId,
	conversationId,
	onClose,
}: {
	workspaceId: string;
	conversationId: string;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [body, setBody] = useState("");

	const thread = useQuery({
		queryKey: ["quickdash", workspaceId, "conversation", conversationId],
		queryFn: async () => {
			const api = workspaceApi(workspaceId);
			/**
			 * 🔴 FLAT, because that is what the route returns.
			 *
			 * This declared `{ conversation, messages }` and the route returns
			 * `{ ...conversation, messages }` — so `data.conversation` was always
			 * undefined and reading a field off it crashed the panel with
			 * "Cannot read properties of undefined". Opening any conversation
			 * threw, and the type said it was fine.
			 *
			 * ⚠️ A hand-written type over a network response is an ASSERTION, not
			 * a check. TypeScript proved the code matched a shape somebody typed
			 * out, never that the server sends it. Same defect as the order panel's
			 * `unitAmountCents`, found the same way — by reading the route.
			 */
			const detail = await api.request<Conversation & { messages: Message[] }>(
				`/customer-conversations/${conversationId}`,
			);
			// Opening IS the read. Done here rather than on the list so an unread
			// count can never be cleared by a page somebody merely walked past.
			await api
				.request(`/customer-conversations/${conversationId}/read`, {
					method: "POST",
				})
				.catch(() => {
					// A failed read receipt must not hide the message itself.
				});
			return detail.data;
		},
	});

	const [replyFailure, setReplyFailure] = useState<string | null>(null);
	const reply = useMutation({
		mutationFn: async () => {
			await workspaceApi(workspaceId).request(
				`/customer-conversations/${conversationId}/messages`,
				{ method: "POST", body: { body: body.trim() } },
			);
		},
		onMutate: () => setReplyFailure(null),
		/**
		 * 🔴 A reply that fails silently is the worst write in the console.
		 *
		 * The box clears on success, so with no failure arm a refused send looked
		 * exactly like a sent one — the operator walks away believing a waiting
		 * customer has been answered. The draft is deliberately KEPT here so
		 * nobody retypes what they already wrote.
		 */
		onError: (error: { message?: string }) =>
			setReplyFailure(error?.message ?? "That reply could not be sent."),
		onSuccess: () => {
			setBody("");
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "conversation", conversationId],
			});
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "conversations"],
			});
		},
	});

	return (
		<aside className={detailCard}>
			<header className="flex items-center gap-3 border-[var(--console-line-soft)] border-b px-4 py-3">
				<p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-85)]">
					{thread.data?.customerName ?? "Conversation"}
				</p>
				<button type="button" onClick={onClose} className={quiet}>
					Close
				</button>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				<PageState
					query={thread}
					loadingLabel="Loading conversation…"
					skeleton="panel"
				>
					{(data) => (
						<div className="space-y-3">
							{data.messages.map((message) => {
								const fromUs = message.authorKind !== "customer";
								return (
									<div
										key={message.id}
										className={`max-w-[85%] rounded-xl px-3 py-2 ${
											fromUs
												? "ml-auto bg-[rgb(var(--console-ink)/0.08)]"
												: "border border-[var(--console-line-soft)]"
										}`}
									>
										<p className="text-[12px] text-[var(--ink-85)] leading-5">
											{message.body}
										</p>
										<p className="mt-1 text-[10px] text-[var(--ink-30)]">
											{new Date(message.createdAt).toLocaleString()}
										</p>
									</div>
								);
							})}
						</div>
					)}
				</PageState>
			</div>

			{replyFailure ? (
				<p
					role="alert"
					className="border-[var(--console-line-soft)] border-t px-4 pt-3 text-[11.5px] text-[var(--signal-attention-text)]"
				>
					{replyFailure}
				</p>
			) : null}

			<form
				className="flex items-end gap-2 border-[var(--console-line-soft)] border-t px-4 py-3"
				onSubmit={(event) => {
					event.preventDefault();
					if (body.trim()) reply.mutate();
				}}
			>
				<textarea
					value={body}
					onChange={(event) => setBody(event.target.value)}
					placeholder="Write a reply"
					rows={2}
					className="min-h-0 flex-1 resize-none rounded-lg border border-[var(--console-line-strong)] bg-transparent px-3 py-2 text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-20)] focus:border-[rgb(var(--console-ink)/0.25)]"
				/>
				<button
					type="submit"
					className={solid}
					disabled={reply.isPending || !body.trim()}
				>
					{reply.isPending ? "Sending…" : "Send"}
				</button>
			</form>
		</aside>
	);
}

export function MessagesView({ workspaceId }: { workspaceId: string }) {
	const statusFilter = useChipFilter();
	const { layout, setLayout } = useListLayout(workspaceId);
	const rowSignal = useRecordSignals(workspaceId);
	const [search, setSearch] = useState("");
	const [openId, setOpenId] = useState<string | null>(null);

	const conversations = useQuery({
		queryKey: ["quickdash", workspaceId, "conversations"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Conversation[] }>(
					"/customer-conversations",
				)
			).data,
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				filter={statusFilter.chips("Status", ["open", "closed"])}
				filterCount={statusFilter.count}
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search conversations by customer or subject"
			/>

			<PageState
				query={conversations}
				loadingLabel="Loading conversations…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No messages"
						detail="Customers can write to you from their account on your site. Their messages arrive here, and your replies go straight back."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter(
						(conversation) =>
							statusFilter.keep(conversation.status) &&
							(!needle ||
								(conversation.customerName ?? "")
									.toLowerCase()
									.includes(needle) ||
								(conversation.subject ?? "").toLowerCase().includes(needle)),
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
							rowSignal={rowSignal}
							workspaceId={workspaceId}
							layout={layout}
							caption="Conversations"
							rows={rows}
							selectedId={openId}
							onOpen={(conversation) => setOpenId(conversation.id)}
							columns={[
								{
									key: "customer",
									header: "Customer",
									render: (conversation) => (
										<span className="flex items-center gap-2">
											{/* Unread leads the row, because it is the only reason
											    to open one thing before another. */}
											{conversation.unreadForOperator ? (
												<span className="size-1.5 shrink-0 rounded-full bg-[var(--signal-news)]" />
											) : (
												<span className="size-1.5 shrink-0" />
											)}
											<span className="truncate">
												{conversation.customerName ?? "Someone"}
											</span>
										</span>
									),
								},
								{
									key: "subject",
									header: "Subject",
									render: (conversation) => (
										<span className="text-[11px] text-[var(--ink-30)]">
											{conversation.subject ?? ""}
										</span>
									),
								},
								{
									key: "status",
									header: "Status",
									width: "w-20",
									tight: true,
									render: (conversation) => (
										<span className="text-[11px] text-[var(--ink-30)] capitalize">
											{conversation.status}
										</span>
									),
								},
								{
									key: "last",
									header: "Last message",
									width: "w-28",
									align: "right",
									tight: true,
									render: (conversation) => (
										<span className="text-[10.5px] text-[var(--ink-30)]">
											{new Date(
												conversation.lastMessageAt ?? conversation.createdAt,
											).toLocaleDateString()}
										</span>
									),
								},
							]}
						/>
					);
				}}
			</PageState>

			{openId ? (
				<Thread
					workspaceId={workspaceId}
					conversationId={openId}
					onClose={() => setOpenId(null)}
				/>
			) : null}
		</main>
	);
}
