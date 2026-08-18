import { useEffect } from "react";

/**
 * The moment somebody wants something their plan does not include.
 *
 * ── Why a dialog, and only here ──────────────────────────────────────────────
 *
 * 🔑 A dialog is the right answer to a CLICK and the wrong answer to a page
 * load. Somebody who just pressed "Invite" asked a question, and this answers
 * it; somebody who merely arrived somewhere is interrupted by it. That is the
 * whole rule, and it is why arriving at a switched-off module gets a quiet
 * takeover instead of this.
 *
 * 🔴 It shows the API's OWN message. The server already knows which limit was
 * hit and what the plan includes — "Your plan includes 1 seat and all of them
 * are taken" — and rewriting that here would produce two descriptions of one
 * rule that drift apart the first time a limit changes.
 *
 * ⚠️ Never red, never an alert. Hitting a limit is not a mistake and not a
 * fault: it is a customer wanting more of something, which is the best news a
 * business gets all day. Painting it as an error teaches people that using the
 * product harder is a thing to be nervous about.
 *
 * ⚠️ Dismissible, and dismissal is a real answer. "Not now" closes it and
 * nothing follows — no second prompt, no reminder later. Hard rule 4 permits
 * selling QuickDash to its own users; it does not permit nagging them.
 */
export function PlanLimitDialog({
	message,
	accountUrl,
	onClose,
}: {
	/** The API's message for this specific limit. */
	message: string;
	accountUrl: string;
	onClose: () => void;
}) {
	// Escape closes it, like every other dismissible thing in the console.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
			{/* A button, not a div with a click handler: it is genuinely activatable,
			    so it should be an activatable element. Hidden from assistive tech
			    because Escape and the visible "Not now" already close this. */}
			<button
				type="button"
				tabIndex={-1}
				aria-hidden="true"
				onClick={onClose}
				className="absolute inset-0 bg-black/50"
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="plan-limit-title"
				className="relative w-full max-w-sm rounded-2xl border border-[var(--console-line)] bg-[var(--console-pop)] p-5 shadow-[0_24px_60px_rgb(0_0_0/0.45)]"
			>
				<p id="plan-limit-title" className="text-[13px] text-[var(--ink-90)]">
					Your plan doesn't stretch that far
				</p>
				<p className="mt-2 text-[11.5px] text-[var(--ink-45)] leading-5">
					{message}
				</p>
				<div className="mt-5 flex items-center gap-2">
					<a
						href={`${accountUrl}/billing`}
						className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85"
					>
						See plans
					</a>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex h-9 shrink-0 items-center rounded-full border border-[var(--console-line-strong)] px-4 text-[12.5px] text-[var(--ink-60)] transition-colors hover:text-[var(--ink-90)]"
					>
						Not now
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * Is this failure a plan limit rather than a fault?
 *
 * 🔑 Matched on the CODE, never the status alone and never the message. 402 is
 * the status the contract assigns `USAGE_LIMIT_EXCEEDED`, and matching prose
 * would break the first time the copy improved.
 */
export function isPlanLimit(
	error: unknown,
): error is { code: string; message: string } {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "USAGE_LIMIT_EXCEEDED"
	);
}
