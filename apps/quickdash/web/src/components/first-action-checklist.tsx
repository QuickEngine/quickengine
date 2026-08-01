"use client";

import {
	CaretDownIcon,
	CaretUpIcon,
	CheckCircleIcon,
	CheckIcon,
	CircleIcon,
	XIcon,
} from "@phosphor-icons/react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@quickengine/ui/components/ui/accordion";
import { Button } from "@quickengine/ui/components/ui/button";
import { useState, useTransition } from "react";
import {
	type FirstActionChecklistItem,
	isFirstActionChecklistComplete,
} from "../_lib/first-action-checklist";
import { saveFirstActionChecklistPresentationAction } from "../_lib/first-action-checklist-actions";
import Link from "../compat/router-link";

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
	const [openGoalId, setOpenGoalId] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const requiredSteps = items
		.flatMap((item) => item.steps)
		.filter((step) => !step.optional);
	const completed = requiredSteps.filter((step) => step.completed).length;
	const percent =
		requiredSteps.length === 0 ? 0 : (completed / requiredSteps.length) * 100;
	const allCompleted = isFirstActionChecklistComplete(items);

	if (requiredSteps.length === 0 || dismissed) return null;

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
			<div className="fixed right-8 bottom-8 z-40">
				<Button
					type="button"
					variant="secondary"
					className="btn btn-secondary h-9 gap-2 rounded-full border-[var(--b3)] bg-[var(--b2)] px-4 font-body text-[13px] text-ink shadow-2xl shadow-black/50"
					disabled={pending}
					onClick={() => {
						setOpenGoalId("");
						persist(false, false);
					}}
				>
					<span className="font-[450]">Getting started</span>
					<span className="text-[12px] text-dim">
						{completed}/{requiredSteps.length}
					</span>
					<CaretUpIcon size={13} />
				</Button>
			</div>
		);
	}

	if (allCompleted) {
		return (
			<aside
				aria-label="Getting started complete"
				aria-live="polite"
				className="fixed right-8 bottom-8 z-40 w-[min(22rem,calc(100vw-4rem))] rounded-xl border border-[var(--b3)] bg-[var(--b2)] p-5 shadow-2xl shadow-black/50"
			>
				<div className="flex items-start gap-3">
					<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-void text-signal">
						<CheckCircleIcon size={18} weight="fill" />
					</span>
					<div>
						<h2 className="font-body font-[450] text-[14px] text-ink">
							You’re ready to go
						</h2>
						<p className="mt-1 font-body text-[12px] text-dim leading-relaxed">
							Your workspace setup is complete. Everything is ready for what you
							build next.
						</p>
					</div>
				</div>
				<div className="mt-4 h-1 overflow-hidden rounded-full bg-void">
					<div className="h-full w-full rounded-full bg-signal" />
				</div>
				{error && (
					<p
						className="mt-3 font-body text-[11px] text-destructive"
						role="alert"
					>
						{error}
					</p>
				)}
				<Button
					type="button"
					className="btn btn-primary mt-4 h-8 w-full rounded-full bg-invert font-body font-[450] text-[13px] text-on-invert"
					disabled={pending}
					onClick={() => persist(true, true)}
				>
					Start Building
				</Button>
			</aside>
		);
	}

	return (
		<aside
			aria-label="Getting started"
			className="fixed right-8 bottom-8 z-40 w-[min(22rem,calc(100vw-4rem))] overflow-hidden rounded-xl border border-[var(--b3)] bg-[var(--b2)] shadow-2xl shadow-black/50"
		>
			<div className="flex items-start justify-between gap-4 border-[var(--b3)] border-b px-4 py-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-3">
						<h2 className="font-body font-[450] text-[13px] text-ink">
							Getting started
						</h2>
						<span className="font-body text-[12px] text-dim">
							{completed} of {requiredSteps.length}
						</span>
					</div>
					<div className="mt-2 h-1 overflow-hidden rounded-full bg-void">
						<div
							className="h-full rounded-full bg-signal transition-[width]"
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
						<CaretDownIcon size={13} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Dismiss getting started"
						disabled={pending}
						onClick={() => persist(true, true)}
					>
						<XIcon size={13} />
					</Button>
				</div>
			</div>
			<Accordion
				type="single"
				collapsible
				value={openGoalId}
				onValueChange={setOpenGoalId}
				className="p-2"
			>
				{items.map((item) => (
					<AccordionItem key={item.id} value={item.id} className="px-2">
						<AccordionTrigger className="gap-2 px-1 py-3 hover:no-underline">
							<span className="flex min-w-0 items-center gap-2">
								{item.completed ? (
									<CheckIcon
										size={14}
										weight="bold"
										className="shrink-0 text-signal"
									/>
								) : (
									<CircleIcon size={14} className="shrink-0 text-dim" />
								)}
								<span className="truncate">{item.label}</span>
							</span>
						</AccordionTrigger>
						<AccordionContent className="ml-2 border-l pb-2 pl-4">
							{item.steps.map((step) => (
								<Link
									key={step.id}
									href={step.href}
									className={`-ml-2 flex gap-2 rounded-lg px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${step.isNext ? "bg-muted" : ""}`}
								>
									{step.completed ? (
										<CheckIcon
											size={13}
											weight="bold"
											className="mt-0.5 shrink-0 text-signal"
										/>
									) : (
										<CircleIcon
											size={13}
											className="mt-0.5 shrink-0 text-dim"
										/>
									)}
									<span className="min-w-0">
										<span
											className={
												step.completed
													? "block text-muted-foreground text-xs line-through"
													: "block font-medium text-xs"
											}
										>
											{step.label}
											{step.optional ? " (optional)" : ""}
										</span>
										<span className="block text-muted-foreground text-xs">
											{step.description}
										</span>
									</span>
								</Link>
							))}
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
			{error && (
				<p
					className="border-[var(--b3)] border-t px-4 py-2 font-body text-[11px] text-destructive"
					role="alert"
				>
					{error}
				</p>
			)}
		</aside>
	);
}
