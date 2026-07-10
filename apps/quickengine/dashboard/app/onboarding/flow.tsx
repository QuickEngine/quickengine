"use client";

import {
	ArrowLeft,
	Check,
	Lock,
	SlidersHorizontal,
	Sparkle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
	BUSINESS_TYPES,
	businessTypeName,
	modulesForType,
	TIER_LABEL,
} from "../_lib/modules";
import { monthlyPrice, PLANS } from "../_lib/plans";

type Step = "choose" | "name" | "type" | "modules" | "plan" | "success";

// Centered, shell-free canvas shared by every onboarding step.
function Canvas({
	children,
	onBack,
}: {
	children: ReactNode;
	onBack?: () => void;
}) {
	return (
		<div className="mx-auto flex min-h-svh max-w-4xl flex-col justify-center px-6 py-12">
			{onBack ? (
				<button
					type="button"
					onClick={onBack}
					className="mb-6 flex w-fit items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-4" />
					Back
				</button>
			) : null}
			{children}
		</div>
	);
}

const headingClass =
	"font-display font-normal text-4xl text-foreground tracking-tight";

export function OnboardingFlow() {
	const router = useRouter();
	const [step, setStep] = useState<Step>("choose");
	const [typeId, setTypeId] = useState<string | null>(null);
	const [enabled, setEnabled] = useState<Set<string>>(new Set());
	const [annual, setAnnual] = useState(true);
	const [businessName, setBusinessName] = useState("");

	function chooseType(id: string) {
		setTypeId(id);
		// Preselect the free modules for this recipe.
		setEnabled(
			new Set(
				modulesForType(id)
					.filter((m) => m.tier === "free")
					.map((m) => m.id),
			),
		);
		setStep("modules");
	}

	function toggle(id: string) {
		setEnabled((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	// Step 1 — Guided vs Manual
	if (step === "choose") {
		return (
			<Canvas>
				{/* biome-ignore lint/performance/noImgElement: static brand mark, no next/image */}
				<img src="/logo.svg" alt="QuickEngine" className="mb-8 size-8" />
				<p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
					Welcome
				</p>
				<h1 className={`mt-3 ${headingClass}`}>
					Let's build your first workspace.
				</h1>
				<p className="mt-3 text-muted-foreground">
					Choose how you'd like to set it up. You can change everything later.
				</p>

				<div className="mt-8 grid gap-4 sm:grid-cols-2">
					<div className="relative flex flex-col rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-6 opacity-60">
						<span className="absolute top-4 right-4 rounded-full border border-foreground/10 px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
							Coming soon
						</span>
						<Sparkle className="size-6 text-foreground" />
						<h2 className="mt-4 font-medium text-foreground">
							Set it up for me
						</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Answer a few questions and we'll assemble your backend for you.
						</p>
					</div>

					<button
						type="button"
						onClick={() => setStep("name")}
						className="flex flex-col rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-6 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
					>
						<SlidersHorizontal className="size-6 text-foreground" />
						<h2 className="mt-4 font-medium text-foreground">
							I'll do it myself
						</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Pick your modules and configure everything the way you want.
						</p>
					</button>
				</div>
			</Canvas>
		);
	}

	// Step 1b — Name the business (shows as the account name in the header later)
	if (step === "name") {
		return (
			<Canvas onBack={() => setStep("choose")}>
				<h1 className={headingClass}>What's your business called?</h1>
				<p className="mt-3 text-muted-foreground">
					This is how it shows up across your account. You can rename it later.
				</p>
				<input
					aria-label="Business name"
					value={businessName}
					onChange={(e) => setBusinessName(e.target.value)}
					placeholder="Acme Inc."
					className="mt-8 w-full max-w-md rounded-lg border border-input bg-transparent px-4 py-3 text-foreground outline-none transition-colors focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/40"
				/>
				<button
					type="button"
					disabled={!businessName.trim()}
					onClick={() => setStep("type")}
					className="mt-6 w-fit rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-40"
				>
					Continue
				</button>
			</Canvas>
		);
	}

	// Step 2a — Business type
	if (step === "type") {
		return (
			<Canvas onBack={() => setStep("name")}>
				<h1 className={headingClass}>What are you building?</h1>
				<p className="mt-3 text-muted-foreground">
					Pick the closest fit — it preselects the right modules. You can change
					it later.
				</p>
				<div className="mt-8 grid gap-3 sm:grid-cols-3">
					{BUSINESS_TYPES.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => chooseType(t.id)}
							className="flex flex-col items-start gap-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-5 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
						>
							<t.icon className="size-6 text-foreground" />
							<span className="font-medium text-foreground">{t.name}</span>
						</button>
					))}
				</div>
			</Canvas>
		);
	}

	// Step 2b — Module picker
	if (step === "modules" && typeId) {
		return (
			<Canvas onBack={() => setStep("type")}>
				<h1 className={headingClass}>Choose your modules</h1>
				<p className="mt-3 text-muted-foreground">
					Preselected for {businessTypeName(typeId)}. Toggle what you need —
					locked ones unlock with a paid plan.
				</p>

				<div className="mt-8 space-y-2">
					{modulesForType(typeId).map((m) => {
						const locked = m.tier !== "free";
						const on = enabled.has(m.id);
						return (
							<button
								key={m.id}
								type="button"
								disabled={locked}
								onClick={() => toggle(m.id)}
								className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors ${
									locked
										? "cursor-not-allowed border-foreground/[0.06] opacity-55"
										: on
											? "border-foreground/25 bg-foreground/[0.04]"
											: "border-foreground/[0.06] bg-foreground/[0.02] hover:border-foreground/15"
								}`}
							>
								<m.icon className="size-5 shrink-0 text-foreground" />
								<div className="min-w-0 flex-1">
									<div className="font-medium text-foreground text-sm">
										{m.name}
									</div>
									<div className="truncate text-muted-foreground text-sm">
										{m.description}
									</div>
								</div>
								{locked ? (
									<span className="flex shrink-0 items-center gap-1.5 rounded-full border border-foreground/10 px-2.5 py-0.5 text-[11px] text-muted-foreground">
										<Lock className="size-3" />
										{TIER_LABEL[m.tier]}
									</span>
								) : (
									<span
										className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${
											on
												? "border-foreground bg-foreground text-background"
												: "border-foreground/20"
										}`}
									>
										{on ? <Check className="size-3.5" weight="bold" /> : null}
									</span>
								)}
							</button>
						);
					})}
				</div>

				<button
					type="button"
					onClick={() => setStep("plan")}
					className="mt-8 w-fit rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90"
				>
					Continue
				</button>
			</Canvas>
		);
	}

	// Step 3 — Soft upgrade (plan cards; annual-first). Payment handoff to Stripe
	// Checkout is wired once prices/price IDs are set — for now both paths proceed.
	if (step === "plan") {
		return (
			<Canvas onBack={() => setStep("modules")}>
				<h1 className={headingClass}>Start free, or unlock more.</h1>
				<p className="mt-3 text-muted-foreground">
					You can run on Free forever. Upgrade any time — nothing's locked in.
				</p>

				{/* Annual-first cadence toggle */}
				<div className="mt-6 inline-flex items-center gap-1 rounded-lg border border-foreground/10 p-1">
					<button
						type="button"
						onClick={() => setAnnual(true)}
						className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
							annual ? "bg-foreground text-background" : "text-muted-foreground"
						}`}
					>
						Annual
						<span
							className={`rounded-full px-1.5 py-0.5 text-[10px] ${annual ? "bg-background/15" : "bg-foreground/10"}`}
						>
							Save 15%
						</span>
					</button>
					<button
						type="button"
						onClick={() => setAnnual(false)}
						className={`rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
							!annual
								? "bg-foreground text-background"
								: "text-muted-foreground"
						}`}
					>
						Monthly
					</button>
				</div>

				<div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{PLANS.map((plan) => {
						const price = monthlyPrice(plan, annual);
						const isFree = plan.monthly === 0;
						return (
							<div
								key={plan.id}
								className={`flex flex-col rounded-xl border p-5 ${
									plan.highlight
										? "border-foreground/30 bg-foreground/[0.04]"
										: "border-foreground/[0.06] bg-foreground/[0.02]"
								}`}
							>
								<div className="flex items-center justify-between">
									<span className="font-medium text-foreground">
										{plan.name}
									</span>
									{plan.highlight ? (
										<span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
											Popular
										</span>
									) : null}
								</div>
								<div className="mt-3 flex items-baseline gap-1">
									<span className="font-display text-3xl text-foreground tabular-nums">
										${price}
									</span>
									<span className="text-muted-foreground text-sm">/mo</span>
								</div>
								<p className="mt-1 h-4 text-muted-foreground text-xs">
									{!isFree && annual ? "billed annually" : " "}
								</p>
								<ul className="mt-4 flex-1 space-y-2">
									{plan.features.map((f) => (
										<li
											key={f}
											className="flex items-start gap-2 text-muted-foreground text-sm"
										>
											<Check className="mt-0.5 size-3.5 shrink-0 text-foreground" />
											{f}
										</li>
									))}
								</ul>
								<button
									type="button"
									onClick={() => setStep("success")}
									className={`mt-5 rounded-lg px-4 py-2 font-medium text-sm transition-colors ${
										isFree
											? "border border-foreground/15 text-foreground hover:bg-foreground/5"
											: "bg-foreground text-background hover:opacity-90"
									}`}
								>
									{isFree ? "Continue on Free" : `Choose ${plan.name}`}
								</button>
							</div>
						);
					})}
				</div>
				<p className="mt-4 text-[11px] text-muted-foreground">
					Prices are placeholders pending final pricing.
				</p>
			</Canvas>
		);
	}

	// Step 4 — Success (Vercel-style deploy screen) → Workspaces
	return (
		<Canvas>
			<div className="flex flex-col items-center text-center">
				<div className="flex size-14 items-center justify-center rounded-full bg-foreground/10">
					<Check className="size-7 text-foreground" weight="bold" />
				</div>
				<h1 className={`mt-6 ${headingClass}`}>Your workspace is ready.</h1>
				<p className="mt-3 max-w-md text-muted-foreground">
					{businessName.trim() || "Your workspace"} is set up with{" "}
					{enabled.size} module{enabled.size === 1 ? "" : "s"}. You can add more
					any time.
				</p>
				<button
					type="button"
					onClick={() => router.push("/workspaces")}
					className="mt-8 rounded-lg bg-foreground px-6 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90"
				>
					Continue to workspace
				</button>
			</div>
		</Canvas>
	);
}
