import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { activeOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";

/**
 * Creating an organization.
 *
 * 🔑 An organization is an ownership boundary, not a folder. Its members can
 * reach every workspace inside it, so the reason to make a second one is that
 * different people should see different businesses — which is the one thing the
 * page has to say, because nothing else on screen implies it.
 *
 * The new organization becomes active on success: creating something and being
 * left looking at the old one is how people create three by accident.
 */

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-4 text-[12.5px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] disabled:pointer-events-none disabled:opacity-40";

const field =
	"h-9 w-full rounded-full border border-[var(--console-line-strong)] bg-transparent px-3.5 text-[12.5px] text-[var(--ink-85)] outline-none transition-colors placeholder:text-[var(--ink-30)] focus:border-[rgb(var(--console-ink)/0.18)]";

function NewOrganizationPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [failure, setFailure] = useState<string | null>(null);

	const create = useMutation({
		mutationFn: async () =>
			api.request<{ id: string }>("/account/organizations", {
				method: "POST",
				body: { name: name.trim() },
			}),
		onSuccess: ({ data }) => {
			activeOrganization.write(data.id);
			queryClient.setQueryData(["account", "activeOrganization"], data.id);
			void queryClient.invalidateQueries({
				queryKey: ["account", "organizations"],
			});
			void navigate({ to: "/workspaces" });
		},
		onError: (error: { message?: string }) =>
			setFailure(error?.message ?? "That organization could not be created."),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<form
				onSubmit={(event) => {
					event.preventDefault();
					if (name.trim()) create.mutate();
				}}
				className="max-w-xl"
			>
				{failure ? (
					<p className="mb-4 text-[12px] text-[#ff6b6b]">{failure}</p>
				) : null}

				<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">
					New organization
				</p>
				<div className="border-[var(--console-line-soft)] border-t py-4">
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Kestrel Audio"
						aria-label="Organization name"
						className={field}
					/>

					{/* 🔴 The fact that decides whether somebody needs one at all. */}
					<p className="mt-3 max-w-lg text-[11.5px] text-[var(--ink-35)] leading-5">
						An organization owns workspaces, people and billing. Everyone you
						invite to it can open every workspace inside it, so keep unrelated
						businesses in separate organizations — that separation is the only
						thing keeping one team out of another&rsquo;s records.
					</p>

					<div className="mt-5 flex items-center gap-2">
						<button
							type="submit"
							disabled={!name.trim() || create.isPending}
							className={`${primaryAction} ${create.isPending ? "shimmer-busy" : ""}`}
						>
							{create.isPending ? "Creating…" : "Create organization"}
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
			</form>
		</main>
	);
}

export const Route = createFileRoute("/organizations/new")({
	component: NewOrganizationPage,
});
