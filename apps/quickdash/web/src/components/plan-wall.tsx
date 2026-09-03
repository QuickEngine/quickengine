import { useQuery } from "@tanstack/react-query";
import { useParams, useRouteContext } from "@tanstack/react-router";
import { clientEnv } from "../lib/env";
import { quickDashQueries } from "../lib/quickdash-api";

/**
 * You have outgrown your plan.
 *
 * ── Why this is not an error screen ──────────────────────────────────────────
 *
 * 🔴 A 402 was rendering the same card as a 500: a refusal, a request id, and a
 * Try again that could never work. So the console answered a customer asking to
 * use MORE of the product — the most welcome sentence a business can hear —
 * with an apology and a dead end.
 *
 * 🔑 Hard rule 4 bans THIRD-PARTY advertising and explicitly does not cover
 * this: "telling your own users what your own product can do is the product".
 * That rule has already caused one screen — the disabled-module wall — to be
 * built as a dead end on the mistaken reading that offering an upgrade was
 * advertising. This is the same mistake in a different place, and this time it
 * sits on the exact moment somebody is trying to give us money.
 *
 * ── Why a dialog, when 403 and 404 are not ───────────────────────────────────
 *
 * Those two are absences: the page is gone, or was never yours, and there is
 * nothing behind a modal to return to. This is different — the workspace behind
 * is entirely real and entirely yours, and one thing in it has hit a ceiling.
 * Blurring it is the argument: that is your console, working, and there is more
 * of it.
 */
export function PlanWall({ detail }: { detail: string }) {
	const params = useParams({ strict: false }) as { workspace?: string };
	const routeContext = useRouteContext({ strict: false }) as {
		workspaceId?: string;
	};
	const context = useQuery({
		...quickDashQueries.context(routeContext?.workspaceId ?? ""),
		enabled: Boolean(routeContext?.workspaceId),
	});
	const plan = useQuery(
		quickDashQueries.plan(context.data?.workspace.organizationId),
	);

	return (
		<div
			role="dialog"
			aria-modal="true"
			className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(0_0_0/0.35)] px-5 backdrop-blur-[3px]"
		>
			<div className="w-full max-w-[27rem] overflow-hidden rounded-xl bg-[var(--console-card)] shadow-[var(--lift-panel)]">
				{/**
				 * 🔑 A picture belongs here, and there is not one yet.
				 *
				 * This is the one screen in the console whose job is to make
				 * somebody WANT something, and text alone cannot do that — every
				 * upgrade prompt worth copying shows the thing you would be
				 * getting. So the slot is built at the right size and left
				 * honest: a plain surface with a label, not a stock photograph or
				 * a fake chart standing in for a real one.
				 *
				 * ⚠️ Replace with a real image per plan when the art exists.
				 * 16:9 at 432px wide, so a 864×486 asset covers retina.
				 */}
				<div className="flex aspect-[16/9] w-full items-center justify-center border-[var(--console-line)] border-b bg-[rgb(var(--console-ink)/0.04)]">
					<span className="text-[10.5px] text-[var(--ink-25)] uppercase tracking-[0.12em]">
						Image
					</span>
				</div>

				<div className="p-6">
					{/* 🔑 Friendly, and about THEM. "Your plan's allowance is used up"
				    is an accountant's sentence: it leads with the limit and makes
				    growth sound like a mistake somebody made. Hitting a ceiling
				    means the business is working. Say that first. */}
					<p className="text-[19px] text-[var(--ink-90)] leading-6">
						You’ve outgrown this plan
					</p>
					<p className="mt-2 text-[12px] text-[var(--ink-45)] leading-[1.65]">
						{detail}
					</p>

					{/* ⚠️ Three plain facts, not a feature grid. A grid here would be a
				    pricing page badly redrawn at 27rem, and the real pricing page
				    is one button away. These answer the only questions somebody
				    has in this moment: does it cost me anything to look, does it
				    break what I have, and can I undo it. */}
					<ul className="mt-4 flex flex-col gap-1.5">
						{[
							"Everything you have set up stays exactly as it is.",
							"The limit lifts the moment the plan changes.",
							"You can move back down whenever you like.",
						].map((line) => (
							<li
								key={line}
								className="flex items-start gap-2 text-[11.5px] text-[var(--ink-55)] leading-5"
							>
								<span
									aria-hidden="true"
									className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--signal-success)]"
								/>
								{line}
							</li>
						))}
					</ul>

					{/* Says where they are before offering where they could be. An
				    upgrade prompt that cannot name your current plan reads as a
				    generic upsell rather than an answer about your account. */}
					{plan.data?.planId ? (
						<p className="mt-4 rounded-md bg-[rgb(var(--console-ink)/0.035)] px-2.5 py-2 text-[11.5px] text-[var(--ink-45)]">
							This workspace is on{" "}
							<span className="text-[var(--ink-80)] capitalize">
								{plan.data.planId}
							</span>
							.
						</p>
					) : null}

					<div className="mt-5 flex flex-wrap items-center gap-2">
						<a
							href={`${clientEnv.ACCOUNT_URL}/billing`}
							className="inline-flex h-8 items-center rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] no-underline transition-opacity hover:opacity-90"
						>
							See what’s included
						</a>
						{/* ⚠️ A real way out, not just the browser's back button.
					    Somebody who does not want to upgrade still has a console to
					    use, and an offer you cannot decline is not an offer. */}
						<a
							href={
								params.workspace
									? `/${encodeURIComponent(params.workspace)}`
									: "/"
							}
							className="inline-flex h-8 items-center rounded-md border border-[var(--console-line-strong)] px-3 text-[12px] text-[var(--ink-60)] no-underline transition-colors hover:text-[var(--ink-90)]"
						>
							Not now
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
