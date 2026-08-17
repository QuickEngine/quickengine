import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { RequestFailure } from "../components/page-state";
import { SkeletonRows } from "../components/skeletons";
import { clientEnv } from "../lib/env";
import { quickDashQueries } from "../lib/quickdash-api";

/**
 * The workspace picker — the only QuickDash screen with no workspace.
 *
 * 🔑 Rendered OUTSIDE the console shell on purpose. Every part of that shell —
 * the switcher, the module list, the sandbox banner — describes a workspace, and
 * there is not one yet. Chrome around nothing is how a product feels broken
 * before it has done anything.
 *
 * 🔴 It does not auto-redirect to the last workspace. Somebody with a live shop
 * and a sandbox must choose deliberately; skipping the choice is how a test
 * order gets taken against the real business.
 */

const businessLabel = (value: string) =>
	value
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());

function WorkspacePicker() {
	const workspaces = useQuery(quickDashQueries.workspaces());
	const [query, setQuery] = useState("");

	const all = workspaces.data?.items ?? [];
	const needle = query.trim().toLowerCase();
	const visible = all.filter((workspace) =>
		needle
			? `${workspace.name} ${workspace.businessType}`
					.toLowerCase()
					.includes(needle)
			: true,
	);

	return (
		<main className="flex min-h-svh items-center justify-center bg-[var(--console-bg)] px-5 py-16 text-[var(--ink-90)]">
			<div className="w-full max-w-md">
				<p className="text-[13px] text-[var(--ink-85)]">QuickDash</p>
				<p className="mt-1 text-[11.5px] text-[var(--ink-30)]">
					{all.length > 1
						? "Choose which business you are working in."
						: "Open your business."}
				</p>

				{/* Only once the list is long enough to search. A filter over three rows
				    is furniture. */}
				{all.length > 6 ? (
					<div className="mt-5 flex h-9 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 transition-colors focus-within:border-[rgb(var(--console-ink)/0.18)]">
						<MagnifyingGlassIcon
							size={14}
							className="shrink-0 text-[var(--ink-30)]"
						/>
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Find a workspace"
							className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-85)] outline-none placeholder:text-[var(--ink-30)]"
						/>
					</div>
				) : null}

				<div className="mt-5">
					{workspaces.isPending ? (
						<SkeletonRows rows={3} />
					) : workspaces.isError ? (
						<RequestFailure
							error={workspaces.error}
							onRetry={() => {
								void workspaces.refetch();
							}}
						/>
					) : all.length === 0 ? (
						<div className="rounded-lg border border-[var(--console-line-strong)] p-5">
							<p className="text-[12.5px] text-[var(--ink-85)]">
								No workspaces yet
							</p>
							<p className="mt-1.5 text-[11.5px] text-[var(--ink-35)] leading-5">
								A workspace is one business: its records, its modules and its
								own API credentials. They are created in your account.
							</p>
							<a
								href={`${clientEnv.ACCOUNT_URL}/workspaces/new`}
								className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-[rgb(var(--console-ink))] px-4 text-[12.5px] text-[var(--console-pop)] transition-opacity hover:opacity-85"
							>
								Create a workspace
							</a>
						</div>
					) : visible.length === 0 ? (
						<p className="py-6 text-[12px] text-[var(--ink-30)]">
							Nothing matches that.
						</p>
					) : (
						<div className="flex flex-col gap-2">
							{visible.map((workspace) => (
								<Link
									key={workspace.id}
									to="/$workspace"
									// Slug where there is one; the id remains a valid address for a
									// workspace that never got one.
									params={{ workspace: workspace.slug ?? workspace.id }}
									className="group flex items-center gap-3 rounded-lg border border-[var(--console-line-strong)] bg-[var(--console-panel)] p-3.5 outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)]"
								>
									<span
										aria-hidden="true"
										className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--console-ink)/0.07)] text-[12px] text-[var(--ink-50)]"
									>
										{workspace.name.trim().charAt(0).toUpperCase() || "?"}
									</span>
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-2">
											<span className="min-w-0 truncate text-[12.5px] text-[var(--ink-90)]">
												{workspace.name}
											</span>
											{/* The one thing worth knowing BEFORE you go in. */}
											{workspace.environment === "test" ? (
												<span className="shrink-0 rounded-[3px] bg-[#f5a623]/[0.14] px-1.5 py-0.5 font-medium text-[9px] text-[#f5b44a] uppercase tracking-[0.09em]">
													Sandbox
												</span>
											) : null}
										</span>
										<span className="mt-0.5 block truncate text-[11px] text-[var(--ink-30)]">
											{businessLabel(workspace.businessType)}
										</span>
									</span>
								</Link>
							))}
						</div>
					)}
				</div>
				<a
					href={clientEnv.ACCOUNT_URL}
					className="mt-3 inline-flex text-[11.5px] text-[var(--ink-30)] transition-colors hover:text-[var(--ink-75)]"
				>
					Manage workspaces in your account
				</a>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/")({ component: WorkspacePicker });
