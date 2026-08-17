import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceApi } from "../lib/api";
import { FilterChip, ListControls } from "./list-controls";
import { EmptyState, PageState, rowBusy } from "./page-state";

/**
 * Bookings — appointments, grouped by the day they happen.
 *
 * 🔑 Ordered by WHEN, not by when they were made. An appointment list sorted by
 * creation date is useless to somebody about to start their day.
 *
 * ⚠️ Times render in the browser's zone while each booking carries its own.
 * That is right for the operator reading it — but it means a business taking
 * bookings across zones sees its own clock, not the customer's.
 */

const STATUSES = [
	"requested",
	"confirmed",
	"checked_in",
	"completed",
	"cancelled",
	"no_show",
] as const;

type Booking = {
	id: string;
	title: string;
	status: string;
	clientName: string | null;
	startsAt: string;
	endsAt: string;
	timeZone: string;
	locationKind: string;
	location: string | null;
};

const quiet =
	"inline-flex h-7 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-2.5 text-[11px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)] disabled:opacity-40";

/** The single obvious next step for a booking in this state. */
const NEXT_STATUS: Record<string, { label: string; status: string }> = {
	requested: { label: "Confirm", status: "confirmed" },
	confirmed: { label: "Check in", status: "checked_in" },
	checked_in: { label: "Complete", status: "completed" },
};

const readable = (value: string) => value.replace(/_/g, " ");

const dayKey = (iso: string) => new Date(iso).toDateString();

const dayLabel = (iso: string) => {
	const date = new Date(iso);
	const today = new Date().toDateString();
	const tomorrow = new Date(Date.now() + 86_400_000).toDateString();
	if (date.toDateString() === today) return "Today";
	if (date.toDateString() === tomorrow) return "Tomorrow";
	return date.toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
};

const timeRange = (booking: Booking) =>
	`${new Date(booking.startsAt).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	})} – ${new Date(booking.endsAt).toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	})}`;

export function BookingsView({ workspaceId }: { workspaceId: string }) {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [statuses, setStatuses] = useState<string[]>([]);
	const [failure, setFailure] = useState<string | null>(null);

	const bookings = useQuery({
		queryKey: ["quickdash", workspaceId, "bookings"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{ items: Booking[] }>(
					"/bookings?limit=100",
				)
			).data,
	});

	const advance = useMutation({
		mutationFn: async (input: { id: string; status: string }) => {
			await workspaceApi(workspaceId).request(`/bookings/${input.id}/status`, {
				method: "POST",
				body: { status: input.status },
				idempotencyKey: crypto.randomUUID(),
			});
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That change did not save."),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "bookings"],
			}),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<ListControls
				query={search}
				onQueryChange={setSearch}
				placeholder="Search bookings by customer or title"
				filterCount={statuses.length}
				filter={
					<>
						<p className="mb-2 text-[11px] text-[var(--ink-45)]">Status</p>
						<div className="flex flex-wrap gap-1.5">
							{STATUSES.map((status) => (
								<FilterChip
									key={status}
									label={readable(status)}
									active={statuses.includes(status)}
									onToggle={() =>
										setStatuses(
											statuses.includes(status)
												? statuses.filter((value) => value !== status)
												: [...statuses, status],
										)
									}
								/>
							))}
						</div>
					</>
				}
			/>

			{failure ? (
				<p className="mb-3 text-[11.5px] text-[var(--ink-60)]">{failure}</p>
			) : null}

			<PageState
				query={bookings}
				loadingLabel="Loading bookings…"
				isEmpty={(data) => data.items.length === 0}
				empty={
					<EmptyState
						title="Nothing booked"
						detail="Appointments customers make appear here, soonest first, grouped by day."
					/>
				}
			>
				{(data) => {
					const needle = search.trim().toLowerCase();
					const rows = data.items
						.filter((booking) =>
							statuses.length === 0 ? true : statuses.includes(booking.status),
						)
						.filter(
							(booking) =>
								!needle ||
								booking.title.toLowerCase().includes(needle) ||
								(booking.clientName ?? "").toLowerCase().includes(needle),
						)
						.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

					if (rows.length === 0) {
						return (
							<EmptyState
								title="Nothing matches"
								detail="Try a different search, or clear the status filter."
							/>
						);
					}

					const days = [...new Set(rows.map((row) => dayKey(row.startsAt)))];

					return (
						<div className="space-y-5">
							{days.map((day) => (
								<section key={day}>
									<p className="mb-1 text-[11px] text-[var(--ink-45)]">
										{dayLabel(
											rows.find((row) => dayKey(row.startsAt) === day)
												?.startsAt ?? day,
										)}
									</p>
									<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
										{rows
											.filter((row) => dayKey(row.startsAt) === day)
											.map((booking) => {
												const next = NEXT_STATUS[booking.status];
												return (
													<div
														key={booking.id}
														className="flex items-center gap-3 py-2.5"
													>
														<span className="w-32 shrink-0 text-[12px] text-[var(--ink-60)]">
															{timeRange(booking)}
														</span>
														<div className="min-w-0 flex-1">
															<p className="truncate text-[12.5px] text-[var(--ink-85)]">
																{booking.title}
															</p>
															<p className="truncate text-[11px] text-[var(--ink-30)]">
																{booking.clientName ?? "No customer named"}
																{booking.location
																	? ` · ${booking.location}`
																	: ` · ${readable(booking.locationKind)}`}
															</p>
														</div>
														<span className="w-24 shrink-0 text-[11px] text-[var(--ink-30)] capitalize">
															{readable(booking.status)}
														</span>
														{next ? (
															<button
																type="button"
																className={quiet}
																disabled={rowBusy(advance, booking.id)}
																onClick={() =>
																	advance.mutate({
																		id: booking.id,
																		status: next.status,
																	})
																}
															>
																{next.label}
															</button>
														) : null}
													</div>
												);
											})}
									</div>
								</section>
							))}
						</div>
					);
				}}
			</PageState>
		</main>
	);
}
