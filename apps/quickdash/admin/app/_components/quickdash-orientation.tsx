"use client";

import { ArrowLeft, ArrowRight, Compass, X } from "@phosphor-icons/react";
import { Button } from "@quickengine/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
	buildQuickDashOrientationSteps,
	getQuickDashOrientationNotchClass,
	getQuickDashOrientationPlacementClass,
} from "../_lib/quickdash-orientation";
import { saveQuickDashOrientationAction } from "../_lib/quickdash-orientation-actions";

export function QuickDashOrientation({
	workspaceId,
	workspaceName,
	shouldOffer,
}: {
	workspaceId: string;
	workspaceName: string;
	shouldOffer: boolean;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(shouldOffer);
	const [step, setStep] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const steps = buildQuickDashOrientationSteps({ workspaceName });

	if (!open) return null;

	function close(outcome: "completed" | "skipped") {
		setError(null);
		startTransition(async () => {
			const result = await saveQuickDashOrientationAction({
				workspaceId,
				outcome,
			});
			if (result.ok) {
				setOpen(false);
				router.refresh();
			} else setError(result.error);
		});
	}

	const current = steps[step];
	const placement = getQuickDashOrientationPlacementClass(
		current?.placement ?? "workspace-switcher",
	);
	return (
		<aside
			aria-label="QuickDash orientation"
			aria-live="polite"
			className={`fixed z-40 w-[min(21rem,calc(100vw-2rem))] rounded-xl border bg-muted p-4 shadow-lg ${placement}`}
		>
			{current && (
				<span
					aria-hidden="true"
					className={`absolute hidden size-3 rotate-45 bg-muted md:block ${getQuickDashOrientationNotchClass(current.placement)}`}
				/>
			)}
			<div className="flex items-start justify-between gap-4">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
					<Compass className="size-5" weight="fill" />
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Skip orientation"
					disabled={pending}
					onClick={() => close("skipped")}
				>
					<X />
				</Button>
			</div>
			<p className="mt-3 text-muted-foreground text-xs">
				A quick tour · {step + 1} of {steps.length}
			</p>
			<h2 className="mt-1 font-semibold">{current?.title}</h2>
			<p className="mt-1.5 text-muted-foreground text-sm leading-5">
				{current?.description}
			</p>
			<div className="mt-4 flex items-center justify-between gap-3">
				<Button
					type="button"
					variant="ghost"
					disabled={pending}
					onClick={() => (step === 0 ? close("skipped") : setStep(step - 1))}
				>
					{step === 0 ? (
						"Skip"
					) : (
						<>
							<ArrowLeft /> Back
						</>
					)}
				</Button>
				{step < steps.length - 1 ? (
					<Button
						type="button"
						disabled={pending}
						onClick={() => setStep(step + 1)}
					>
						Next <ArrowRight />
					</Button>
				) : (
					<Button
						type="button"
						disabled={pending}
						onClick={() => close("completed")}
					>
						Finish
					</Button>
				)}
			</div>
			{error && (
				<p className="mt-3 text-destructive text-xs" role="alert">
					{error}
				</p>
			)}
		</aside>
	);
}
