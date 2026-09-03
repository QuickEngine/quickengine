import {
	ArrowLeftIcon,
	CheckIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { accountQueries } from "../lib/account-api";
import {
	groupRecipes,
	RECIPES,
	type Recipe,
	searchRecipes,
} from "../lib/recipes";

/**
 * Onboarding — the redesign, on a preview route.
 *
 * ⚠️ Deliberately NOT `/onboarding`. The live flow still runs the old screens so
 * that reviewing this cannot touch a real account: nothing here creates a
 * workspace, and the final step is reachable without one existing. When this is
 * signed off it replaces `onboarding.tsx` wholesale.
 *
 * 🔑 One question per screen. Onboarding is the only part of the product where a
 * person has no idea what anything means yet, so every screen asks for exactly
 * one thing and says what it will do with the answer.
 */

const primaryAction =
	"inline-flex h-10 w-full items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[13px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] text-[var(--ink-40)] outline-none transition-colors hover:text-[var(--ink-85)]";

const field =
	"h-11 w-full rounded-xl border border-[var(--console-line-strong)] bg-transparent px-4 text-[14px] text-[var(--ink-90)] outline-none transition-colors placeholder:text-[var(--ink-25)] focus:border-[rgb(var(--console-ink)/0.2)]";

type Step = "name" | "kind" | "review" | "done";
const ORDER: Step[] = ["name", "kind", "review", "done"];

function OnboardingPreview() {
	const [step, setStep] = useState<Step>("name");
	const [name, setName] = useState("");
	const [query, setQuery] = useState("");
	const [recipe, setRecipe] = useState<Recipe | null>(null);
	const catalog = useQuery(accountQueries.moduleCatalog());

	const matches = useMemo(
		() => (query.trim() ? searchRecipes(query).slice(0, 7) : []),
		[query],
	);
	const suggestions = useMemo(
		() =>
			groupRecipes(RECIPES)
				.flatMap(([, entries]) => entries.slice(0, 2))
				.slice(0, 7),
		[],
	);

	const moduleNames = new Map(
		(catalog.data?.items ?? []).map((module) => [module.id, module.name]),
	);
	const included = (recipe?.modules ?? []).map(
		(id) => moduleNames.get(id) ?? id,
	);

	const index = ORDER.indexOf(step);
	const back = () => setStep(ORDER[Math.max(index - 1, 0)] ?? "name");

	return (
		<main className="flex min-h-svh flex-col items-center justify-center bg-[var(--console-bg)] px-5 py-16 text-[var(--ink-90)]">
			<div className="w-full max-w-sm">
				{/* Progress as three marks, not a percentage. Somebody four screens into
				    a product they have never used wants to know it is nearly over, not
				    that they are 66.7% of the way there. */}
				{step === "done" ? null : (
					<div className="mb-8 flex items-center gap-1.5">
						{ORDER.slice(0, 3).map((entry, position) => (
							<span
								key={entry}
								className={`h-0.5 flex-1 rounded-full transition-colors ${
									position <= index
										? "bg-[var(--ink-60)]"
										: "bg-[rgb(var(--console-ink)/0.1)]"
								}`}
							/>
						))}
					</div>
				)}

				{step === "name" ? (
					<form
						onSubmit={(event) => {
							event.preventDefault();
							if (name.trim()) setStep("kind");
						}}
					>
						<p className="text-[19px] text-[var(--ink-90)]">
							What are you building?
						</p>
						<p className="mt-2 text-[12.5px] text-[var(--ink-35)] leading-5">
							The name of your business. You can change it later.
						</p>
						<input
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Your business name"
							aria-label="Business name"
							className={`${field} mt-6`}
						/>
						<button
							type="submit"
							disabled={!name.trim()}
							className={`${primaryAction} mt-4`}
						>
							Continue
						</button>
					</form>
				) : null}

				{step === "kind" ? (
					<div>
						<p className="text-[19px] text-[var(--ink-90)]">
							What kind of business is {name.trim() || "it"}?
						</p>
						<p className="mt-2 text-[12.5px] text-[var(--ink-35)] leading-5">
							This decides what {name.trim() || "your workspace"} starts with.
							Nothing is permanent, every part can be turned on or off later.
						</p>

						<div className="mt-6 flex h-11 items-center gap-2 rounded-xl border border-[var(--console-line-strong)] px-4 transition-colors focus-within:border-[rgb(var(--console-ink)/0.2)]">
							<MagnifyingGlassIcon
								size={15}
								className="shrink-0 text-[var(--ink-30)]"
							/>
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Coffee shop, agency, plumber…"
								aria-label="Search business types"
								className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--ink-90)] outline-none placeholder:text-[var(--ink-25)]"
							/>
						</div>

						<div className="mt-2 flex flex-col">
							{(query.trim() ? matches : suggestions).map((entry) => (
								<button
									key={entry.id}
									type="button"
									onClick={() => {
										setRecipe(entry);
										setStep("review");
									}}
									className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)]"
								>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-[13px] text-[var(--ink-85)]">
											{entry.name}
										</span>
										<span className="mt-0.5 block truncate text-[11.5px] text-[var(--ink-30)]">
											{entry.category}
										</span>
									</span>
								</button>
							))}
							{query.trim() && matches.length === 0 ? (
								<p className="px-3 py-3 text-[12px] text-[var(--ink-30)] leading-5">
									Nothing matches that. Pick whatever is closest, it only
									decides where you start.
								</p>
							) : null}
						</div>

						<button
							type="button"
							onClick={back}
							className={`${quietAction} mt-4`}
						>
							<ArrowLeftIcon size={12} />
							Back
						</button>
					</div>
				) : null}

				{step === "review" ? (
					<div>
						<p className="text-[19px] text-[var(--ink-90)]">
							Here is what you get
						</p>
						<p className="mt-2 text-[12.5px] text-[var(--ink-35)] leading-5">
							{name.trim()} as a {recipe?.name.toLowerCase()}, with these turned
							on.
						</p>

						<div className="mt-6 flex flex-wrap gap-1.5">
							{included.map((label) => (
								<span
									key={label}
									className="rounded-full bg-[rgb(var(--console-ink)/0.06)] px-2.5 py-1 text-[11.5px] text-[var(--ink-60)]"
								>
									{label}
								</span>
							))}
						</div>

						<p className="mt-5 text-[11.5px] text-[var(--ink-30)] leading-5">
							Anything missing can be added in a click, and anything you do not
							use can be turned off. Nothing here is a commitment.
						</p>

						{/* ⚠️ Preview only. The live flow creates the workspace here. */}
						<button
							type="button"
							onClick={() => setStep("done")}
							className={`${primaryAction} mt-6`}
						>
							Create {name.trim() || "workspace"}
						</button>
						<button
							type="button"
							onClick={back}
							className={`${quietAction} mt-3`}
						>
							<ArrowLeftIcon size={12} />
							Back
						</button>
					</div>
				) : null}

				{step === "done" ? (
					<div>
						<span
							aria-hidden="true"
							className="flex size-10 items-center justify-center rounded-full bg-[rgb(var(--console-ink)/0.08)]"
						>
							<CheckIcon size={18} className="text-[var(--ink-85)]" />
						</span>
						<p className="mt-5 text-[19px] text-[var(--ink-90)]">
							{name.trim() || "Your workspace"} is ready
						</p>
						<p className="mt-2 text-[12.5px] text-[var(--ink-35)] leading-5">
							QuickDash is where you run it. Your first job is waiting on the
							home screen: one real thing, not a tour.
						</p>
						<button type="button" className={`${primaryAction} mt-6`}>
							Open QuickDash
						</button>
						<p className="mt-3 text-[11px] text-[var(--ink-25)] leading-4">
							Preview: the live flow opens the workspace it just created.
						</p>
					</div>
				) : null}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/onboarding-preview")({
	component: OnboardingPreview,
});
