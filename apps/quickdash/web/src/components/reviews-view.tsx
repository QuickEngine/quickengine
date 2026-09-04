import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { useListLayout } from "../lib/list-view";
import { useRecordSignals } from "../lib/record-signals";
import { ListControls, useChipFilter } from "./list-controls";
import { LayoutToggle, PagedTable } from "./list-layout";
import {
	EmptyState,
	PageState,
	rowActionBusy,
	rowBusy,
	WriteFailure,
} from "./page-state";

/**
 * Reviews — deciding what a shop says about itself.
 *
 * 🔴 A customer's review arrives `pending` and is invisible until somebody
 * publishes it. That is the whole point of this screen: nothing a stranger
 * writes appears on a business's storefront without a person agreeing to it.
 *
 * ⚠️ Rejecting is not deleting. The review stays, attributable, with who decided
 * — so "why was mine taken down" has an answer.
 */

const STATUSES = ["pending", "published", "rejected"] as const;
type Review = {
	id: string;
	catalogItemId: string | null;
	authorName: string | null;
	rating: number;
	title: string | null;
	body: string | null;
	status: string;
	createdAt: string;
};

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

const solid =
	"inline-flex h-7 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink))] px-2.5 text-[11px] text-[var(--console-pop)] transition-opacity hover:opacity-85 disabled:opacity-40";

/** Rating as it reads to a person, not as a number they have to interpret. */
const stars = (rating: number) =>
	"★".repeat(Math.max(0, Math.min(5, Math.round(rating)))).padEnd(5, "☆");

export function ReviewsView({ workspaceId }: { workspaceId: string }) {
	const { layout, setLayout } = useListLayout(workspaceId);
	// The dots come from the bell, so marking a notification read clears the row.
	const rowSignal = useRecordSignals(workspaceId);
	const statusFilter = useChipFilter();
	const queryClient = useQueryClient();
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
	const [search, setSearch] = useState("");

	/**
	 * 🔴 All three queues, in one list.
	 *
	 * `/reviews/moderation` answers for ONE status and defaults to pending —
	 * there is no "everything" to ask for. Reviews used to switch which queue it
	 * fetched, which made moderation the only page in the console whose status
	 * control was a navigation rather than a filter. Fetching all three and
	 * narrowing here makes it behave like every other list: no chip pressed
	 * means everything.
	 *
	 * ⚠️ Three requests, deliberately. They are parallel, capped at 100 each,
	 * and reviews are the lowest-volume record in the product; the alternative
	 * is an API change to accept a list of statuses, which is worth doing when
	 * somebody actually has more reviews than that.
	 */
	const reviews = useQuery({
		queryKey: ["quickdash", workspaceId, "reviews"],
		queryFn: async () => {
			const queues = await Promise.all(
				STATUSES.map(
					async (queue) =>
						(
							await workspaceApi(workspaceId).request<{ items: Review[] }>(
								`/reviews/moderation?status=${queue}&limit=100`,
							)
						).data.items,
				),
			);
			return {
				items: queues
					.flat()
					.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
			};
		},
	});

	const moderate = useMutation({
		mutationFn: async (input: {
			id: string;
			status: "published" | "rejected";
		}) => {
			await workspaceApi(workspaceId).request(`/reviews/${input.id}/moderate`, {
				method: "POST",
				body: { status: input.status },
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That decision did not save." }),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "reviews"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				onClearFilter={() => statusFilter.clear()}
				exportRows={() => reviews.data?.items ?? []}
				exportName="reviews"
				filter={statusFilter.chips("Status", [...STATUSES])}
				filterCount={statusFilter.count}
				action={<LayoutToggle layout={layout} onChange={setLayout} />}
				query={search}
				onQueryChange={setSearch}
				placeholder="Search reviews by author or words"
			/>

			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<PageState
				query={reviews}
				loadingLabel="Loading reviews…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="No reviews yet"
						detail="Reviews customers write appear here first. Nothing reaches your shop until you publish it."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items.filter(
						(review) =>
							statusFilter.keep(review.status) &&
							(!needle ||
								(review.authorName ?? "").toLowerCase().includes(needle) ||
								(review.title ?? "").toLowerCase().includes(needle) ||
								(review.body ?? "").toLowerCase().includes(needle)),
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
							caption="Reviews"
							rows={rows}
							columns={[
								{
									key: "rating",
									header: "Rating",
									width: "w-24",
									tight: true,
									// role="img" so the label is honoured: the stars are a picture
									// of the rating, and a screen reader should hear "4 out of 5"
									// rather than spell out four star characters.
									render: (review) => (
										<span
											role="img"
											className="font-mono text-[12px] text-[var(--ink-85)]"
											aria-label={`${review.rating} out of 5`}
										>
											{stars(review.rating)}
										</span>
									),
								},
								{
									key: "review",
									header: "Review",
									// ⚠️ Title and body on ONE line. A review can run to a
									// paragraph, and a table whose rows grow to fit loses the
									// alignment that makes it a table; the full text is one
									// click away on the product.
									render: (review) => (
										<>
											{review.title ? (
												<span className="text-[var(--ink-85)]">
													{review.title}
												</span>
											) : null}
											{review.body ? (
												<span className="ml-2 text-[11.5px] text-[var(--ink-60)]">
													{review.body}
												</span>
											) : null}
										</>
									),
								},
								{
									key: "author",
									header: "Author",
									width: "w-40",
									render: (review) => (
										<span className="text-[12px] text-[var(--ink-60)]">
											{review.authorName ?? "Anonymous"}
										</span>
									),
								},
								{
									key: "when",
									header: "When",
									width: "w-24",
									align: "right",
									tight: true,
									render: (review) => (
										<span className="text-[10.5px] text-[var(--ink-30)]">
											{new Date(review.createdAt).toLocaleDateString()}
										</span>
									),
								},
								{
									key: "actions",
									header: "",
									align: "right",
									tight: true,
									render: (review) =>
										review.status === "pending" ? (
											<div className="flex items-center justify-end gap-1.5">
												<button
													type="button"
													className={solid}
													{...rowActionBusy(rowBusy(moderate, review.id))}
													onClick={() =>
														moderate.mutate({
															id: review.id,
															status: "published",
														})
													}
												>
													Publish
												</button>
												<button
													type="button"
													className={quiet}
													{...rowActionBusy(rowBusy(moderate, review.id))}
													onClick={() =>
														moderate.mutate({
															id: review.id,
															status: "rejected",
														})
													}
												>
													Reject
												</button>
											</div>
										) : (
											// A decision already made can be changed. Publishing
											// something rejected in haste should not require support.
											<button
												type="button"
												className={quiet}
												{...rowActionBusy(rowBusy(moderate, review.id))}
												onClick={() =>
													moderate.mutate({
														id: review.id,
														status:
															review.status === "published"
																? "rejected"
																: "published",
													})
												}
											>
												{review.status === "published"
													? "Unpublish"
													: "Publish"}
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
