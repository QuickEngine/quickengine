import {
	ChecksIcon,
	EnvelopeSimpleIcon,
	EnvelopeSimpleOpenIcon,
	type Icon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { sessionApi } from "../lib/api";
import { follow } from "../lib/go";
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
 *
 * ── Why there are this many controls ─────────────────────────────────────────
 *
 * 🔴 This was one unlabelled tick, and it read as "delete everything". It did
 * not — it marked all read, and read rows stay in the list — but nothing on
 * screen said so, there was no way to put one back, and no way to get rid of a
 * single row you had dealt with. An icon whose effect you cannot predict and
 * cannot undo is a button people learn not to press.
 *
 * So every bulk action now says what it does in words, and every row carries
 * the two things you actually want: mark it unread again, or get rid of it.
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

/**
 * A header action.
 *
 * 🔑 The label is always rendered, never only a tooltip. The panel is narrow,
 * so the temptation is three bare icons in a row — which is exactly how the
 * tick got mistaken for a delete. Words cost about forty pixels each and
 * remove the guessing entirely.
 */
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

/** A row action. Icon only, because it appears beside the row it belongs to. */
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

export function WorkspaceNotifications({
	items,
	unread,
}: {
	items: QuickDashNotification[];
	unread: number;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	/**
	 * Show everything, or only what still needs attention.
	 *
	 * 🔑 This is half the answer to "the tick deleted my notifications". Marking
	 * all read greys the whole list at once, which looks like a wipe; a filter
	 * that can bring them straight back proves it was not.
	 */
	const [unreadOnly, setUnreadOnly] = useState(false);

	/**
	 * 🔴 Matched by PREDICATE, not by prefix.
	 *
	 * The list is keyed `["quickdash", <workspaceId>, "notifications"]`, and this
	 * invalidated `["quickdash", "notifications"]`. TanStack matches keys by
	 * PREFIX, and that prefix does not match — the workspace id sits in the
	 * middle. So marking one read, or all of them, refreshed nothing: the badge
	 * kept its old count until the sixty-second poll came round, which reads as
	 * the button not working.
	 *
	 * ⚠️ Deliberately not narrowed to the current workspace. Read state belongs
	 * to the PERSON, so marking something read while standing in one workspace
	 * must not leave a stale count waiting in another.
	 */
	const refresh = () =>
		queryClient.invalidateQueries({
			predicate: (query) =>
				query.queryKey[0] === "quickdash" &&
				query.queryKey.includes("notifications"),
		});

	const markRead = useMutation({
		mutationFn: (id: string) =>
			sessionApi.request(`/account/notifications/${id}/read`, {
				method: "POST",
			}),
		onSuccess: refresh,
	});
	const markUnread = useMutation({
		mutationFn: (id: string) =>
			sessionApi.request(`/account/notifications/${id}/unread`, {
				method: "POST",
			}),
		onSuccess: refresh,
	});
	const dismiss = useMutation({
		mutationFn: (id: string) =>
			sessionApi.request(`/account/notifications/${id}`, { method: "DELETE" }),
		onSuccess: refresh,
	});
	const markAllRead = useMutation({
		mutationFn: () =>
			sessionApi.request("/account/notifications/read-all", { method: "POST" }),
		onSuccess: refresh,
	});
	const clearRead = useMutation({
		mutationFn: () =>
			sessionApi.request("/account/notifications/clear-read", {
				method: "POST",
			}),
		onSuccess: refresh,
	});
	const pending =
		markAllRead.isPending || clearRead.isPending || dismiss.isPending;

	async function open(item: QuickDashNotification) {
		if (!item.readAt) await markRead.mutateAsync(item.id);
		if (item.href) follow(navigate, item.href);
	}

	const shown = unreadOnly ? items.filter((item) => !item.readAt) : items;
	const readCount = items.length - items.filter((item) => !item.readAt).length;

	return (
		<section className="flex min-h-0 flex-1 flex-col">
			{/* No heading. You got here by pressing the bell, so a label saying
			    "Notifications" is the panel telling you what you just clicked.
			    The row holds the things that act on the whole list. */}
			<header className="shrink-0 px-2 pt-1">
				<div className="flex items-center gap-1">
					{/* The filter reads as one control, so the two halves share an edge
					    rather than sitting 4px apart like separate buttons do. */}
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
				{/* ⚠️ "Clear" is the one destructive control here, and what it spares
				    is not obvious from the word. Saying so costs one line and stops
				    somebody hesitating over it for ever. */}
				{readCount > 0 ? (
					<p className="mt-1 px-1 text-[9.5px] text-[var(--ink-20)] leading-3">
						Clear removes the {readCount} you have read. Unread stay.
					</p>
				) : null}
			</header>

			{/* 4px between the controls and the first row: they are separate things,
			    and a flush edge makes the top notification look like part of the
			    toolbar. */}
			<div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
				{shown.length === 0 ? (
					<div className="flex min-h-40 flex-col items-center justify-center px-4 text-center">
						<p className="text-[12px] text-[var(--ink-55)]">
							{unreadOnly && items.length > 0
								? "Nothing unread."
								: "You’re all caught up."}
						</p>
						<p className="mt-1 text-[10.5px] text-[var(--ink-25)] leading-4">
							{unreadOnly && items.length > 0
								? "Switch to All to see the ones you have read."
								: "Notifications follow you, not the workspace."}
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-1">
						{shown.map((item) => (
							<li key={item.id} className="group relative">
								<button
									type="button"
									onClick={() => void open(item)}
									className={`w-full rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] ${item.readAt ? "text-[var(--ink-38)]" : "bg-[rgb(var(--console-ink)/0.025)] text-[var(--ink-80)]"}`}
								>
									{/* 🔑 The unread dot carries the SIGNAL rather than a neutral
									    grey. Scanning a stacked inbox, colour is what separates
									    "you made a sale" from "a payment was disputed" before a
									    single word has been read. Read rows drop to the muted
									    dot: the severity mattered when it needed acting on. */}
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
										<p className="mt-1 line-clamp-3 text-[10.5px] text-[var(--ink-30)] leading-4">
											{item.body}
										</p>
									) : null}
									<p className="mt-1.5 text-[9.5px] text-[var(--ink-20)]">
										{createdLabel(item.createdAt)}
									</p>
								</button>
								{/* 🔴 A SIBLING of the row button, not a child. Nesting a button
								    inside a button is invalid, and browsers resolve it by
								    dropping one of them — so the dismiss would have opened the
								    notification instead. */}
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
