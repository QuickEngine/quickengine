import { CheckIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionApi } from "../lib/api";
import type {
	NotificationSignal,
	QuickDashNotification,
} from "../lib/quickdash-api";

/**
 * The same three colours the toasts use, so a notification looks identical
 * whether it arrived in the corner or is being read back an hour later.
 */
const ACCENT: Record<NotificationSignal, string> = {
	news: "var(--signal-news)",
	attention: "var(--signal-attention)",
	failure: "var(--signal-failure)",
};

/**
 * The notification panel, in the sidebar's navigation slot.
 *
 * Identical behaviour to Account's, on purpose: it is the same inbox, and a
 * person moving between the two apps should not have to learn it twice.
 */

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
];

function createdLabel(value: string) {
	const difference = new Date(value).getTime() - Date.now();
	for (const [unit, milliseconds] of units) {
		if (Math.abs(difference) >= milliseconds) {
			return relativeTime.format(Math.round(difference / milliseconds), unit);
		}
	}
	return "just now";
}

export function WorkspaceNotifications({
	items,
	unread,
}: {
	items: QuickDashNotification[];
	unread: number;
}) {
	const queryClient = useQueryClient();
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["quickdash", "notifications"] });

	const markRead = useMutation({
		mutationFn: (id: string) =>
			sessionApi.request(`/account/notifications/${id}/read`, {
				method: "POST",
			}),
		onSuccess: refresh,
	});
	const markAllRead = useMutation({
		mutationFn: () =>
			sessionApi.request("/account/notifications/read-all", { method: "POST" }),
		onSuccess: refresh,
	});
	const pending = markRead.isPending || markAllRead.isPending;

	async function open(item: QuickDashNotification) {
		if (!item.readAt) await markRead.mutateAsync(item.id);
		if (item.href) window.location.assign(item.href);
	}

	return (
		<section className="flex min-h-0 flex-1 flex-col">
			{/* No heading. You got here by pressing the bell, so a label saying
			    "Notifications" is the panel telling you what you just clicked.
			    The row survives only to hold "mark all read", and only while
			    there is something to mark. */}
			<header className="flex shrink-0 items-center justify-end gap-2 px-3 pt-1">
				{unread > 0 ? (
					<button
						type="button"
						disabled={pending}
						onClick={() => markAllRead.mutate()}
						aria-label="Mark all notifications as read"
						className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--ink-30)] transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-75)] disabled:opacity-40"
					>
						<CheckIcon size={14} />
					</button>
				) : null}
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
				{items.length === 0 ? (
					<div className="flex min-h-40 flex-col items-center justify-center px-4 text-center">
						<p className="text-[12px] text-[var(--ink-55)]">
							You&rsquo;re all caught up.
						</p>
						<p className="mt-1 text-[10.5px] text-[var(--ink-25)] leading-4">
							Notifications follow you, not the workspace.
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-1">
						{items.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									disabled={pending}
									onClick={() => void open(item)}
									className={`group relative w-full rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] disabled:opacity-50 ${item.readAt ? "text-[var(--ink-38)]" : "bg-[rgb(var(--console-ink)/0.025)] text-[var(--ink-80)]"}`}
								>
									{/* 🔑 The unread dot carries the SIGNAL rather than a neutral
									    grey. Scanning a stacked inbox, colour is what separates
									    "you made a sale" from "a payment was disputed" before a
									    single word has been read. Read rows drop to the muted
									    dot: the severity mattered when it needed acting on. */}
									<span
										className="absolute top-3 right-2 size-1.5 rounded-full"
										style={{
											background: item.readAt
												? "rgb(var(--console-ink)/0.12)"
												: ACCENT[item.signal],
										}}
									/>
									<p className="pr-4 text-[11.5px] leading-4">{item.title}</p>
									{item.body ? (
										<p className="mt-1 line-clamp-3 text-[10.5px] text-[var(--ink-30)] leading-4">
											{item.body}
										</p>
									) : null}
									<p className="mt-1.5 text-[9.5px] text-[var(--ink-20)]">
										{createdLabel(item.createdAt)}
									</p>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
