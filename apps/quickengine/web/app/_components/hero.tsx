"use client";

import { ArrowUp, CircleNotch } from "@phosphor-icons/react";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";

const AUTH_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL ?? "http://localhost:3002";

type Recipe = { type: string; modules: string[]; plan: string };

// MOCK — placeholder recommendation logic. Replace with a call to a server
// route (e.g. /api/recommend) that runs Claude Haiku over the input; the API
// key must live server-side, never in the client bundle. The keyword heuristic
// below just makes the demo feel real until that route exists.
const RECIPES: (Recipe & { keywords: string[] })[] = [
	{
		type: "E-commerce",
		modules: ["Auth", "Billing", "Storage", "Search", "Inventory"],
		plan: "Pro",
		keywords: ["store", "shop", "commerce", "product", "retail", "merch"],
	},
	{
		type: "Bookings",
		modules: ["Auth", "Scheduling", "Payments", "Notifications"],
		plan: "Starter",
		keywords: ["book", "appointment", "schedule", "salon", "barber", "reserv"],
	},
	{
		type: "Agency",
		modules: ["Auth", "Projects", "Files", "Invoicing", "Billing"],
		plan: "Growth",
		keywords: ["agency", "client", "studio", "consult"],
	},
	{
		type: "Freelancer",
		modules: ["Auth", "Invoicing", "Files", "Contacts"],
		plan: "Starter",
		keywords: ["freelance", "portfolio", "solo", "contractor"],
	},
	{
		type: "SaaS",
		modules: ["Auth", "Billing", "Analytics", "Webhooks", "Jobs"],
		plan: "Growth",
		keywords: ["saas", "app", "platform", "dashboard", "api"],
	},
];

const DEFAULT_RECIPE: Recipe = {
	type: "Custom workspace",
	modules: ["Auth", "Billing", "Storage", "Search", "Jobs"],
	plan: "Pro",
};

function recommend(input: string): Recipe {
	const q = input.toLowerCase();
	return (
		RECIPES.find((r) => r.keywords.some((k) => q.includes(k))) ?? DEFAULT_RECIPE
	);
}

// Hero — centered claim + an AI prompt. Describe your business, and a
// recommended workspace assembles itself below the prompt: the product's core
// promise, demonstrated on the landing page.
export function Hero() {
	const [value, setValue] = useState("");
	const [result, setResult] = useState<Recipe | null>(null);
	const [loading, setLoading] = useState(false);
	const scrollBeforeFocus = useRef(0);

	// Mobile browsers scroll a focused field into view to clear the keyboard, and
	// don't scroll back on blur — which, with the sticky hero, leaves you scrolled
	// into the overlapping section. Capture the scroll position on focus and
	// restore it on blur so tapping the prompt never moves the page.
	const onFocus = () => {
		scrollBeforeFocus.current = window.scrollY;
	};
	const onBlur = () => {
		requestAnimationFrame(() => window.scrollTo(0, scrollBeforeFocus.current));
	};

	const submit = () => {
		if (!value.trim()) return;
		setLoading(true);
		setResult(null);
		// Mock latency — stands in for the Haiku round-trip.
		setTimeout(() => {
			setResult(recommend(value));
			setLoading(false);
		}, 900);
	};

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		submit();
	};

	const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	};

	return (
		<section className="page-gutter sticky top-16 z-0 flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center text-center">
			<p className="text-[13px] text-muted-foreground uppercase tracking-[0.2em]">
				Introducing QuickDash
			</p>
			<h1 className="mt-6 max-w-4xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-7xl">
				The backend your <br className="hidden sm:block" />
				whole business runs on.
			</h1>

			<form onSubmit={onSubmit} className="mt-10 w-full max-w-2xl">
				<div className="rounded-2xl border border-border bg-secondary/20 p-4 text-left transition-colors focus-within:border-foreground/30">
					<textarea
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={onKeyDown}
						onFocus={onFocus}
						onBlur={onBlur}
						rows={3}
						placeholder="Describe your business and we'll assemble your backend…"
						aria-label="Describe your business"
						className="w-full resize-none bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
					/>
					<div className="mt-2 flex justify-end">
						<button
							type="submit"
							aria-label="Assemble my backend"
							className="inline-flex size-9 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
						>
							<ArrowUp className="size-4" weight="bold" />
						</button>
					</div>
				</div>
			</form>

			<p className="mt-3 text-muted-foreground text-xs">
				Try "a booking app for a barbershop" — or{" "}
				<a
					href={`${AUTH_URL}/signup`}
					className="text-foreground underline-offset-4 hover:underline"
				>
					just get started
				</a>
				.
			</p>

			{/* Result drops in below the prompt. */}
			{loading || result ? (
				<div className="mt-10 w-full max-w-2xl">
					{loading ? (
						<div className="flex items-center justify-center gap-3 text-muted-foreground">
							<CircleNotch className="size-4 animate-spin" />
							<span className="text-sm">Designing your backend…</span>
						</div>
					) : result ? (
						<div className="rounded-2xl border border-border bg-secondary/20 p-8">
							<p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
								Recommended workspace
							</p>
							<h2 className="mt-2 font-display text-3xl text-foreground">
								{result.type}
							</h2>

							<div className="mt-6 flex flex-wrap justify-center gap-2">
								{result.modules.map((m) => (
									<span
										key={m}
										className="rounded-full border border-border px-3 py-1 text-[13px] text-foreground"
									>
										{m}
									</span>
								))}
							</div>

							<div className="mt-8 flex flex-col items-center gap-4">
								<p className="text-[13px] text-muted-foreground">
									Suggested plan ·{" "}
									<span className="text-foreground">{result.plan}</span>
								</p>
								<a
									href={`${AUTH_URL}/signup`}
									className="inline-flex h-10 items-center rounded-full bg-foreground px-6 font-normal text-background text-sm transition-opacity hover:opacity-90"
								>
									Start free
								</a>
							</div>
						</div>
					) : null}
				</div>
			) : null}
		</section>
	);
}
