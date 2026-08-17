import { CheckIcon, WarningIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { sessionApi } from "../lib/api";
import { clientEnv } from "../lib/env";
import { quickDashQueries } from "../lib/quickdash-api";

/**
 * Workspace settings.
 *
 * 🔑 Only what QuickDash owns lives here. Anything Account owns — people,
 * billing, deleting the workspace — is a deep link, because two places to change
 * one setting is two places to disagree about it.
 */

const primaryAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-40";

const quietAction =
	"inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--console-line-strong)] px-4 text-[12.5px] text-[var(--ink-60)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.06)] hover:text-[var(--ink-90)] disabled:pointer-events-none disabled:opacity-40";

function SettingsPage() {
	const { workspaceId: workspace } = Route.useRouteContext();
	const context = useQuery(quickDashQueries.context(workspace));
	const queryClient = useQueryClient();
	const [failure, setFailure] = useState<string | null>(null);

	const current = context.data?.workspace;
	const organizationId = current?.organizationId ?? "";
	const sandbox = current?.environment === "test";

	const setEnvironment = useMutation({
		mutationFn: async (environment: "test" | "live") =>
			sessionApi.request(
				`/account/workspaces/${workspace}/environment?organizationId=${encodeURIComponent(organizationId)}`,
				{ method: "PATCH", body: { environment } },
			),
		onSuccess: () => {
			setFailure(null);
			void queryClient.invalidateQueries({
				queryKey: ["quickdash", workspace, "context"],
			});
		},
		// 🔴 The refusal is the interesting case, and its message is the rule:
		// the environment locks once the workspace has a payment account, an order
		// or a payment. Showing it verbatim teaches that; a generic failure does
		// not.
		onError: (error: { message?: string }) =>
			setFailure(
				error?.message ??
					"That could not be changed. This workspace has already taken payments.",
			),
	});

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			{failure ? (
				<div className="mb-6 flex max-w-2xl items-start gap-2.5 rounded-lg border border-[#f5a623]/30 bg-[#f5a623]/[0.06] p-3.5">
					<WarningIcon
						size={14}
						className="mt-0.5 shrink-0 text-[#f5b44a]"
						weight="fill"
					/>
					<div>
						<p className="text-[12px] text-[#f5b44a]">{failure}</p>
						<p className="mt-1.5 text-[11.5px] text-[var(--ink-40)] leading-5">
							Create a separate sandbox workspace instead — it gets its own
							records, API keys and payment provider, and nothing in it can
							touch this business.
						</p>
						<a
							href={`${clientEnv.ACCOUNT_URL}/workspaces/new`}
							className={`${quietAction} mt-3`}
						>
							New sandbox workspace
						</a>
					</div>
				</div>
			) : null}

			<p className="mb-1 text-[12.5px] text-[var(--ink-45)]">Environment</p>
			<div className="max-w-2xl border-[var(--console-line-soft)] border-t py-4">
				<div className="flex flex-wrap items-center gap-4">
					<div className="min-w-0 flex-1">
						<p className="text-[12.5px] text-[var(--ink-85)]">
							{sandbox ? "Sandbox" : "Live"}
						</p>
						<p className="mt-1 text-[11.5px] text-[var(--ink-35)] leading-5">
							{sandbox
								? "Nothing here is real. Payments are not charged, and these records do not belong to your live business."
								: "Real money and real customers. Payments taken here are charged."}
						</p>
					</div>

					{/* One switch, two labelled ends — the same control as the view
					    toggle, because it is the same kind of decision. */}
					<button
						type="button"
						role="switch"
						aria-checked={sandbox}
						aria-label={`Environment: ${sandbox ? "sandbox" : "live"}`}
						disabled={setEnvironment.isPending || !organizationId}
						onClick={() => setEnvironment.mutate(sandbox ? "live" : "test")}
						className="relative flex h-9 shrink-0 items-center rounded-full bg-[rgb(var(--console-ink)/0.07)] p-0.5 outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.1)] disabled:opacity-40"
					>
						<span
							aria-hidden="true"
							className={`absolute top-0.5 left-0.5 h-8 w-[4.5rem] rounded-full bg-[var(--console-pop)] shadow-[0_1px_3px_rgb(0_0_0/0.28)] transition-transform duration-200 ease-out ${
								sandbox ? "translate-x-[4.5rem]" : "translate-x-0"
							}`}
						/>
						<span
							className={`relative z-10 flex h-8 w-[4.5rem] items-center justify-center text-[11.5px] transition-colors ${sandbox ? "text-[var(--ink-30)]" : "text-[var(--ink-90)]"}`}
						>
							Live
						</span>
						<span
							className={`relative z-10 flex h-8 w-[4.5rem] items-center justify-center text-[11.5px] transition-colors ${sandbox ? "text-[var(--ink-90)]" : "text-[var(--ink-30)]"}`}
						>
							Sandbox
						</span>
					</button>
				</div>

				{/* ⚠️ Stated before it is attempted, not after the refusal. */}
				<p className="mt-4 text-[11px] text-[var(--ink-30)] leading-5">
					The environment locks as soon as a workspace connects a payment
					provider, takes an order, or receives a payment — switching afterwards
					would leave real money in a workspace labelled sandbox. Run parallel
					sandboxes as separate workspaces instead; each has its own records,
					keys and provider.
				</p>
			</div>

			<p className="mt-9 mb-1 text-[12.5px] text-[var(--ink-45)]">
				Managed in Account
			</p>
			<div className="max-w-2xl divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
				{[
					[
						"Name and modules",
						`/workspaces`,
						"What this workspace is and what it can do.",
					],
					[
						"People and roles",
						"/team",
						"Who can open this workspace, and what they may change.",
					],
					[
						"Billing and usage",
						"/billing",
						"The plan this workspace counts against.",
					],
				].map(([label, path, detail]) => (
					<a
						key={path}
						href={`${clientEnv.ACCOUNT_URL}${path}`}
						className="flex items-center gap-4 py-3 outline-none transition-colors hover:text-[var(--ink-90)]"
					>
						<div className="min-w-0 flex-1">
							<p className="text-[12.5px] text-[var(--ink-75)]">{label}</p>
							<p className="mt-0.5 text-[11px] text-[var(--ink-30)]">
								{detail}
							</p>
						</div>
						<CheckIcon size={12} className="shrink-0 text-transparent" />
					</a>
				))}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/$workspace/settings")({
	component: SettingsPage,
});
