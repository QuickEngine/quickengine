import {
	ArrowLeft,
	Check,
	CircleNotch,
	Lock,
	SlidersHorizontal,
	Sparkle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { api } from "../lib/api";
import { clientEnv } from "../lib/env";
import { FOUNDATION, moduleIcon } from "../lib/modules";
import { findRecipe, RECIPES, type Recipe } from "../lib/recipes";

type Step = "name" | "setup" | "ai" | "modules" | "review" | "success";
type SetupChoice = "ai" | "manual" | "defaults";
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
	const [step, setStep] = useState<Step>("name");
	const [businessName, setBusinessName] = useState("");
	const [recipe, setRecipe] = useState<Recipe | null>(null);
	const [setupChoice, setSetupChoice] = useState<SetupChoice | null>(null);
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
	const startManual = () => {
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
					This names your organisation and your first workspace. You can rename
					either later.
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
					<button type="button" onClick={() => setStep("ai")} className={panel}>
						<Sparkle className="size-6" />
						<p className="mt-4 text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
							Recommended
						</p>
						<h2 className="mt-1 font-medium">Ask AI</h2>
						<p className="mt-1 max-w-md text-muted-foreground text-sm">
							Describe what you do in your own words. We’ll recommend modules
							for you to review.
						</p>
					</button>
					<button type="button" onClick={startManual} className={panel}>
						<SlidersHorizontal className="size-6" />
						<h2 className="mt-4 font-medium">Build it myself</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Choose the capabilities you need and shape the workspace yourself.
						</p>
					</button>
				</div>
				<button
					type="button"
					onClick={useDefaults}
					className="mt-6 w-fit text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
				>
					Start with defaults
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
						onClick={startManual}
						className="text-muted-foreground hover:text-foreground"
					>
						Build it myself
					</button>
					<button
						type="button"
						onClick={useDefaults}
						className="text-muted-foreground hover:text-foreground"
					>
						Start with defaults
					</button>
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
				setStep(
					setupChoice === "ai"
						? "ai"
						: setupChoice === "manual"
							? "modules"
							: "setup",
				)
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
						{setupChoice === "manual"
							? "Built by you"
							: (recipe?.name ?? "QuickDash defaults")}
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
