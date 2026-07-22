"use client";

import { CaretDown, CaretUp, Check, Circle, X } from "@phosphor-icons/react";
import { Button } from "@quickengine/ui/components/ui/button";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { FirstActionChecklistItem } from "../_lib/first-action-checklist";
import { saveFirstActionChecklistPresentationAction } from "../_lib/first-action-checklist-actions";

export function FirstActionChecklist({
	workspaceId,
	items,
	initialCollapsed,
	initialDismissed,
}: {
	workspaceId: string;
	items: readonly FirstActionChecklistItem[];
	initialCollapsed: boolean;
	initialDismissed: boolean;
}) {
	const [collapsed, setCollapsed] = useState(initialCollapsed);
	const [dismissed, setDismissed] = useState(initialDismissed);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const completed = items.filter((item) => item.completed).length;
	const percent = items.length === 0 ? 0 : (completed / items.length) * 100;

	if (items.length === 0 || dismissed) return null;

	function persist(nextCollapsed: boolean, nextDismissed: boolean) {
		const previousCollapsed = collapsed;
		const previousDismissed = dismissed;
		setCollapsed(nextCollapsed);
		setDismissed(nextDismissed);
		setError(null);
		startTransition(async () => {
			const result = await saveFirstActionChecklistPresentationAction({
				workspaceId,
				collapsed: nextCollapsed,
				dismissed: nextDismissed,
			});
			if (!result.ok) {
				setCollapsed(previousCollapsed);
				setDismissed(previousDismissed);
				setError(result.error);
			}
		});
	}

	if (collapsed) {
		return (
			<div className="fixed right-5 bottom-5 z-40">
				<Button
					type="button"
					variant="outline"
					className="h-11 rounded-full bg-background px-4 shadow-lg"
					disabled={pending}
					onClick={() => persist(false, false)}
				>
					<span className="font-medium">Getting started</span>
					<span className="text-muted-foreground text-xs">
						{completed}/{items.length}
					</span>
					<CaretUp />
				</Button>
			</div>
		);
	}

	return (
		<aside
			aria-label="Getting started"
			className="fixed right-5 bottom-5 z-40 w-[min(24rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border bg-background shadow-xl"
		>
			<div className="flex items-start justify-between gap-4 border-b px-4 py-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-3">
						<h2 className="font-semibold text-sm">Getting started</h2>
						<span className="text-muted-foreground text-xs">
							{completed} of {items.length}
						</span>
					</div>
					<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary transition-[width]"
							style={{ width: `${percent}%` }}
						/>
					</div>
				</div>
				<div className="flex gap-1">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Collapse getting started"
						disabled={pending}
						onClick={() => persist(true, false)}
					>
						<CaretDown />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Dismiss getting started"
						disabled={pending}
						onClick={() => persist(true, true)}
					>
						<X />
					</Button>
				</div>
			</div>
			<div className="p-2">
				{items.map((item) => (
					<Link
						key={item.id}
						href={item.href}
						className="flex gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<span className="mt-0.5 text-muted-foreground">
							{item.completed ? (
								<span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
									<Check weight="bold" className="size-3" />
								</span>
							) : (
								<Circle className="size-5" />
							)}
						</span>
						<span className="min-w-0">
							<span
								className={
									item.completed
										? "block font-medium text-muted-foreground text-sm line-through"
										: "block font-medium text-sm"
								}
							>
								{item.label}
							</span>
							<span className="block text-muted-foreground text-xs">
								{item.description}
							</span>
						</span>
					</Link>
				))}
			</div>
			{error && (
				<p className="border-t px-4 py-2 text-destructive text-xs" role="alert">
					{error}
				</p>
			)}
		</aside>
	);
}
