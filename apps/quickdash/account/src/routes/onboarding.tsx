import {
	ArrowLeft,
	Check,
	CircleNotch,
	Lock,
	MagnifyingGlass,
	SlidersHorizontal,
	Sparkle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { OnboardingTwoFactorStep } from "../components/onboarding-two-factor-step";
import { api } from "../lib/api";
import { clientEnv } from "../lib/env";
import { FOUNDATION, moduleIcon } from "../lib/modules";
import { findRecipe, groupRecipes, RECIPES, type Recipe } from "../lib/recipes";

type Step =
	| "security"
	| "name"
	| "setup"
	| "ai"
	| "preset"
	| "modules"
	| "review"
	| "success";
type CatalogModule = {
	id: string;
	name: string;
	description: string;
	kind: "shared" | "domain";
	dependsOn: readonly string[];
	status: "built" | "upcoming";
};

const heading = "font-display text-4xl tracking-tight";
const panel =
	"rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-5 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04]";

function Canvas({
	children,
	onBack,
}: {
	children: React.ReactNode;
	onBack?: () => void;
}) {
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-4xl flex-col justify-center px-6 py-12">
			{onBack && (
				<button
					type="button"
					onClick={onBack}
					className="mb-8 flex w-fit items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
				>
					<ArrowLeft className="size-4" />
					Back
				</button>
			)}
			{children}
		</main>
	);
}

function OnboardingPage() {
	const queryClient = useQueryClient();
	const state = useQuery({
		queryKey: ["account", "state"],
		queryFn: async () =>
			(
				await api.request<{
					hasPassword: boolean;
					twoFactorEnabled: boolean;
				}>("/account/state")
			).data,
	});
	const [step, setStep] = useState<Step>("security");
	const [businessName, setBusinessName] = useState("");
	const [query, setQuery] = useState("");
	const [recipe, setRecipe] = useState<Recipe | null>(null);
	const [moduleIds, setModuleIds] = useState<readonly string[]>(FOUNDATION);
	const [error, setError] = useState<string | null>(null);
	const [description, setDescription] = useState(
		Route.useSearch().prompt?.slice(0, 500) ?? "",
	);
	const [recommendationReason, setRecommendationReason] = useState<
		string | null
	>(null);
	const [workspaceId, setWorkspaceId] = useState<string | null>(null);
	const catalog = useQuery({
		queryKey: ["account", "module-catalog"],
		queryFn: async () =>
			(await api.request<{ items: CatalogModule[] }>("/account/module-catalog"))
				.data.items,
	});
	useEffect(() => {
		if (
			step === "security" &&
			state.isSuccess &&
			(!state.data.hasPassword || state.data.twoFactorEnabled)
		) {
			setStep("name");
		}
	}, [state.data, state.isSuccess, step]);

	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return RECIPES;
		return RECIPES.filter((candidate) =>
			[candidate.name, candidate.category, ...candidate.keywords]
				.join(" ")
				.toLowerCase()
				.includes(needle),
		);
	}, [query]);

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
	const recommend = useMutation({
		mutationFn: () =>
			api.request<{
				recipeId: string;
				moduleIds: readonly string[];
				rationale: string;
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
			setRecommendationReason(data.rationale);
			setStep("review");
		},
		onError: (cause) =>
			setError(
				cause instanceof Error && cause.message.includes("limit")
					? "You've reached the recommendation limit for now. Choose a preset or continue manually."
					: "Recommendations are unavailable right now. Choose a preset or continue manually.",
			),
	});

	const chooseRecipe = (selected: Recipe) => {
		setRecipe(selected);
		setModuleIds(selected.modules);
		setStep("review");
	};

	const useDefaults = () => {
		setRecipe(null);
		setModuleIds(FOUNDATION);
		setStep("review");
	};
	const startManual = () => {
		setRecipe(null);
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

	if (step === "security") {
		if (state.isPending) return <Canvas>Loading your account…</Canvas>;
		if (state.isError) throw state.error;
		if (state.data.hasPassword && !state.data.twoFactorEnabled) {
			return (
				<Canvas>
					<OnboardingTwoFactorStep onDone={() => setStep("name")} />
				</Canvas>
			);
		}
		return <Canvas>Preparing your workspace…</Canvas>;
	}

	if (step === "name") {
		const submit = (event: FormEvent) => {
			event.preventDefault();
			if (businessName.trim()) setStep("setup");
		};
		return (
			<Canvas>
				<img src="/logo.svg" alt="QuickEngine" className="mb-8 size-8" />
				<p className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
					Welcome
				</p>
				<h1 className={`mt-3 ${heading}`}>What's your business called?</h1>
				<p className="mt-3 text-muted-foreground">
					This names your first workspace. You can rename it later.
				</p>
				<form onSubmit={submit}>
					<input
						aria-label="Business name"
						value={businessName}
						onChange={(event) => setBusinessName(event.target.value)}
						placeholder="Acme Inc."
						className="mt-8 w-full max-w-md rounded-lg border border-input bg-transparent px-4 py-3 outline-none focus-visible:ring-2"
					/>
					<button
						type="submit"
						disabled={!businessName.trim()}
						className="mt-6 block rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm disabled:opacity-40"
					>
						Continue
					</button>
				</form>
			</Canvas>
		);
	}

	if (step === "setup") {
		return (
			<Canvas onBack={() => setStep("name")}>
				<h1 className={heading}>How do you want to set it up?</h1>
				<p className="mt-3 text-muted-foreground">
					Either way you can change every module afterwards.
				</p>
				<div className="mt-8 grid gap-4 sm:grid-cols-2">
					<button
						type="button"
						onClick={() => setStep("ai")}
						className={`${panel} sm:col-span-2`}
					>
						<Sparkle className="size-6" />
						<h2 className="mt-4 font-medium">Set it up for me</h2>
						<p className="mt-1 max-w-md text-muted-foreground text-sm">
							Describe the business. We'll recommend a starting recipe for you
							to review.
						</p>
					</button>
					<button
						type="button"
						onClick={() => setStep("preset")}
						className={panel}
					>
						<Sparkle className="size-6" />
						<h2 className="mt-4 font-medium">Use a preset</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Pick the closest fit and review the modules it enables.
						</p>
					</button>
					<button type="button" onClick={startManual} className={panel}>
						<SlidersHorizontal className="size-6" />
						<h2 className="mt-4 font-medium">Choose modules myself</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Start with the foundation and tailor every module yourself.
						</p>
					</button>
				</div>
				<button
					type="button"
					onClick={useDefaults}
					className="mt-6 w-fit text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
				>
					Skip — use sensible defaults
				</button>
			</Canvas>
		);
	}

	if (step === "ai") {
		return (
			<Canvas onBack={() => setStep("setup")}>
				<h1 className={heading}>Describe your business</h1>
				<p className="mt-3 text-muted-foreground">
					A short description is enough. You'll review and edit the result
					before anything is created.
				</p>
				<textarea
					aria-label="Business description"
					value={description}
					onChange={(event) => setDescription(event.target.value.slice(0, 500))}
					rows={5}
					placeholder="We sell handmade jewelry online and ship across Canada."
					className="mt-8 w-full max-w-xl resize-none rounded-lg border border-input bg-transparent px-4 py-3 outline-none focus-visible:ring-2"
				/>
				<p className="mt-2 text-muted-foreground text-xs">
					{description.length}/500. Don't include passwords, payment details, or
					private customer data.
				</p>
				<button
					type="button"
					disabled={description.trim().length < 10 || recommend.isPending}
					onClick={() => {
						setError(null);
						recommend.mutate();
					}}
					className="mt-6 inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm disabled:opacity-40"
				>
					{recommend.isPending && (
						<CircleNotch className="size-4 animate-spin" />
					)}
					{recommend.isPending ? "Finding a fit…" : "Recommend my workspace"}
				</button>
				{error && (
					<p role="alert" className="mt-4 text-destructive text-sm">
						{error}
					</p>
				)}
				<div className="mt-5 flex gap-4 text-sm">
					<button
						type="button"
						onClick={() => setStep("preset")}
						className="text-muted-foreground hover:text-foreground"
					>
						Choose a preset instead
					</button>
					<button
						type="button"
						onClick={startManual}
						className="text-muted-foreground hover:text-foreground"
					>
						Choose modules myself
					</button>
				</div>
			</Canvas>
		);
	}

	if (step === "preset") {
		return (
			<Canvas onBack={() => setStep("setup")}>
				<h1 className={heading}>What are you building?</h1>
				<p className="mt-3 text-muted-foreground">
					Search for the closest business type. You'll review it before
					creation.
				</p>
				<label className="mt-8 flex max-w-md items-center gap-3 rounded-lg border border-input px-4">
					<MagnifyingGlass className="size-4 text-muted-foreground" />
					<input
						type="search"
						aria-label="Search business types"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Plumber, photographer, online store…"
						className="w-full bg-transparent py-3 outline-none"
					/>
				</label>
				<div className="mt-6 max-h-[52vh] space-y-6 overflow-y-auto">
					{groupRecipes(matches).map(([category, recipes]) => (
						<section key={category}>
							<h2 className="text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
								{category}
							</h2>
							<div className="mt-3 grid gap-2 sm:grid-cols-3">
								{recipes.map((candidate) => (
									<button
										key={candidate.id}
										type="button"
										onClick={() => chooseRecipe(candidate)}
										className={panel}
									>
										<p className="font-medium">{candidate.name}</p>
									</button>
								))}
							</div>
						</section>
					))}
				</div>
			</Canvas>
		);
	}

	if (step === "modules") {
		return (
			<Canvas onBack={() => setStep("setup")}>
				<h1 className={heading}>Choose your modules</h1>
				<p className="mt-3 text-muted-foreground">
					Select what this workspace needs. Required dependencies are included
					automatically.
				</p>
				<div className="mt-8 grid max-h-[55vh] gap-3 overflow-y-auto sm:grid-cols-2">
					{catalog.data?.map((module) => {
						const selected = moduleIds.includes(module.id);
						const Glyph = moduleIcon(module.id);
						const upcoming = module.status === "upcoming";
						return (
							<button
								key={module.id}
								type="button"
								disabled={upcoming}
								onClick={() => toggleModule(module.id)}
								className={`${panel} ${selected ? "border-foreground/30 bg-foreground/[0.06]" : ""}`}
							>
								<div className="flex items-center justify-between gap-3">
									<Glyph className="size-5" />
									<p className="font-medium">{module.name}</p>
									{upcoming ? (
										<Lock className="size-4" />
									) : (
										selected && <Check className="size-4" />
									)}
								</div>
								<p className="mt-1 text-muted-foreground text-sm">
									{module.description}
								</p>
							</button>
						);
					})}
				</div>
				<button
					type="button"
					onClick={() => setStep("review")}
					disabled={moduleIds.length === 0}
					className="mt-6 rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm disabled:opacity-40"
				>
					Review workspace
				</button>
			</Canvas>
		);
	}

	if (step === "success") {
		return (
			<Canvas>
				<div className="mx-auto flex max-w-md flex-col items-center text-center">
					<div className="flex size-16 items-center justify-center rounded-full border border-foreground/15 bg-foreground/[0.06]">
						<Check className="size-8" weight="bold" />
					</div>
					<p className="mt-6 text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
						Workspace ready
					</p>
					<h1 className={`mt-2 ${heading}`}>{businessName}</h1>
					<p className="mt-3 text-muted-foreground">
						Your backend is configured and ready to build on.
					</p>
					<a
						href={
							workspaceId
								? `${clientEnv.DASH_URL}/${workspaceId}`
								: clientEnv.DASH_URL
						}
						className="mt-8 w-full rounded-lg bg-foreground px-6 py-3 font-medium text-background"
					>
						Enter {businessName || "workspace"}
					</a>
					<a
						href="/"
						className="mt-3 text-muted-foreground text-sm hover:text-foreground"
					>
						Or go to your account
					</a>
				</div>
			</Canvas>
		);
	}

	return (
		<Canvas
			onBack={() =>
				setStep(recommendationReason ? "ai" : recipe ? "preset" : "setup")
			}
		>
			<h1 className={heading}>Review your workspace</h1>
			<p className="mt-3 text-muted-foreground">
				Here's what gets created. Nothing is charged, and everything can change
				later.
			</p>
			{recommendationReason && (
				<p className="mt-3 max-w-2xl text-sm">{recommendationReason}</p>
			)}
			<div className="mt-8 max-w-xl rounded-xl border border-foreground/[0.08] p-6">
				<div className="flex justify-between border-b pb-3 text-sm">
					<span className="text-muted-foreground">Workspace</span>
					<span className="font-medium">{businessName}</span>
				</div>
				<div className="flex justify-between border-b py-3 text-sm">
					<span className="text-muted-foreground">Starting point</span>
					<span className="font-medium">
						{recipe?.name ?? "Sensible defaults"}
					</span>
				</div>
				<div className="pt-3">
					<p className="text-muted-foreground text-sm">Enabled modules</p>
					<div className="mt-3 flex flex-wrap gap-2">
						{moduleIds.map((id) => (
							<span
								key={id}
								className="rounded-full bg-foreground/[0.06] px-3 py-1 text-xs capitalize"
							>
								{id.replaceAll("-", " ")}
							</span>
						))}
					</div>
				</div>
			</div>
			{error && <p className="mt-4 text-destructive text-sm">{error}</p>}
			<button
				type="button"
				onClick={() => create.mutate()}
				disabled={create.isPending}
				className="mt-6 rounded-lg bg-foreground px-5 py-2.5 font-medium text-background text-sm disabled:opacity-40"
			>
				{create.isPending ? "Creating workspace…" : "Create workspace"}
			</button>
		</Canvas>
	);
}

export const Route = createFileRoute("/onboarding")({
	validateSearch: z.object({ prompt: z.string().optional() }),
	component: OnboardingPage,
});
