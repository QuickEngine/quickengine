import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@quickengine/ui/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { useState } from "react";
import type { AuditEntry } from "../lib/account-api";
import { accountQueries, useActiveOrganization } from "../lib/account-api";

/**
 * Activity → Audit log. Who changed access, billing or workspaces.
 *
 * 🔴 Not the same thing as the workspace activity feed on Overview. That is the
 * business doing business — orders placed, payments settled. This is the control
 * plane: somebody granting a permission, removing a member, revoking a key. The
 * two have different readers and different consequences, which is why they are
 * different pages.
 *
 * Every entry carries its **request id**, because the only useful answer to
 * "what happened here" is one you can follow into every other record of the same
 * request.
 */

const filterTrigger =
	"flex h-8 shrink-0 items-center gap-2 rounded-full border border-[var(--console-line-strong)] px-3 text-[12px] text-[var(--ink-50)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.04)] hover:text-[var(--ink-85)] data-[state=open]:bg-[rgb(var(--console-ink)/0.04)]";

/** `member.role_changed` → `Member role changed`. Generic on purpose: a new
 * audited action reads correctly the day it ships. */
const actionLabel = (action: string) => {
	const words = action.replace(/[._]/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
};

const when = (value: string) => {
	const elapsed = Date.now() - new Date(value).getTime();
	const minutes = Math.round(elapsed / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(value));
};

/** The dimensions recorded alongside an entry — a role name, a capability count.
 * Never a secret, never a customer record. */
const details = (entry: AuditEntry) =>
	Object.entries(entry.metadata)
		.filter(([, value]) => value !== null && value !== -1)
		.map(([key, value]) => `${key.replace(/[._]/g, " ")} ${value}`)
		.join(" · ");

function ActivityPage() {
	const { active } = useActiveOrganization();
	const matches = useMatches();
	const [action, setAction] = useState<string | undefined>(undefined);
	const audit = useQuery(accountQueries.audit(active?.id ?? "", action));

	if (
		matches.some(
			(match) =>
				match.routeId !== "/activity" && match.routeId.startsWith("/activity/"),
		)
	) {
		return <Outlet />;
	}

	const entries = audit.data?.items ?? [];

	return (
		<main className="min-h-full bg-[var(--console-bg)] px-5 py-5">
			<div className="mb-3 flex items-center justify-between gap-4">
				<p className="max-w-2xl text-[11.5px] text-[var(--ink-30)] leading-5">
					Changes to who can do what, what is paid for, and which workspaces
					exist. Business records live in each workspace's own activity.
				</p>

				<Popover>
					<PopoverTrigger className={filterTrigger}>
						{action ? actionLabel(action) : "All actions"}
						<CaretDownIcon size={11} className="text-[var(--ink-30)]" />
					</PopoverTrigger>
					<PopoverContent
						side="bottom"
						align="end"
						sideOffset={6}
						aria-label="Filter by action"
						className="max-h-72 w-60 overflow-y-auto rounded-lg border-[var(--console-line-strong)] bg-[var(--console-pop)] p-1.5 shadow-2xl"
					>
						<button
							type="button"
							onClick={() => setAction(undefined)}
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--ink-75)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)]"
						>
							<span className="min-w-0 flex-1">All actions</span>
							{action ? null : (
								<CheckIcon size={12} className="text-[var(--ink-45)]" />
							)}
						</button>
						{(audit.data?.actions ?? []).map((option) => (
							<button
								key={option}
								type="button"
								onClick={() => setAction(option)}
								className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--ink-75)] outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)]"
							>
								<span className="min-w-0 flex-1 truncate">
									{actionLabel(option)}
								</span>
								{action === option ? (
									<CheckIcon size={12} className="text-[var(--ink-45)]" />
								) : null}
							</button>
						))}
					</PopoverContent>
				</Popover>
			</div>

			{audit.isPending ? (
				<p className="text-[12px] text-[var(--ink-30)]">Loading activity…</p>
			) : audit.isError ? (
				<p className="text-[12px] text-[var(--ink-45)]">
					Activity did not load.
				</p>
			) : entries.length === 0 ? (
				<p className="py-6 text-[12px] text-[var(--ink-30)]">
					{action
						? "Nothing recorded for that action."
						: "Nothing has changed yet. Roles, members, keys and workspaces are recorded here as they change."}
				</p>
			) : (
				<div className="divide-y divide-[var(--console-line-soft)] border-[var(--console-line-soft)] border-t">
					{entries.map((entry) => (
						<div key={entry.id} className="flex flex-wrap gap-x-4 gap-y-1 py-3">
							<div className="min-w-0 flex-1">
								<p className="truncate text-[12.5px] text-[var(--ink-85)]">
									{actionLabel(entry.action)}
									{details(entry) ? (
										<span className="text-[var(--ink-30)]">
											{" · "}
											{details(entry)}
										</span>
									) : null}
								</p>
								<p className="mt-0.5 truncate text-[11px] text-[var(--ink-30)]">
									{/* An API key has no person behind it, and saying so is the
									    point of recording the actor type at all. */}
									{entry.actorName ??
										entry.actorEmail ??
										(entry.actorType === "api_key"
											? "an API key"
											: entry.actorId)}
									{" · "}
									{entry.resourceType}
								</p>
							</div>
							<div className="flex shrink-0 items-baseline gap-4">
								<p className="font-mono text-[10px] text-[var(--ink-25)]">
									{entry.requestId}
								</p>
								<p className="w-24 text-right text-[11px] text-[var(--ink-30)]">
									{when(entry.occurredAt)}
								</p>
							</div>
						</div>
					))}
				</div>
			)}
		</main>
	);
}

export const Route = createFileRoute("/activity")({ component: ActivityPage });
