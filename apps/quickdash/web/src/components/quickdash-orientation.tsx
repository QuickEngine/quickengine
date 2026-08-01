"use client";

import {
	ArrowLeftIcon,
	ArrowRightIcon,
	CompassIcon,
	XIcon,
} from "@phosphor-icons/react";
import { Button } from "@quickengine/ui/components/ui/button";
import { useState, useTransition } from "react";
import {
	buildQuickDashOrientationSteps,
	getQuickDashOrientationNotchClass,
	getQuickDashOrientationPlacementClass,
} from "../_lib/quickdash-orientation";
import { saveQuickDashOrientationAction } from "../_lib/quickdash-orientation-actions";
import { useRouter } from "../compat/router-navigation";

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
			className={`fixed z-40 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-[var(--b3)] bg-[var(--b2)] p-4 shadow-2xl shadow-black/50 ${placement}`}
		>
			{current && (
				<span
					aria-hidden="true"
					className={`absolute hidden size-3 rotate-45 border-[var(--b3)] bg-[var(--b2)] md:block ${getQuickDashOrientationNotchClass(current.placement)}`}
				/>
			)}
			<div className="flex items-start justify-between gap-4">
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-void text-ink">
					<CompassIcon size={15} />
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Skip orientation"
					disabled={pending}
					onClick={() => close("skipped")}
				>
					<XIcon size={14} />
				</Button>
			</div>
			<p className="mt-3 font-body text-[11px] text-dim">
				A quick tour · {step + 1} of {steps.length}
			</p>
			<h2 className="mt-1 font-body font-[450] text-[14px] text-ink">
				{current?.title}
			</h2>
			<p className="mt-1.5 font-body text-[12px] text-dim leading-relaxed">
				{current?.description}
			</p>
			<div className="mt-4 flex items-center justify-between gap-3">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 px-2.5 font-body text-[12px] text-dim hover:text-ink"
					disabled={pending}
					onClick={() => (step === 0 ? close("skipped") : setStep(step - 1))}
				>
					{step === 0 ? (
						"Skip"
					) : (
						<>
							<ArrowLeftIcon size={13} /> Back
						</>
					)}
				</Button>
				{step < steps.length - 1 ? (
					<Button
						type="button"
						size="sm"
						className="btn btn-primary h-7 gap-1.5 rounded-full bg-invert px-3.5 font-body font-[450] text-[12px] text-on-invert"
						disabled={pending}
						onClick={() => setStep(step + 1)}
					>
						Next <ArrowRightIcon size={13} />
					</Button>
				) : (
					<Button
						type="button"
						size="sm"
						className="btn btn-primary h-7 rounded-full bg-invert px-3.5 font-body font-[450] text-[12px] text-on-invert"
						disabled={pending}
						onClick={() => close("completed")}
					>
						Finish
					</Button>
				)}
			</div>
			{error && (
				<p className="mt-3 font-body text-[11px] text-destructive" role="alert">
					{error}
				</p>
			)}
		</aside>
	);
}
