import { ConsoleTheme } from "@quickengine/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { sessionApi } from "../../lib/api";
import { quickDashQueries } from "../../lib/quickdash-api";
import { WriteFailure } from "../page-state";
import { Group, ReadOnly, Row, SaveButton, Segments } from "./controls";

/**
 * The two workspace settings that needed no new backend at all.
 *
 * 🔴 Both endpoints have existed the whole time with nothing calling them.
 * `PATCH /account/workspaces/:id` renames a workspace and was reachable only
 * from the Account app; `/account/plan` has always returned every meter with
 * its limit, and the type admitted it only recently — so the one number that
 * makes an honest upgrade prompt possible was being fetched and thrown away.
 */

export function WorkspaceGeneral({
	workspaceId,
	name,
	organizationId,
	environment,
	apiUrl,
}: {
	workspaceId: string;
	name: string;
	/**
	 * 🔴 Renaming and switching mode are ACCOUNT routes, and that boundary
	 * resolves which organization you are acting in from `?organizationId=` — a
	 * person can belong to several, so there is no implicit current one.
	 * Omitting it is a 400 that reads as the form being broken.
	 */
	organizationId: string | null | undefined;
	environment: "test" | "live";
	apiUrl: string;
}) {
	const queryClient = useQueryClient();
	const org = encodeURIComponent(organizationId ?? "");
	const [draft, setDraft] = useState(name);
	/**
	 * 🔴 The ERROR, not `error.message`.
	 *
	 * A string threw away the status and the request id at the moment the
	 * failure arrived, so a 500 printed a raw `HTTP 500` and support had
	 * nothing to trace. `fallback` survives because the per-action wording is
	 * better than anything a generic handler could produce.
	 */
	const [failure, setFailure] = useState<{
		error: unknown;
		fallback: string;
	} | null>(null);
	const [saved, setSaved] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: seed from the workspace, not from typing
	useEffect(() => {
		setDraft(name);
	}, [workspaceId]);

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "context"],
			}),
			queryClient.invalidateQueries({ queryKey: ["quickdash", "workspaces"] }),
		]);

	const rename = useMutation({
		mutationFn: async () => {
			await sessionApi.request(
				`/account/workspaces/${workspaceId}?organizationId=${org}`,
				{ method: "PATCH", body: { name: draft.trim() } },
			);
		},
		onMutate: () => {
			setFailure(null);
			setSaved(false);
		},
		onError: (error: { message?: string }) =>
			setFailure({ error: error, fallback: "That name did not save." }),
		onSuccess: async () => {
			setSaved(true);
			await refresh();
		},
	});

	const setEnvironment = useMutation({
		mutationFn: async (next: "test" | "live") => {
			await sessionApi.request(
				`/account/workspaces/${workspaceId}/environment?organizationId=${org}`,
				{ method: "PATCH", body: { environment: next } },
			);
		},
		onMutate: () => setFailure(null),
		onError: (error: { message?: string }) =>
			setFailure({
				error,
				fallback: "The mode locks once a workspace has taken a payment.",
			}),
		onSuccess: refresh,
	});

	const changed = draft.trim() !== name && draft.trim().length > 0;

	return (
		<div className="flex flex-col gap-8">
			{/* 🔑 Only the NAME needs saving. Appearance and mode apply the moment
			    they are pressed, because a switch that needs confirming reads as
			    broken — you flip it and nothing happens. */}
			<SaveButton
				disabled={!changed}
				busy={rename.isPending}
				saved={saved}
				onSave={() => rename.mutate()}
			/>
			{failure ? (
				<WriteFailure error={failure.error} message={failure.fallback} />
			) : null}

			<Group title="Workspace">
				<Row
					label="Name"
					description="What this business is called everywhere in QuickDash. The web address does not change."
				>
					<input
						value={draft}
						maxLength={120}
						aria-label="Workspace name"
						onChange={(event) => {
							setDraft(event.target.value);
							setSaved(false);
						}}
						className="h-8 w-[15rem] max-w-full field rounded-md px-2.5 text-[12px] text-[var(--ink-85)] outline-none transition-colors"
					/>
				</Row>
				<Row
					label="Workspace ID"
					description="What the API knows this workspace by."
				>
					<ReadOnly value={workspaceId} />
				</Row>
				<Row
					label="API address"
					description="Where your own site sends its requests."
				>
					<ReadOnly value={apiUrl} />
				</Row>
			</Group>

			<Group title="Preferences">
				<Row
					label="Appearance"
					description="Applies to you everywhere, QuickDash, Account and the sign-in screens."
				>
					{/* 🔴 The console's own control, not a copy. Two lists of themes are two
					    chances to disagree about what exists. */}
					<ConsoleTheme />
				</Row>
				<Row
					label="Mode"
					/* 🔴 The one setting on this page that can cost real money. */
					description="Sandbox takes test cards and charges nobody. Locks as soon as this workspace connects a provider, takes an order or receives a payment."
				>
					<Segments
						label="Mode"
						value={environment}
						onChange={(next) => setEnvironment.mutate(next as "test" | "live")}
						options={[
							{ value: "live", label: "Live" },
							{ value: "test", label: "Sandbox" },
						]}
					/>
				</Row>
			</Group>
		</div>
	);
}

/** What a meter is called in words somebody recognises. */
const METER_LABELS: Readonly<Record<string, string>> = {
	api_requests: "API requests",
	storage_bytes: "Storage",
	emails_sent: "Emails sent",
	sms_sent: "Text messages",
	ai_tokens: "AI usage",
	conversions: "File conversions",
	automations_run: "Automations run",
};

function amount(meter: string, value: number): string {
	if (meter === "storage_bytes") {
		const mb = value / 1_000_000;
		return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
	}
	return value.toLocaleString();
}

export function WorkspaceUsage({
	organizationId,
}: {
	organizationId: string | null | undefined;
}) {
	const plan = useQuery(quickDashQueries.plan(organizationId));
	const meters = Object.values(plan.data?.usage ?? {});

	if (plan.isPending) {
		return <p className="text-[12px] text-[var(--ink-30)]">Checking…</p>;
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
				{/* 🔑 Here so nobody has to leave a workspace to answer "how much is
				    left". It is the same figure Account shows, from the same call. */}
				What this account has used this period, on the{" "}
				<span className="text-[var(--ink-70)]">{plan.data?.planId ?? "-"}</span>{" "}
				plan.
			</p>

			{meters.length === 0 ? (
				<p className="text-[11.5px] text-[var(--ink-35)] leading-5">
					Nothing metered yet. Usage appears once this workspace starts making
					requests, storing files or sending email.
				</p>
			) : (
				<Group title="This period">
					{meters.map((meter) => {
						const used = meter.used ?? 0;
						const limit = meter.limit;
						// A meter with no limit is unlimited — a bar would imply a wall.
						const portion =
							limit && limit > 0 ? Math.min(1, used / limit) : null;
						return (
							/**
							 * 🔑 Three parts, not two: what it is, how full it is, and the
							 * number. A meter is the one setting whose VALUE is a shape —
							 * the bar carries "am I nearly out" at a glance and the figure
							 * answers "by how much", so the bar takes the slack in the
							 * middle rather than being squeezed into a control column.
							 */
							<div key={meter.meter} className="flex items-center gap-6 py-4">
								<div className="w-[11rem] shrink-0">
									<p className="text-[12.5px] text-[var(--ink-85)]">
										{METER_LABELS[meter.meter] ?? meter.meter}
									</p>
									<p className="mt-0.5 text-[11px] text-[var(--ink-30)]">
										{limit
											? `of ${amount(meter.meter, limit)}`
											: "No limit on this plan"}
									</p>
								</div>
								<div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[rgb(var(--console-ink)/0.08)]">
									{portion !== null ? (
										<div
											className="h-full rounded-full transition-[width]"
											style={{
												width: `${Math.round(portion * 100)}%`,
												background: meter.exceeded
													? "var(--signal-attention)"
													: "rgb(var(--console-ink) / 0.5)",
											}}
										/>
									) : null}
								</div>
								<span
									className={`w-[7rem] shrink-0 text-right text-[12px] tabular-nums ${
										meter.exceeded
											? "text-[var(--signal-attention-text)]"
											: "text-[var(--ink-60)]"
									}`}
								>
									{portion !== null
										? `${Math.round(portion * 100)}% used`
										: amount(meter.meter, used)}
								</span>
							</div>
						);
					})}
				</Group>
			)}
		</div>
	);
}
