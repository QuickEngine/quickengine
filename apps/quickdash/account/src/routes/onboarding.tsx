import { ArrowLeft, ArrowRight, Check, Lock } from "@phosphor-icons/react";
import { GREY, ICE } from "@quickengine/ui";

/**
 * ⚠️ A SOLID card colour, not a translucent fill.
 *
 * `bg-white/[0.02]` over the gradient is not a surface — the wave moves under it
 * and the panel reads as a smudge that brightens and dims. The marketing site
 * records the same decision in `lib/surfaces.ts`; this is that value. If a third
 * app needs it, move it to `@quickengine/ui` rather than typing it again.
 */
const _CARD = "#101315";

import { WaveBackground } from "@quickengine/ui/wave-background";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { api } from "../lib/api";
import { clientEnv } from "../lib/env";
import { FOUNDATION } from "../lib/modules";
import { findRecipe, RECIPES, type Recipe } from "../lib/recipes";

/**
 * ⚠️ `setup` and `ai` were removed on 2026-08-11 and are NOT in this union any
 * more, so nothing can navigate to a step that no longer renders. See the note
 * where they used to be for why they went and what comes back.
 */
type Step = "name" | "modules" | "review" | "success";
type SetupChoice = "ai" | "manual" | "defaults";
type CatalogModule = {
	id: string;
	name: string;
	description: string;
	kind: "shared" | "domain";
	dependsOn: readonly string[];
	status: "built" | "upcoming";
};

const _panel =
	"rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-5 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04]";

/**
 * The onboarding canvas.
 *
 * ⚠️ THE GRADIENT CARRIES THROUGH FROM AUTH. Somebody arriving here has just
 * come from a full-bleed gradient at `auth.quickdash.xyz`, and onboarding is the
 * last step of signing up rather than the first screen of a different product.
 * Breaking the surface here is what made the journey feel like being handed off
 * between two companies.
 *
 * 🔴 It stops at `success`, deliberately. That screen is the handover INTO the
 * dashboard, and letting the marketing surface run all the way through would rob
 * the arrival of any change. Pass `plain` on the last step only.
 *
 * Content is centred. It was left-aligned against a centred column, which reads
 * as a mistake at every width.
 */
function Canvas({
	children,
	onBack,
	jumper,
	plain = false,
	skippable = true,
	onSkip,
}: {
	children: React.ReactNode;
	onBack?: () => void;
	/** Dev-only step navigation. Absent from production builds. */
	jumper?: React.ReactNode;
	/** Drop the gradient. The final step only. */
	plain?: boolean;
	/** Skip performs this instead of leaving onboarding. See the setup step. */
	onSkip?: () => void;
	/**
	 * Whether Skip is offered.
	 *
	 * 🔴 FALSE ON THE FIRST STEP. The name creates both the organisation and the
	 * first workspace, so there is nothing to skip TO — skipping would leave an
	 * account with no business at all, produced by accident rather than by
	 * choice. Naming is the one thing onboarding genuinely requires.
	 */
	skippable?: boolean;
}) {
	return (
		<div className="relative isolate min-h-svh bg-black">
			{plain ? null : <WaveBackground />}

			{/* 🔴 NO LOGO HERE, and that is deliberate.

			    On the marketing site the mark goes home; on auth it goes back to the
			    marketing site. Both are correct — nothing is half-finished at either
			    point. Onboarding is different: by the time this renders, an
			    organisation exists and a workspace does not, so a mark that behaves
			    like every other mark on the site is an EXIT out of a flow somebody is
			    part-way through, taken out of habit rather than intent. They come back
			    to an account in a state nobody designed.

			    The brand is established by now anyway — they have just crossed the
			    marketing site and the whole of auth to get here.

			    Every way out of onboarding should be deliberate, which means Skip and
			    nothing else. */}
			{plain ? null : (
				<div className="absolute inset-x-0 top-0 z-20 flex h-[var(--header-h)] items-center justify-between px-5 sm:px-16">
					{onBack ? (
						<button
							type="button"
							onClick={onBack}
							style={{ backgroundColor: GREY, color: ICE }}
							className="inline-flex h-9 items-center gap-1.5 rounded-full ps-3 pe-4 font-body font-light text-[13px] leading-none transition-opacity duration-300 ease-out hover:opacity-85"
						>
							<ArrowLeft className="size-3.5" weight="bold" />
							Back
						</button>
					) : (
						<span />
					)}

					{/* 🔴 Skip leaves onboarding WITHOUT creating a workspace. That is a
					    real state — an account with no workspace — which the account app
					    has to handle rather than assume away. Do not make this silently
					    create a default: a business named "My workspace" that nobody
					    asked for is worse than an empty account. */}
					{skippable ? (
						<button
							type="button"
							onClick={onSkip}
							style={{ backgroundColor: GREY, color: ICE }}
							className="inline-flex h-9 items-center rounded-full px-4 font-body font-light text-[13px] leading-none no-underline transition-opacity duration-300 ease-out hover:opacity-85"
						>
							Skip
						</button>
					) : (
						<span />
					)}
				</div>
			)}

			<main className="relative mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center px-6 py-12 pb-20 text-center">
				{children}
				{jumper}
			</main>
		</div>
	);
}

/**
 * The quiet action under a primary button.
 *
 * ⚠️ Underlines on HOVER, not at rest — the rule the auth screens settled on, so
 * a tertiary reads as text until somebody reaches for it.
 */
function Tertiary({
	children,
	onClick,
	href,
}: {
	children: React.ReactNode;
	onClick?: () => void;
	href?: string;
}) {
	const className =
		"mt-4 inline-block font-body font-light text-[0.8125rem] text-white/45 no-underline transition-colors duration-200 hover:text-white hover:underline underline-offset-4";
	return href ? (
		<a href={href} className={className}>
			{children}
		</a>
	) : (
		<button type="button" onClick={onClick} className={className}>
			{children}
		</button>
	);
}

/**
 * Dev-only step navigation.
 *
 * ⚠️ Onboarding is a one-way flow by design: each step is only reachable by
 * completing the one before it, and `success` needs a workspace that was really
 * created. That makes reviewing the screens almost impossible without signing up
 * repeatedly and truncating the database between attempts, which is how screens
 * end up shipped unlooked-at.
 *
 * 🔴 `import.meta.env.DEV` is a BUILD-TIME constant. Vite substitutes `false` in
 * a production build and the bundler removes this component and every call to it
 * entirely — there is no runtime path to it and no flag that turns it on. Do not
 * swap it for an env var or a query parameter.
 *
 * It jumps between steps WITHOUT creating anything, so the later screens render
 * against whatever state has been filled in so far. That is deliberate: seeing a
 * step with empty state is how you find the empty state.
 */
const STEPS: Step[] = ["name", "modules", "review", "success"];

function StepJumper({
	step,
	onJump,
}: {
	step: Step;
	onJump: (next: Step) => void;
}) {
	if (!import.meta.env.DEV) return null;

	return (
		<div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-1.5 border-white/10 border-t bg-black/85 px-4 py-2 backdrop-blur-sm">
			<span className="mr-1 font-mono text-[10px] text-white/30 uppercase tracking-[0.12em]">
				dev only
			</span>
			{STEPS.map((candidate) => (
				<button
					key={candidate}
					type="button"
					onClick={() => onJump(candidate)}
					className={`rounded-full px-3 py-1 font-mono text-[11px] transition-colors ${
						candidate === step
							? "bg-white text-black"
							: "text-white/45 hover:bg-white/10 hover:text-white"
					}`}
				>
					{candidate}
				</button>
			))}
		</div>
	);
}

function OnboardingPage() {
	const queryClient = useQueryClient();
	const [step, setStep] = useState<Step>("name");
	const [businessName, setBusinessName] = useState("");
	const [recipe, setRecipe] = useState<Recipe | null>(null);
	const [_setupChoice, setSetupChoice] = useState<SetupChoice | null>(null);
	const [moduleIds, setModuleIds] = useState<readonly string[]>(FOUNDATION);
	const [error, setError] = useState<string | null>(null);
	const [description, _setDescription] = useState(
		Route.useSearch().prompt?.slice(0, 500) ?? "",
	);
	const [_recommendationReason, setRecommendationReason] = useState<
		string | null
	>(null);
	const [workspaceId, setWorkspaceId] = useState<string | null>(null);
	const catalog = useQuery({
		queryKey: ["account", "module-catalog"],
		queryFn: async () =>
			(await api.request<{ items: CatalogModule[] }>("/account/module-catalog"))
				.data.items,
	});
	const create = useMutation({
		mutationFn: () =>
			api.request<{ id: string }>("/account/workspaces", {
				method: "POST",
				body: {
					name: businessName,
					businessType: recipe?.id ?? "custom",
					moduleIds,
					completeOnboarding: true,
				},
			}),
		onSuccess: async ({ data: workspace }) => {
			await queryClient.invalidateQueries({ queryKey: ["account"] });
			setWorkspaceId(workspace.id);
			setStep("success");
		},
		onError: (cause) =>
			setError(
				cause instanceof Error
					? cause.message
					: "We couldn't create your workspace. Nothing was partially saved.",
			),
	});
	const _recommend = useMutation({
		mutationFn: () =>
			api.request<{
				recipeId: string;
				moduleIds: readonly string[];
				rationale: string;
				source: "ai" | "catalog-fallback";
			}>("/account/onboarding/recommend", {
				method: "POST",
				body: {
					description,
					recipes: RECIPES.map((candidate) => ({
						id: candidate.id,
						name: candidate.name,
						category: candidate.category,
						keywords: candidate.keywords,
						moduleIds: candidate.modules,
					})),
				},
			}),
		onSuccess: ({ data }) => {
			setRecipe(findRecipe(data.recipeId) ?? null);
			setModuleIds(data.moduleIds);
			setRecommendationReason(
				data.source === "ai"
					? data.rationale
					: `${data.rationale} QuickDash used its built-in business catalog because an AI provider was not available.`,
			);
			setSetupChoice("ai");
			setStep("review");
		},
		onError: (cause) =>
			setError(
				cause instanceof Error && cause.message.includes("limit")
					? "You've reached the recommendation limit for now. Build it yourself or start with defaults."
					: "Recommendations are unavailable right now. Build it yourself or start with defaults.",
			),
	});

	const useDefaults = () => {
		setRecipe(null);
		setRecommendationReason(null);
		setSetupChoice("defaults");
		setModuleIds(FOUNDATION);
		setStep("review");
	};
	const _startManual = () => {
		setRecipe(null);
		setRecommendationReason(null);
		setSetupChoice("manual");
		setModuleIds(FOUNDATION);
		setStep("modules");
	};
	const toggleModule = (id: string) => {
		const modules = catalog.data ?? [];
		const byId = new Map(modules.map((module) => [module.id, module]));
		const next = new Set(moduleIds);
		if (next.has(id)) {
			const required = [...next].some(
				(selected) =>
					selected !== id && byId.get(selected)?.dependsOn.includes(id),
			);
			if (!required) next.delete(id);
		} else {
			const add = (moduleId: string) => {
				if (next.has(moduleId)) return;
				next.add(moduleId);
				for (const dependency of byId.get(moduleId)?.dependsOn ?? [])
					add(dependency);
			};
			add(id);
		}
		setModuleIds([...next]);
	};

	if (step === "name") {
		const submit = (event: FormEvent) => {
			event.preventDefault();
			if (businessName.trim()) setStep("modules");
		};
		return (
			<Canvas
				skippable={false}
				jumper={<StepJumper step={step} onJump={setStep} />}
			>
				{/* ⚠️ ONE COLUMN. The heading used to run to the full 42rem canvas while
				    the form was capped at 28rem, so the question and the field answering
				    it were two different widths stacked on each other. That mismatch is
				    what read as "off" without being nameable. Everything shares 26rem
				    now, and the heading is sized to sit inside it in two lines. */}
				<div className="mx-auto w-full max-w-[26rem]">
					<h1 className="font-display font-light text-[clamp(1.5rem,3.4vw,2rem)] text-white leading-[1.15] tracking-[-0.02em]">
						What's your business called?
					</h1>
					{/* Fully rounded, matching the auth field and pill exactly, because
					    this is the screen straight after signing up.

					    ⚠️ Text is LEFT-aligned inside it. The field was centring what you
					    typed, which almost nothing does — the cursor starts mid-field and
					    drifts as you type, and it is the second thing that made this
					    screen feel wrong. Centred layout, ordinary field. */}
					<form onSubmit={submit} className="mt-8 w-full">
						<input
							aria-label="Business name"
							value={businessName}
							onChange={(event) => setBusinessName(event.target.value)}
							placeholder="Kestrel Audio"
							className="h-12 w-full rounded-full border border-white/15 bg-black/45 px-5 font-body font-light text-[1rem] text-white outline-none backdrop-blur-sm transition-colors duration-300 placeholder:text-white/30 focus:border-white/35"
						/>
						<button
							type="submit"
							disabled={!businessName.trim()}
							style={{ backgroundColor: ICE, color: "#000000" }}
							className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full font-body font-normal text-[0.9375rem] transition-opacity duration-300 ease-out hover:opacity-85 disabled:opacity-40"
						>
							Continue
						</button>
					</form>
				</div>
			</Canvas>
		);
	}

	// 🔴 THE "setup" AND "ai" STEPS WERE REMOVED, 2026-08-11.
	//
	// AI recommendation needs a real conversation surface — the user describing
	// their business and reading back what we propose — and a chat area does not
	// exist. It also costs money per run, which is not affordable yet. It returns
	// in the second design sweep; `/account/onboarding/recommend` and the
	// `recommend` mutation below are left intact so nothing has to be rebuilt.
	//
	// With AI gone, "How do you want to set it up?" had one real answer left, so
	// the fork was deleted rather than left as a screen asking a question with a
	// single option. Naming now leads straight to modules, and "start with
	// defaults" is the Skip in the corner — which is what Skip already meant.

	if (step === "modules") {
		const modules = catalog.data ?? [];
		return (
			<Canvas
				onBack={() => setStep("name")}
				onSkip={useDefaults}
				jumper={<StepJumper step={step} onJump={setStep} />}
			>
				{/* ⚠️ AS EMPTY AS AN AUTH SCREEN, deliberately. Every earlier attempt at
				    this flow failed the same way: dashboard-sized content on a moving
				    gradient has no surface to sit on and floats. Cards, hairline rows and
				    a divided panel were all tried and all failed identically, which is
				    how you know the container was never the problem.

				    So the content shrank instead. A heading, a list of names, a button.
				    No descriptions, no icons, no panels. There is nothing left to lay
				    out, which is exactly why the auth screens work. */}
				<div className="mx-auto w-full max-w-[30rem]">
					<h1 className="font-display font-light text-[clamp(1.5rem,3.4vw,2rem)] text-white leading-[1.15] tracking-[-0.02em]">
						What does it need?
					</h1>

					<div className="mt-9 flex max-h-[52vh] flex-col overflow-y-auto text-left">
						{modules.map((module) => {
							const selected = moduleIds.includes(module.id);
							const upcoming = module.status === "upcoming";
							return (
								<button
									key={module.id}
									type="button"
									disabled={upcoming}
									onClick={() => toggleModule(module.id)}
									className="flex items-center justify-between gap-4 border-white/[0.07] border-b py-3.5 text-left transition-opacity duration-200 last:border-b-0 disabled:opacity-30"
								>
									<span
										style={selected ? { color: ICE } : undefined}
										className={`font-body font-light text-[0.9375rem] ${selected ? "" : "text-white/55"}`}
									>
										{module.name}
									</span>
									{upcoming ? (
										<Lock size={14} className="shrink-0 text-white/25" />
									) : selected ? (
										<Check
											size={15}
											weight="bold"
											color={ICE}
											className="shrink-0"
										/>
									) : (
										// Holds the row height so ticking one does not shift the
										// list under the cursor.
										<span className="size-[15px] shrink-0" />
									)}
								</button>
							);
						})}
					</div>

					<button
						type="button"
						onClick={() => setStep("review")}
						disabled={moduleIds.length === 0}
						style={{ backgroundColor: ICE, color: "#000000" }}
						className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-full font-body font-normal text-[0.9375rem] transition-opacity duration-300 ease-out hover:opacity-85 disabled:opacity-40"
					>
						Continue
					</button>
				</div>
			</Canvas>
		);
	}

	if (step === "success") {
		return (
			// ⚠️ `plain` — the gradient stops here. Every other step carries it
			// through from auth; this is the handover INTO the dashboard, and letting
			// the marketing surface run all the way through would rob the arrival of
			// any change. The animation is what marks the moment instead.
			<Canvas plain jumper={<StepJumper step={step} onJump={setStep} />}>
				<div className="mx-auto flex w-full max-w-[30rem] flex-col items-center text-center">
					{/* The mark, with a ring that expands once and stops. A looping pulse
					    turns a moment into a fidget. */}
					<div className="onboard-in relative flex size-16 items-center justify-center">
						<span
							aria-hidden="true"
							style={{ borderColor: ICE }}
							className="onboard-ring absolute inset-0 rounded-full border"
						/>
						<span
							style={{ borderColor: `${ICE}45` }}
							className="flex size-16 items-center justify-center rounded-full border"
						>
							<Check size={26} weight="light" color={ICE} />
						</span>
					</div>

					{/* The business name, set as large as anything in the product. This is
					    the first time somebody sees the thing they just made named back
					    to them, and it should read as theirs rather than as a receipt. */}
					<h1 className="onboard-in onboard-in-1 mt-8 font-display font-light text-[clamp(1.75rem,4.5vw,2.75rem)] text-white leading-[1.1] tracking-[-0.025em]">
						{businessName || "Your workspace"}
					</h1>

					<p className="onboard-in onboard-in-1 mt-4 font-body font-light text-[0.9375rem] text-white/55 leading-[1.55]">
						{moduleIds.length} module{moduleIds.length === 1 ? "" : "s"} enabled
						and ready to build on.
					</p>

					<div className="onboard-in onboard-in-2 mt-9 flex w-full flex-col items-center gap-3">
						<a
							href={
								workspaceId
									? `${clientEnv.DASH_URL}/${workspaceId}`
									: clientEnv.DASH_URL
							}
							style={{ backgroundColor: ICE, color: "#000000" }}
							className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full font-body font-normal text-[0.9375rem] no-underline transition-opacity duration-300 ease-out hover:opacity-85"
						>
							Enter {businessName || "workspace"}
							<ArrowRight size={15} weight="bold" />
						</a>
					</div>

					<div className="onboard-in onboard-in-3">
						<Tertiary href="/">Go to your account</Tertiary>
					</div>
				</div>
			</Canvas>
		);
	}

	// The review step, and the last screen before a workspace exists.
	return (
		<Canvas
			onBack={() => setStep("modules")}
			onSkip={useDefaults}
			jumper={<StepJumper step={step} onJump={setStep} />}
		>
			<div className="mx-auto w-full max-w-[30rem]">
				<h1 className="font-display font-light text-[clamp(1.5rem,3.4vw,2rem)] text-white leading-[1.15] tracking-[-0.02em]">
					Ready to create {businessName || "your workspace"}?
				</h1>

				{/* Two facts and a list of names. Everything else that used to be here
				    — the starting-point row, the bordered summary box, the explanation
				    that nothing is charged — was scaffolding around information that
				    fits in a sentence. */}
				<dl className="mt-9 flex flex-col text-left">
					<div className="flex items-baseline justify-between gap-6 border-white/[0.07] border-b py-3.5">
						<dt className="font-body font-light text-[0.875rem] text-white/45">
							Workspace
						</dt>
						<dd className="font-body font-light text-[0.9375rem] text-white">
							{businessName || "Untitled"}
						</dd>
					</div>
					<div className="flex items-baseline justify-between gap-6 border-white/[0.07] border-b py-3.5">
						<dt className="font-body font-light text-[0.875rem] text-white/45">
							Modules
						</dt>
						<dd
							style={{ fontVariantNumeric: "tabular-nums" }}
							className="font-body font-light text-[0.9375rem] text-white"
						>
							{moduleIds.length}
						</dd>
					</div>
				</dl>

				<div className="mt-5 flex flex-wrap gap-2">
					{moduleIds.map((id) => (
						<span
							key={id}
							className="rounded-full border border-white/12 px-3 py-1 font-body font-light text-[0.75rem] text-white/55 capitalize"
						>
							{id.replaceAll("-", " ")}
						</span>
					))}
				</div>

				{/* Reserved space, so the button never moves when a failure appears.
				    Same rule as every form in auth. */}
				<div role="alert" className="mt-6 min-h-[1.0625rem]">
					{error ? (
						<p
							style={{ color: "#E8B4B4" }}
							className="font-body font-light text-[0.8125rem] leading-[1.0625rem]"
						>
							{error}
						</p>
					) : null}
				</div>

				<button
					type="button"
					onClick={() => create.mutate()}
					disabled={create.isPending}
					style={{ backgroundColor: ICE, color: "#000000" }}
					className="inline-flex h-12 w-full items-center justify-center rounded-full font-body font-normal text-[0.9375rem] transition-opacity duration-300 ease-out hover:opacity-85 disabled:opacity-40"
				>
					{create.isPending ? "Creating…" : "Create workspace"}
				</button>
			</div>
		</Canvas>
	);
}

export const Route = createFileRoute("/onboarding")({
	validateSearch: z.object({ prompt: z.string().optional() }),
	component: OnboardingPage,
});
