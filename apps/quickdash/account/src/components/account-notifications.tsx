import { CheckIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Notification, NotificationSignal } from "../lib/account-api";
import { api } from "../lib/api";

/** The same three colours QuickDash uses, for the same one inbox. */
const ACCENT: Record<NotificationSignal, string> = {
	news: "var(--signal-news)",
	attention: "var(--signal-attention)",
	failure: "var(--signal-failure)",
};

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

export function AccountNotifications({
	items,
	unread,
}: {
	items: Notification[];
	unread: number;
}) {
	const queryClient = useQueryClient();
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["account", "notifications"] });
	const markRead = useMutation({
		mutationFn: (id: string) =>
			api.request(`/account/notifications/${id}/read`, { method: "POST" }),
		onSuccess: refresh,
	});
	const markAllRead = useMutation({
		mutationFn: () =>
			api.request("/account/notifications/read-all", { method: "POST" }),
		onSuccess: refresh,
	});
	const pending = markRead.isPending || markAllRead.isPending;

	async function openNotification(item: Notification) {
		if (!item.readAt) await markRead.mutateAsync(item.id);
		if (item.href) window.location.assign(item.href);
	}

	return (
		<section className="flex min-h-0 flex-1 flex-col">
			{/* No heading — you got here by pressing the bell. Same as QuickDash. */}
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
							You’re all caught up.
						</p>
						<p className="mt-1 text-[10.5px] leading-4 text-[var(--ink-25)]">
							New account activity will appear here.
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-1">
						{items.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									disabled={pending}
									onClick={() => void openNotification(item)}
									className={`group relative w-full rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] disabled:opacity-50 ${item.readAt ? "text-[var(--ink-38)]" : "bg-[rgb(var(--console-ink)/0.025)] text-[var(--ink-80)]"}`}
								>
									{/* 🔑 The unread dot carries the SIGNAL, matching QuickDash.
									    This is one inbox seen from two consoles, and a message
									    that looks urgent in one and ordinary in the other is
									    worse than no colour at all. */}
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
										<p className="mt-1 line-clamp-3 text-[10.5px] leading-4 text-[var(--ink-30)]">
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
