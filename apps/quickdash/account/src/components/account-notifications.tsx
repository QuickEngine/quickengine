import {
	ChecksIcon,
	EnvelopeSimpleIcon,
	EnvelopeSimpleOpenIcon,
	type Icon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Notification, NotificationSignal } from "../lib/account-api";
import { api } from "../lib/api";

/** The same three colours QuickDash uses, for the same one inbox. */
const ACCENT: Record<NotificationSignal, string> = {
	news: "var(--signal-news)",
	attention: "var(--signal-attention)",
	failure: "var(--signal-failure)",
};

/**
 * ⚠️ Kept deliberately in step with QuickDash's `workspace-notifications.tsx`.
 *
 * It is ONE inbox seen from two consoles. The TOTP bug is the warning here: the
 * same logic lived in two apps with nothing linking them, fixing one left the
 * other broken, and only CI noticed. If a control is added here, add it there.
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

function BulkAction({
	icon: Glyph,
	label,
	onClick,
	disabled,
}: {
	icon: Icon;
	label: string;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] text-[var(--ink-45)] transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-80)] disabled:opacity-40"
		>
			<Glyph size={13} />
			{label}
		</button>
	);
}

function RowAction({
	icon: Glyph,
	label,
	onClick,
}: {
	icon: Icon;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			onClick={onClick}
			className="flex size-6 items-center justify-center rounded text-[var(--ink-35)] transition-colors hover:bg-[rgb(var(--console-ink)/0.08)] hover:text-[var(--ink-85)]"
		>
			<Glyph size={13} />
		</button>
	);
}

export function AccountNotifications({
	items,
	unread,
}: {
	items: Notification[];
	unread: number;
}) {
	const queryClient = useQueryClient();
	const [unreadOnly, setUnreadOnly] = useState(false);
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["account", "notifications"] });

	const markRead = useMutation({
		mutationFn: (id: string) =>
			api.request(`/account/notifications/${id}/read`, { method: "POST" }),
		onSuccess: refresh,
	});
	const markUnread = useMutation({
		mutationFn: (id: string) =>
			api.request(`/account/notifications/${id}/unread`, { method: "POST" }),
		onSuccess: refresh,
	});
	const dismiss = useMutation({
		mutationFn: (id: string) =>
			api.request(`/account/notifications/${id}`, { method: "DELETE" }),
		onSuccess: refresh,
	});
	const markAllRead = useMutation({
		mutationFn: () =>
			api.request("/account/notifications/read-all", { method: "POST" }),
		onSuccess: refresh,
	});
	const clearRead = useMutation({
		mutationFn: () =>
			api.request("/account/notifications/clear-read", { method: "POST" }),
		onSuccess: refresh,
	});
	const pending =
		markAllRead.isPending || clearRead.isPending || dismiss.isPending;

	async function openNotification(item: Notification) {
		if (!item.readAt) await markRead.mutateAsync(item.id);
		if (item.href) window.location.assign(item.href);
	}

	const shown = unreadOnly ? items.filter((item) => !item.readAt) : items;
	const readCount = items.length - items.filter((item) => !item.readAt).length;

	return (
		<section className="flex min-h-0 flex-1 flex-col">
			{/* No heading — you got here by pressing the bell. Same as QuickDash. */}
			<header className="shrink-0 px-2 pt-1">
				<div className="flex items-center gap-1">
					<div className="flex shrink-0 items-center rounded-md bg-[rgb(var(--console-ink)/0.04)] p-0.5">
						{(
							[
								["All", false],
								["Unread", true],
							] as const
						).map(([label, value]) => (
							<button
								key={label}
								type="button"
								onClick={() => setUnreadOnly(value)}
								className={`h-6 rounded px-2 text-[10.5px] transition-colors ${
									unreadOnly === value
										? "bg-[var(--console-card)] text-[var(--ink-85)]"
										: "text-[var(--ink-35)] hover:text-[var(--ink-65)]"
								}`}
							>
								{label}
								{value && unread > 0 ? (
									<span className="ml-1 text-[var(--ink-45)]">{unread}</span>
								) : null}
							</button>
						))}
					</div>
					<div className="ml-auto flex items-center gap-0.5">
						{unread > 0 ? (
							<BulkAction
								icon={ChecksIcon}
								label="Read"
								disabled={pending}
								onClick={() => markAllRead.mutate()}
							/>
						) : null}
						{readCount > 0 ? (
							<BulkAction
								icon={TrashIcon}
								label="Clear"
								disabled={pending}
								onClick={() => clearRead.mutate()}
							/>
						) : null}
					</div>
				</div>
				{readCount > 0 ? (
					<p className="mt-1 px-1 text-[9.5px] leading-3 text-[var(--ink-20)]">
						Clear removes the {readCount} you have read. Unread stay.
					</p>
				) : null}
			</header>

			{/* 4px, so the first row does not read as part of the toolbar. */}
			<div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
				{shown.length === 0 ? (
					<div className="flex min-h-40 flex-col items-center justify-center px-4 text-center">
						<p className="text-[12px] text-[var(--ink-55)]">
							{unreadOnly && items.length > 0
								? "Nothing unread."
								: "You’re all caught up."}
						</p>
						<p className="mt-1 text-[10.5px] leading-4 text-[var(--ink-25)]">
							{unreadOnly && items.length > 0
								? "Switch to All to see the ones you have read."
								: "New account activity will appear here."}
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-1">
						{shown.map((item) => (
							<li key={item.id} className="group relative">
								<button
									type="button"
									onClick={() => void openNotification(item)}
									className={`w-full rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] ${item.readAt ? "text-[var(--ink-38)]" : "bg-[rgb(var(--console-ink)/0.025)] text-[var(--ink-80)]"}`}
								>
									{/* 🔑 The unread dot carries the SIGNAL, matching QuickDash.
									    This is one inbox seen from two consoles, and a message
									    that looks urgent in one and ordinary in the other is
									    worse than no colour at all. */}
									<span
										className="absolute top-3 right-2 size-1.5 rounded-full transition-opacity group-focus-within:opacity-0 group-hover:opacity-0"
										style={{
											background: item.readAt
												? "rgb(var(--console-ink)/0.12)"
												: ACCENT[item.signal],
										}}
									/>
									<p className="pr-12 text-[11.5px] leading-4">{item.title}</p>
									{item.body ? (
										<p className="mt-1 line-clamp-3 text-[10.5px] leading-4 text-[var(--ink-30)]">
											{item.body}
										</p>
									) : null}
									<p className="mt-1.5 text-[9.5px] text-[var(--ink-20)]">
										{createdLabel(item.createdAt)}
									</p>
								</button>
								{/* 🔴 A SIBLING, not a child — a button inside a button is
								    invalid and the browser drops one of them. */}
								<div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
									{item.readAt ? (
										<RowAction
											icon={EnvelopeSimpleIcon}
											label="Mark unread"
											onClick={() => markUnread.mutate(item.id)}
										/>
									) : (
										<RowAction
											icon={EnvelopeSimpleOpenIcon}
											label="Mark read"
											onClick={() => markRead.mutate(item.id)}
										/>
									)}
									<RowAction
										icon={XIcon}
										label="Dismiss"
										onClick={() => dismiss.mutate(item.id)}
									/>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
