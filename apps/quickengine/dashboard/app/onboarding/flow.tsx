"use client";

import { SlidersHorizontal, Sparkle } from "@phosphor-icons/react";
import { useState } from "react";

type Step = "choose" | "modules";

export function OnboardingFlow() {
	const [step, setStep] = useState<Step>("choose");

	// Placeholder for the next screen (module picker) — built next.
	if (step === "modules") {
		return (
			<div className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
				<p className="text-muted-foreground text-sm">
					Module picker — coming next.
				</p>
				<button
					type="button"
					onClick={() => setStep("choose")}
					className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
				>
					Back
				</button>
			</div>
		);
	}

	return (
		<div className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center px-6 py-12">
			{/* biome-ignore lint/performance/noImgElement: static brand mark, no next/image */}
			<img src="/logo.svg" alt="QuickEngine" className="mb-8 size-8" />
			<p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
				Welcome
			</p>
			<h1 className="mt-3 font-display font-normal text-4xl text-foreground tracking-tight">
				Let's build your first workspace.
			</h1>
			<p className="mt-3 text-muted-foreground">
				Choose how you'd like to set it up. You can change everything later.
			</p>

			<div className="mt-8 grid gap-4 sm:grid-cols-2">
				{/* Guided — stubbed until the AI path ships */}
				<div className="relative flex flex-col rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-6 opacity-60">
					<span className="absolute top-4 right-4 rounded-full border border-foreground/10 px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
						Coming soon
					</span>
					<Sparkle className="size-6 text-foreground" />
					<h2 className="mt-4 font-medium text-foreground">Set it up for me</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Answer a few questions and we'll assemble your backend for you.
					</p>
				</div>

				{/* Manual — the live path */}
				<button
					type="button"
					onClick={() => setStep("modules")}
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
		</div>
	);
}
