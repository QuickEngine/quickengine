import { CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";
import {
	groupRecipes,
	RECIPES,
	type Recipe,
	searchRecipes,
} from "../../lib/recipes";

/**
 * Creating a workspace.
 *
 * 🔑 A workspace is one business, and the only real decision is **what kind**.
 * That choice picks the modules, so the page is a search over business types
 * rather than a module checklist — nobody starting a coffee company knows they
 * want `fulfillment` and `inventory`, they know they sell coffee.
 *
 * 🔴 Modules chosen here are a starting point, never a commitment. Every one can
 * be turned on or off afterwards from the workspace, and the page says so — a
 * setup step that feels permanent is one people abandon.
 */

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-4 text-[12.5px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] disabled:pointer-events-none disabled:opacity-40";

const field =
	"h-9 w-full rounded-full border border-[var(--console-line-strong)] bg-transparent px-3.5 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-30)] focus:border-[rgb(var(--console-ink)/0.18)]";

function NewWorkspacePage() {
	const navigate = useNavigate();
	const { active } = useActiveOrganization();
	const queryClient = useQueryClient();

	const [name, setName] = useState("");
	const [query, setQuery] = useState("");
	const [recipe, setRecipe] = useState<Recipe | null>(null);
	const [sandbox, setSandbox] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);

	const matches = useMemo(() => {
		const found = query.trim() ? searchRecipes(query) : [];
		return found.slice(0, 8);
	}, [query]);
	// Two from each category when nothing is typed: enough to show the range
	// without listing every business anybody has ever run.
	const suggestions = useMemo(
		() =>
			groupRecipes(RECIPES)
				.flatMap(([, entries]) => entries.slice(0, 2))
				.slice(0, 8),
		[],
	);

	const create = useMutation({
		mutationFn: async () =>
			api.request<{ id: string }>("/account/workspaces", {
				method: "POST",
				body: {
					name: name.trim(),
					businessType: recipe?.id ?? "custom",
					moduleIds: recipe?.modules ?? [],
					organizationId: active?.id,
					environment: sandbox ? "test" : "live",
				},
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["account", active?.id ?? "", "workspaces"],
			});
			void navigate({ to: "/workspaces" });
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That workspace could not be created."),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="max-w-xl">
				{failure ? (
					<p className="mb-4 text-[12px] text-[#ff6b6b]">{failure}</p>
				) : null}

				<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
					What is it called?
				</p>
				<div className="border-[var(--console-line-soft)] border-t py-4">
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Caffeinate"
						aria-label="Workspace name"
						className={field}
					/>
					<p className="mt-2 text-[11px] text-[var(--ink-30)]">
						The business this workspace is for. It can be renamed later.
					</p>
				</div>

				<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
					What kind of business?
				</p>
				<div className="border-[var(--console-line-soft)] border-t py-4">
					{recipe ? (
						<div className="flex items-center gap-3 rounded-lg border border-[var(--console-line-strong)] bg-[var(--console-panel)] p-3.5">
							<div className="min-w-0 flex-1">
								<p className="text-[12.5px] text-[var(--ink-90)]">
									{recipe.name}
								</p>
								<p className="mt-0.5 text-[11px] text-[var(--ink-30)]">
									{recipe.category} · starts with {recipe.modules.length}{" "}
									modules
								</p>
							</div>
							<button
								type="button"
								onClick={() => {
									setRecipe(null);
									setQuery("");
								}}
								className={quietAction}
							>
								Change
							</button>
						</div>
					) : (
						<>
							<div className="flex h-9 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 transition-colors focus-within:border-[rgb(var(--console-ink)/0.18)]">
								<MagnifyingGlassIcon
									size={14}
									className="shrink-0 text-[var(--ink-30)]"
								/>
								<input
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Coffee shop, agency, plumber, studio…"
									aria-label="Search business types"
									className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
								/>
							</div>

							<div className="mt-3 flex flex-col gap-1">
								{(query.trim() ? matches : suggestions).map((entry) => (
									<button
										key={entry.id}
										type="button"
										onClick={() => setRecipe(entry)}
										className="flex items-center gap-3 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)]"
									>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-[12.5px] text-[var(--ink-85)]">
												{entry.name}
											</span>
											<span className="mt-0.5 block truncate text-[11px] text-[var(--ink-30)]">
												{entry.category}
											</span>
										</span>
									</button>
								))}
								{query.trim() && matches.length === 0 ? (
									<p className="px-2 py-3 text-[11.5px] text-[var(--ink-30)] leading-5">
										Nothing matches that. Pick the closest one — the modules are
										a starting point, not a commitment.
									</p>
								) : null}
							</div>
						</>
					)}
				</div>

				<p className="mt-8 mb-1 text-[12.5px] text-[var(--ink-45)]">
					Is this real?
				</p>
				<div className="flex flex-wrap items-center gap-4 border-[var(--console-line-soft)] border-t py-4">
					<p className="min-w-0 flex-1 text-[11.5px] text-[var(--ink-40)] leading-5">
						{sandbox
							? "Sandbox. Nothing is charged and nothing here belongs to a live business."
							: "Live. Payments taken in this workspace are real."}
					</p>
					{/* 🔴 Decided here or not at all: the environment locks the moment a
					    workspace connects a provider, takes an order or sees a payment. */}
					<button
						type="button"
						role="switch"
						aria-checked={sandbox}
						aria-label="Environment"
						onClick={() => setSandbox((value) => !value)}
						className="relative flex h-9 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink)/0.07)] p-0.5 outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.1)]"
					>
						<span
							aria-hidden="true"
							className={`absolute top-0.5 left-0.5 h-8 w-[4.5rem] rounded-full bg-[var(--console-pop)] shadow-[0_1px_3px_rgb(0_0_0/0.28)] transition-transform duration-200 ease-out ${sandbox ? "translate-x-[4.5rem]" : "translate-x-0"}`}
						/>
						<span
							className={`relative z-10 flex h-8 w-[4.5rem] items-center justify-center text-[11.5px] ${sandbox ? "text-[var(--ink-30)]" : "text-[var(--ink-90)]"}`}
						>
							Live
						</span>
						<span
							className={`relative z-10 flex h-8 w-[4.5rem] items-center justify-center text-[11.5px] ${sandbox ? "text-[var(--ink-90)]" : "text-[var(--ink-30)]"}`}
						>
							Sandbox
						</span>
					</button>
				</div>

				{recipe ? (
					<div className="mt-6 flex flex-wrap items-center gap-3">
						<p className="min-w-0 flex-1 text-[11px] text-[var(--ink-30)] leading-4">
							Starts with {recipe.modules.length} modules turned on. Every one
							can be changed afterwards.
						</p>
						<CheckIcon size={12} className="text-transparent" />
					</div>
				) : null}

				<div className="mt-6 flex items-center gap-2">
					<button
						type="button"
						disabled={!name.trim() || !recipe || create.isPending}
						onClick={() => create.mutate()}
						className={primaryAction}
					>
						{create.isPending ? "Creating…" : "Create workspace"}
					</button>
					<button
						type="button"
						onClick={() => void navigate({ to: "/workspaces" })}
						className={quietAction}
					>
						Cancel
					</button>
				</div>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/workspaces/new")({
	component: NewWorkspacePage,
});
