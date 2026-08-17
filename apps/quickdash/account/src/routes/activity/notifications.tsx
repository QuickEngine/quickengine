import { CheckIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequestFailure } from "../../components/page-state";
import { SkeletonRows } from "../../components/skeletons";
import type { Notification } from "../../lib/account-api";
import { accountQueries } from "../../lib/account-api";
import { api } from "../../lib/api";

/**
 * Activity → Notifications. Everything the product has told you.
 *
 * 🔴 **User-scoped, not organization-scoped.** These are addressed to YOU — a
 * teammate signed in beside you has their own list, and switching organization
 * does not change what is here. Saying so on the page prevents the reasonable
 * assumption that an empty list means nothing happened.
 *
 * The sidebar bell shows the same records; this is where the read ones survive.
 */

const quietAction =
	"inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-3.5 text-[11.5px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] focus-visible:bg-[rgb(var(--console-ink)/0.06)] disabled:pointer-events-none disabled:opacity-40";

const FILTERS = [
	{ id: "all", label: "All" },
	{ id: "unread", label: "Unread" },
] as const;

const when = (value: string) => {
	const elapsed = Date.now() - new Date(value).getTime();
	const minutes = Math.round(elapsed / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return days < 7
		? `${days}d ago`
		: new Intl.DateTimeFormat("en", {
				month: "short",
				day: "numeric",
			}).format(new Date(value));
};

function NotificationsPage() {
	const queryClient = useQueryClient();
	const notifications = useQuery(accountQueries.notifications());
	const [filter, setFilter] = useState<"all" | "unread">("all");
	const [failure, setFailure] = useState<string | null>(null);

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["account", "notifications"] });

	const markRead = useMutation({
		mutationFn: async (id: string) =>
			api.request(`/account/notifications/${id}/read`, { method: "POST" }),
		onSuccess: refresh,
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That could not be marked as read."),
	});

	const markAllRead = useMutation({
		mutationFn: async () =>
			api.request("/account/notifications/read-all", { method: "POST" }),
		onSuccess: refresh,
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "Those could not be marked as read."),
	});

	const items = notifications.data?.items ?? [];
	const unread = notifications.data?.unread ?? 0;
	const visible = filter === "unread" ? items.filter((n) => !n.readAt) : items;
	const busy = markRead.isPending || markAllRead.isPending;

	/** Opening one reads it. Following the link without marking it would leave a
	 * bell counting things you have already dealt with. */
	const open = async (item: Notification) => {
		if (!item.readAt) await markRead.mutateAsync(item.id);
		if (item.href) window.location.assign(item.href);
	};

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
				<p className="max-w-2xl text-[11.5px] text-[var(--ink-30)] leading-5">
					Addressed to you, not to the organization — a teammate signed in
					beside you has their own list.
				</p>
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1">
						{FILTERS.map((option) => (
							<button
								key={option.id}
								type="button"
								aria-pressed={filter === option.id}
								onClick={() => setFilter(option.id)}
								className={`h-7 rounded-full px-2.5 text-[11.5px] outline-none transition-colors ${
									filter === option.id
										? "bg-[rgb(var(--console-ink)/0.07)] text-[var(--ink-85)]"
										: "text-[var(--ink-35)] hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-70)]"
								}`}
							>
								{option.label}
								{option.id === "unread" && unread > 0 ? (
									<span className="text-[var(--ink-30)]">{` ${unread}`}</span>
								) : null}
							</button>
						))}
					</div>
					{unread > 0 ? (
						<button
							type="button"
							disabled={busy}
							onClick={() => markAllRead.mutate()}
							className={quietAction}
						>
							<CheckIcon size={12} className="mr-1.5" />
							Mark all read
						</button>
					) : null}
				</div>
			</div>

			{failure ? (
				<p className="mb-4 text-[12px] text-[#ff6b6b]">{failure}</p>
			) : null}

			{notifications.isPending ? (
				<SkeletonRows rows={4} />
			) : notifications.isError ? (
				<RequestFailure
					error={notifications.error}
					onRetry={() => {
						void notifications.refetch();
					}}
				/>
			) : visible.length === 0 ? (
				<p className="py-6 text-[12px] text-[var(--ink-30)]">
					{filter === "unread"
						? "Nothing unread."
						: "Nothing yet. Invitations, teammates joining and security events arrive here."}
				</p>
			) : (
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{visible.map((item) => (
						<div key={item.id} className="flex items-start gap-3 py-3">
							{/* Unread is a dot in the margin, not a coloured row. A list where
							    most rows shout has no emphasis left for the one that matters. */}
							<span
								aria-hidden="true"
								className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
									item.readAt ? "bg-transparent" : "bg-[var(--ink-75)]"
								}`}
							/>
							<div className="min-w-0 flex-1">
								{item.href ? (
									<button
										type="button"
										disabled={busy}
										onClick={() => void open(item)}
										className="text-left outline-none"
									>
										<p
											className={`text-[12.5px] ${item.readAt ? "text-[var(--ink-45)]" : "text-[var(--ink-90)]"}`}
										>
											{item.title}
										</p>
									</button>
								) : (
									<p
										className={`text-[12.5px] ${item.readAt ? "text-[var(--ink-45)]" : "text-[var(--ink-90)]"}`}
									>
										{item.title}
									</p>
								)}
								{item.body ? (
									<p className="mt-1 text-[11.5px] text-[var(--ink-30)] leading-5">
										{item.body}
									</p>
								) : null}
							</div>
							<div className="flex shrink-0 items-center gap-3">
								{item.readAt ? null : (
									<button
										type="button"
										disabled={busy}
										onClick={() => markRead.mutate(item.id)}
										className="text-[11px] text-[var(--ink-30)] outline-none transition-colors hover:text-[var(--ink-75)]"
									>
										Mark read
									</button>
								)}
								<p className="w-20 text-right text-[11px] text-[var(--ink-25)]">
									{when(item.createdAt)}
								</p>
							</div>
						</div>
					))}
				</div>
			)}
		</main>
	);
}

export const Route = createFileRoute("/activity/notifications")({
	component: NotificationsPage,
});
