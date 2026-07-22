"use client";

import {
	CaretDown,
	CaretUp,
	Check,
	CheckCircle,
	Circle,
	X,
} from "@phosphor-icons/react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@quickengine/ui/components/ui/accordion";
import { Button } from "@quickengine/ui/components/ui/button";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
	type FirstActionChecklistItem,
	isFirstActionChecklistComplete,
} from "../_lib/first-action-checklist";
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
			<div className="fixed right-5 bottom-5 z-40">
				<Button
					type="button"
					variant="secondary"
					className="h-11 rounded-full border bg-card px-4 text-card-foreground opacity-100 shadow-lg hover:bg-muted"
					disabled={pending}
					onClick={() => {
						setOpenGoalId("");
						persist(false, false);
					}}
				>
					<span className="font-medium">Getting started</span>
					<span className="text-muted-foreground text-xs">
						{completed}/{requiredSteps.length}
					</span>
					<CaretUp />
				</Button>
			</div>
		);
	}

	if (allCompleted) {
		return (
			<aside
				aria-label="Getting started complete"
				aria-live="polite"
				className="fixed right-5 bottom-5 z-40 w-[min(24rem,calc(100vw-2.5rem))] rounded-2xl border bg-background p-5 shadow-xl"
			>
				<div className="flex items-start gap-3">
					<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
						<CheckCircle className="size-6" weight="fill" />
					</span>
					<div>
						<h2 className="font-semibold">You’re ready to go</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Your workspace setup is complete. Everything is ready for what you
							build next.
						</p>
					</div>
				</div>
				<div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
					<div className="h-full w-full rounded-full bg-primary" />
				</div>
				{error && (
					<p className="mt-3 text-destructive text-xs" role="alert">
						{error}
					</p>
				)}
				<Button
					type="button"
					className="mt-4 w-full"
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
			className="fixed right-5 bottom-5 z-40 w-[min(24rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border bg-background shadow-xl"
		>
			<div className="flex items-start justify-between gap-4 border-b px-4 py-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-3">
						<h2 className="font-semibold text-sm">Getting started</h2>
						<span className="text-muted-foreground text-xs">
							{completed} of {requiredSteps.length}
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
									<Check
										className="size-4 shrink-0 text-primary"
										weight="bold"
									/>
								) : (
									<Circle className="size-4 shrink-0 text-muted-foreground" />
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
										<Check
											className="mt-0.5 size-3.5 shrink-0 text-primary"
											weight="bold"
										/>
									) : (
										<Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
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
				<p className="border-t px-4 py-2 text-destructive text-xs" role="alert">
					{error}
				</p>
			)}
		</aside>
	);
}
