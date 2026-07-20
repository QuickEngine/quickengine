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
import type { OnboardingModule } from "../_lib/module-catalog";
import {
	BUSINESS_TYPES,
	businessTypeName,
	moduleIcon,
	RECIPE_MODULES,
} from "../_lib/modules";
import { completeOnboarding } from "./actions";

type Step = "choose" | "name" | "type" | "modules" | "success";

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

// One line of the success "receipt" (what got created), deployment-summary style.
function SummaryRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between border-foreground/[0.06] border-b py-2.5 text-sm last:border-0">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium text-foreground">{value}</span>
		</div>
	);
}

export function OnboardingFlow({ catalog }: { catalog: OnboardingModule[] }) {
	const router = useRouter();
	const [step, setStep] = useState<Step>("choose");
	const [typeId, setTypeId] = useState<string | null>(null);
	const [enabled, setEnabled] = useState<Set<string>>(new Set());
	const [businessName, setBusinessName] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const built = catalog.filter((module) => module.status === "built");

	function chooseType(id: string) {
		setTypeId(id);
		// The recipe's default selection — a starting point, not a lock. Ids that aren't
		// built yet are filtered out rather than offering something that doesn't work.
		const recipe = new Set(RECIPE_MODULES[id] ?? []);
		setEnabled(
			new Set(built.filter((module) => recipe.has(module.id)).map((m) => m.id)),
		);
		setStep("modules");
	}

	function toggle(id: string) {
		// Any built module can be switched off, foundation included — #173 removed the
		// hard lock, and onboarding is the last place that still enforced it.
		if (!built.some((module) => module.id === id)) {
			return;
		}
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

	// Persist the workspace + mark onboarding complete, then show the success step.
	async function finish() {
		if (!typeId) {
			return;
		}
		setSubmitting(true);
		setSubmitError(null);
		try {
			await completeOnboarding({
				businessName,
				businessType: typeId,
			});
			setStep("success");
		} catch {
			setSubmitError(
				"We couldn't create your workspace. Nothing was partially saved—please try again.",
			);
			setSubmitting(false);
		}
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
					Every {businessTypeName(typeId)} workspace includes the foundation.
					More capabilities will become available as they are built.
				</p>

				<div className="mt-8 space-y-2">
					{catalog.map((m) => {
						const comingSoon = m.status === "upcoming";
						const on = enabled.has(m.id);
						const Glyph = moduleIcon(m.id);
						return (
							<button
								key={m.id}
								type="button"
								disabled={comingSoon}
								onClick={() => toggle(m.id)}
								className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors ${
									comingSoon
										? "cursor-not-allowed border-foreground/[0.06] opacity-55"
										: on
											? "border-foreground/25 bg-foreground/[0.04]"
											: "border-foreground/[0.06] bg-foreground/[0.02] hover:border-foreground/15"
								}`}
							>
								<Glyph className="size-5 shrink-0 text-foreground" />
								<div className="min-w-0 flex-1">
									<div className="font-medium text-foreground text-sm">
										{m.name}
									</div>
									<div className="truncate text-muted-foreground text-sm">
										{m.description}
									</div>
								</div>
								{comingSoon ? (
									<span className="flex shrink-0 items-center gap-1.5 rounded-full border border-foreground/10 px-2.5 py-0.5 text-[11px] text-muted-foreground">
										<Lock className="size-3" />
										Coming soon
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
					disabled={submitting}
					onClick={finish}
					className="mt-8 w-fit rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{submitting ? "Creating…" : "Create workspace"}
				</button>
				{submitError ? (
					<p role="alert" className="mt-4 text-destructive text-sm">
						{submitError}
					</p>
				) : null}
			</Canvas>
		);
	}

	// Step 4 — Success moment (the deploy-success payoff) → Workspaces
	return (
		<Canvas>
			<div className="mx-auto flex max-w-md flex-col items-center text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-500">
				<div className="flex size-16 items-center justify-center rounded-full border border-foreground/15 bg-foreground/[0.06]">
					<Check className="size-8 text-foreground" weight="bold" />
				</div>
				<p className="mt-6 text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
					Workspace ready
				</p>
				<h1 className={`mt-2 ${headingClass}`}>
					{businessName.trim() || "You're all set"}
				</h1>
				<p className="mt-3 text-muted-foreground">
					Your backend is configured and ready to build on.
				</p>

				<div className="mt-8 w-full rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-5 text-left">
					<SummaryRow label="Business" value={businessName.trim() || "—"} />
					<SummaryRow
						label="Type"
						value={typeId ? businessTypeName(typeId) : "—"}
					/>
					<SummaryRow label="Modules" value={`${enabled.size} enabled`} />
				</div>

				<button
					type="button"
					onClick={() => router.push("/")}
					className="mt-8 w-full rounded-lg bg-foreground px-6 py-3 font-medium text-background transition-opacity hover:opacity-90"
				>
					Enter {businessName.trim() || "workspace"}
				</button>
			</div>
		</Canvas>
	);
}
