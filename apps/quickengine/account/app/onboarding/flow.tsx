"use client";

import {
	ArrowLeft,
	Check,
	Lock,
	SlidersHorizontal,
	Sparkle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import type { OnboardingModule } from "../_lib/module-catalog";
import {
	BUSINESS_TYPES,
	businessTypeName,
	FOUNDATION,
	moduleIcon,
	RECIPE_MODULES,
} from "../_lib/modules";
import { completeOnboarding } from "./actions";

/**
 * Name → Set up → Configure → Review → Success.
 *
 * Four interactive steps, deliberately. Shorter reads as cheap and gives the user nothing to
 * feel ownership of; the previous flow's problem was never its length but that one step was a
 * dead end, two steps did the same job, and it ended in the wrong app.
 */
type Step = "name" | "setup" | "preset" | "modules" | "review" | "success";

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
	const [step, setStep] = useState<Step>("name");
	const [typeId, setTypeId] = useState<string | null>(null);
	const [enabled, setEnabled] = useState<Set<string>>(new Set());
	const [businessName, setBusinessName] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const byId = useMemo(
		() => new Map(catalog.map((module) => [module.id, module])),
		[catalog],
	);
	const built = useMemo(
		() => catalog.filter((module) => module.status === "built"),
		[catalog],
	);
	const upcoming = useMemo(
		() => catalog.filter((module) => module.status === "upcoming"),
		[catalog],
	);

	/** A module plus everything it composes on, transitively. */
	const withDependencies = useMemo(
		() => (id: string) => {
			const collected = new Set<string>();
			const visit = (moduleId: string) => {
				if (collected.has(moduleId)) return;
				collected.add(moduleId);
				for (const dependency of byId.get(moduleId)?.dependsOn ?? []) {
					visit(dependency);
				}
			};
			visit(id);
			return collected;
		},
		[byId],
	);

	/** Selected modules that would break if `id` were switched off. */
	const dependentsOf = (id: string, selected: Set<string>) =>
		[...selected]
			.filter((other) => other !== id && withDependencies(other).has(id))
			.map((other) => byId.get(other)?.name ?? other);

	function applyRecipe(id: string) {
		setTypeId(id);
		const recipe = RECIPE_MODULES[id] ?? [];
		const next = new Set<string>();
		for (const moduleId of recipe) {
			if (byId.get(moduleId)?.status !== "built") continue;
			for (const resolved of withDependencies(moduleId)) next.add(resolved);
		}
		setEnabled(next);
		setStep("review");
	}

	function startManual() {
		// Seed with the foundation so the user starts from something workable rather than an
		// empty workspace — but every one of them can be switched off from here.
		const next = new Set<string>();
		for (const moduleId of FOUNDATION) {
			if (byId.get(moduleId)?.status === "built") next.add(moduleId);
		}
		setEnabled(next);
		setTypeId(null);
		setStep("modules");
	}

	function toggle(id: string) {
		if (byId.get(id)?.status !== "built") return;
		setEnabled((previous) => {
			const next = new Set(previous);
			if (next.has(id)) {
				// Blocked while something selected still composes on it — the server resolves
				// dependencies regardless, so silently allowing this would be a lie.
				if (dependentsOf(id, next).length > 0) return previous;
				next.delete(id);
			} else {
				for (const resolved of withDependencies(id)) next.add(resolved);
			}
			return next;
		});
	}

	async function finish() {
		setSubmitting(true);
		setSubmitError(null);
		try {
			await completeOnboarding({
				businessName,
				// Manual configuration has no business type; the server normalizes this.
				businessType: typeId ?? "custom",
				moduleIds: [...enabled],
			});
			setStep("success");
		} catch {
			setSubmitError(
				"We couldn't create your workspace. Nothing was partially saved—please try again.",
			);
			setSubmitting(false);
		}
	}

	// Step 1 — Name. The only required input.
	if (step === "name") {
		return (
			<Canvas>
				{/* biome-ignore lint/performance/noImgElement: static brand mark, no next/image */}
				<img src="/logo.svg" alt="QuickEngine" className="mb-8 size-8" />
				<p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
					Welcome
				</p>
				<h1 className={`mt-3 ${headingClass}`}>What's your business called?</h1>
				<p className="mt-3 text-muted-foreground">
					This names your first workspace. You can rename it later.
				</p>
				<input
					aria-label="Business name"
					value={businessName}
					onChange={(event) => setBusinessName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && businessName.trim()) {
							setStep("setup");
						}
					}}
					placeholder="Acme Inc."
					className="mt-8 w-full max-w-md rounded-lg border border-input bg-transparent px-4 py-3 text-foreground outline-none transition-colors focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/40"
				/>
				<button
					type="button"
					disabled={!businessName.trim()}
					onClick={() => setStep("setup")}
					className="mt-6 w-fit rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-40"
				>
					Continue
				</button>
			</Canvas>
		);
	}

	// Step 2 — How to set it up. The AI card is deliberately absent until it exists:
	// a disabled option as the first thing a new user sees is a bad opening move.
	if (step === "setup") {
		return (
			<Canvas onBack={() => setStep("name")}>
				<h1 className={headingClass}>How do you want to set it up?</h1>
				<p className="mt-3 text-muted-foreground">
					Either way you can change every module afterwards.
				</p>
				<div className="mt-8 grid gap-4 sm:grid-cols-2">
					<button
						type="button"
						onClick={() => setStep("preset")}
						className="flex flex-col rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-6 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
					>
						<Sparkle className="size-6 text-foreground" />
						<h2 className="mt-4 font-medium text-foreground">Use a preset</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Pick the closest business type and we'll assemble a sensible
							starting set.
						</p>
					</button>
					<button
						type="button"
						onClick={startManual}
						className="flex flex-col rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-6 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
					>
						<SlidersHorizontal className="size-6 text-foreground" />
						<h2 className="mt-4 font-medium text-foreground">
							Choose modules myself
						</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Start from the essentials and add exactly what you need.
						</p>
					</button>
				</div>
			</Canvas>
		);
	}

	// Step 3a — Preset picker.
	if (step === "preset") {
		return (
			<Canvas onBack={() => setStep("setup")}>
				<h1 className={headingClass}>What are you building?</h1>
				<p className="mt-3 text-muted-foreground">
					Pick the closest fit — you'll see exactly what it sets up before
					anything is created.
				</p>
				<div className="mt-8 grid gap-3 sm:grid-cols-3">
					{BUSINESS_TYPES.map((type) => (
						<button
							key={type.id}
							type="button"
							onClick={() => applyRecipe(type.id)}
							className="flex flex-col items-start gap-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-5 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
						>
							<type.icon className="size-6 text-foreground" />
							<span className="font-medium text-foreground">{type.name}</span>
						</button>
					))}
				</div>
			</Canvas>
		);
	}

	// Step 3b — Module grid.
	if (step === "modules") {
		return (
			<Canvas onBack={() => setStep(typeId ? "review" : "setup")}>
				<h1 className={headingClass}>Choose your modules</h1>
				<p className="mt-3 text-muted-foreground">
					{enabled.size} selected. Some modules build on others — picking one
					brings its requirements with it.
				</p>

				<ModuleGrid
					title="Available now"
					modules={built}
					enabled={enabled}
					byId={byId}
					dependentsOf={dependentsOf}
					onToggle={toggle}
				/>
				<ModuleGrid
					title="Coming soon"
					modules={upcoming}
					enabled={enabled}
					byId={byId}
					dependentsOf={dependentsOf}
					onToggle={toggle}
				/>

				<button
					type="button"
					disabled={enabled.size === 0}
					onClick={() => setStep("review")}
					className="mt-8 w-fit rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-40"
				>
					Continue
				</button>
			</Canvas>
		);
	}

	// Step 4 — Review. The first place the user sees what they'll actually get, including
	// modules pulled in as dependencies rather than chosen directly.
	if (step === "review") {
		const selected = built.filter((module) => enabled.has(module.id));
		return (
			<Canvas onBack={() => setStep(typeId ? "preset" : "modules")}>
				<h1 className={headingClass}>Ready to build</h1>
				<p className="mt-3 text-muted-foreground">
					Here's what gets created. Nothing is charged, and everything can
					change later.
				</p>

				<div className="mt-8 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-5">
					<SummaryRow label="Workspace" value={businessName.trim() || "—"} />
					<SummaryRow
						label="Type"
						value={typeId ? businessTypeName(typeId) : "Custom"}
					/>
					<SummaryRow label="Modules" value={`${selected.length} enabled`} />
				</div>

				<div className="mt-4 flex flex-wrap gap-2">
					{selected.map((module) => {
						const Glyph = moduleIcon(module.id);
						return (
							<span
								key={module.id}
								className="flex items-center gap-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.02] px-2.5 py-1.5 text-foreground text-sm"
							>
								<Glyph className="size-4" />
								{module.name}
							</span>
						);
					})}
				</div>

				<div className="mt-8 flex flex-wrap items-center gap-3">
					<button
						type="button"
						disabled={submitting}
						onClick={finish}
						className="w-fit rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{submitting ? "Creating…" : "Create workspace"}
					</button>
					<button
						type="button"
						onClick={() => setStep("modules")}
						className="text-muted-foreground text-sm underline-offset-4 transition-colors hover:text-foreground hover:underline"
					>
						Edit modules
					</button>
				</div>
				{submitError ? (
					<p role="alert" className="mt-4 text-destructive text-sm">
						{submitError}
					</p>
				) : null}
			</Canvas>
		);
	}

	// Step 5 — Success.
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
						value={typeId ? businessTypeName(typeId) : "Custom"}
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

/** One titled section of the module picker, laid out as a grid rather than a long list. */
function ModuleGrid({
	title,
	modules,
	enabled,
	byId,
	dependentsOf,
	onToggle,
}: {
	title: string;
	modules: OnboardingModule[];
	enabled: Set<string>;
	byId: Map<string, OnboardingModule>;
	dependentsOf: (id: string, selected: Set<string>) => string[];
	onToggle: (id: string) => void;
}) {
	if (modules.length === 0) return null;
	return (
		<section className="mt-8">
			<h2 className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
				{title}
			</h2>
			<div className="mt-3 grid gap-2 sm:grid-cols-2">
				{modules.map((module) => {
					const comingSoon = module.status === "upcoming";
					const on = enabled.has(module.id);
					const blockedBy = on ? dependentsOf(module.id, enabled) : [];
					const requires = module.dependsOn
						.map((id) => byId.get(id)?.name ?? id)
						.join(", ");
					const Glyph = moduleIcon(module.id);
					return (
						<button
							key={module.id}
							type="button"
							disabled={comingSoon}
							onClick={() => onToggle(module.id)}
							title={
								blockedBy.length > 0
									? `Required by ${blockedBy.join(", ")}`
									: undefined
							}
							className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
								comingSoon
									? "cursor-not-allowed border-foreground/[0.06] opacity-55"
									: on
										? "border-foreground/25 bg-foreground/[0.04]"
										: "border-foreground/[0.06] bg-foreground/[0.02] hover:border-foreground/15"
							}`}
						>
							<Glyph className="mt-0.5 size-5 shrink-0 text-foreground" />
							<div className="min-w-0 flex-1">
								<div className="font-medium text-foreground text-sm">
									{module.name}
								</div>
								<div className="text-muted-foreground text-sm">
									{module.description}
								</div>
								{requires ? (
									<div className="mt-1 text-[11px] text-muted-foreground">
										Requires {requires}
									</div>
								) : null}
								{blockedBy.length > 0 ? (
									<div className="mt-1 text-[11px] text-muted-foreground">
										Required by {blockedBy.join(", ")}
									</div>
								) : null}
							</div>
							{comingSoon ? (
								<Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
							) : (
								<span
									className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border ${
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
		</section>
	);
}
