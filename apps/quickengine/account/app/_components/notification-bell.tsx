"use client";

import { Bell } from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { ScrollArea } from "@quickengine/ui/components/ui/scroll-area";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
	markAllNotificationsReadAction,
	markNotificationReadAction,
} from "../_lib/notification-actions";

export type InboxItem = {
	id: string;
	title: string;
	body: string | null;
	href: string | null;
	unread: boolean;
	createdAt: string;
};

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
];

function relativeTime(iso: string): string {
	const diff = new Date(iso).getTime() - Date.now();
	for (const [unit, ms] of UNITS) {
		if (Math.abs(diff) >= ms)
			return RELATIVE.format(Math.round(diff / ms), unit);
	}
	return "just now";
}

// The header notification inbox: a bell with an unread badge and a popover list.
// Initial data is server-fetched; actions mark rows read and refresh the server tree.
export function NotificationBell({
	items,
	unread,
}: {
	items: InboxItem[];
	unread: number;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	function markAll() {
		startTransition(async () => {
			await markAllNotificationsReadAction();
			router.refresh();
		});
	}

	function openItem(item: InboxItem) {
		startTransition(async () => {
			if (item.unread) await markNotificationReadAction(item.id);
			setOpen(false);
			if (item.href) router.push(item.href);
			else router.refresh();
		});
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
					className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
				>
					<Bell className="size-5" />
					{unread > 0 && (
						<span className="-right-0.5 -top-0.5 absolute flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground">
							{unread > 9 ? "9+" : unread}
						</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="flex items-center justify-between border-foreground/[0.06] border-b px-4 py-3">
					<span className="font-medium text-foreground text-sm">
						Notifications
					</span>
					{unread > 0 && (
						<button
							type="button"
							onClick={markAll}
							disabled={pending}
							className="text-muted-foreground text-xs transition-colors hover:text-foreground disabled:opacity-50"
						>
							Mark all read
						</button>
					)}
				</div>
				{items.length === 0 ? (
					<p className="px-4 py-10 text-center text-muted-foreground text-sm">
						You're all caught up.
					</p>
				) : (
					<ScrollArea className="max-h-80">
						<ul className="divide-y divide-foreground/[0.06]">
							{items.map((item) => (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => openItem(item)}
										disabled={pending}
										className={`w-full px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03] ${
											item.unread ? "bg-foreground/[0.02]" : ""
										}`}
									>
										<div className="flex items-start gap-2">
											<span
												className={`mt-1.5 size-2 shrink-0 rounded-full ${
													item.unread ? "bg-primary" : "bg-transparent"
												}`}
											/>
											<div className="min-w-0">
												<p className="text-foreground text-sm">{item.title}</p>
												{item.body && (
													<p className="mt-0.5 text-muted-foreground text-xs">
														{item.body}
													</p>
												)}
												<p className="mt-1 text-[11px] text-muted-foreground">
													{relativeTime(item.createdAt)}
												</p>
											</div>
										</div>
									</button>
								</li>
							))}
						</ul>
					</ScrollArea>
				)}
			</PopoverContent>
		</Popover>
	);
}
